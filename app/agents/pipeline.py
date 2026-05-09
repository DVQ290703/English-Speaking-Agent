from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode

from app.agents.tools.flashcard_tools import FLASHCARD_TOOLS
from app.core.logger import logger
from app.services.elevenlabs_tts import ElevenLabsTTS
from app.services.groq_llm import GroqLLMService
from app.agents.state import AgentState

_TOOL_CALL_CAP = 5


def _route_after_respond(state: AgentState) -> str:
    last = state["messages"][-1] if state.get("messages") else None
    if last and getattr(last, "tool_calls", None):
        if state.get("_tool_call_iterations", 0) >= _TOOL_CALL_CAP:
            logger.warning("respond_node tool_call_loop_cap_reached iterations=%d, forcing tts", _TOOL_CALL_CAP)
            return "tts"
        return "tools"
    return "tts"


class VoiceAgentPipeline:
    """Coordinate the LLM and text-to-speech steps for one voice chat turn."""

    def __init__(self, llm_service: GroqLLMService, tts_service: ElevenLabsTTS):
        self.llm_service = llm_service
        self.tts_service = tts_service
        self.app = self._build_graph()

    def _respond_node(self, state: AgentState) -> AgentState:
        """Generate the assistant response, invoking tools if the LLM requests them."""
        iterations = state.get("_tool_call_iterations", 0)
        logger.debug("respond_node start input_length=%d tool_iterations=%d", len(state["user_input"]), iterations)

        # Build message list from history + any prior tool messages in this turn
        from app.prompts.prompt_builder import build_system_prompt
        from app.services.groq_llm import SYSTEM_PROMPT

        dynamic_prompt = build_system_prompt(
            category=state.get("category"),
            topic=state.get("topic"),
        )
        messages_to_send: list = [SystemMessage(content=dynamic_prompt or SYSTEM_PROMPT)]

        for line in state.get("history", [])[-8:]:
            if line.startswith("User:"):
                messages_to_send.append(HumanMessage(content=line[5:].strip()))
            elif line.startswith("Assistant:"):
                messages_to_send.append(AIMessage(content=line[10:].strip()))

        messages_to_send.append(HumanMessage(content=state["user_input"]))

        # Append any ToolMessages from previous iterations in this turn
        if state.get("messages"):
            messages_to_send.extend(state["messages"])

        ai_msg: AIMessage = self.llm_service.tool_client.invoke(messages_to_send)

        if ai_msg.tool_calls:
            tool_names = [tc["name"] for tc in ai_msg.tool_calls]
            logger.info(
                "respond_node tool_calls_detected count=%d tools=%s iteration=%d",
                len(ai_msg.tool_calls),
                tool_names,
                iterations + 1,
            )
            return {
                **state,
                "messages": [ai_msg],
                "_tool_call_iterations": iterations + 1,
                "response_text": state.get("response_text", ""),
            }

        # No tool calls — final response
        response_text = ai_msg.content or ""
        logger.debug("respond_node done response_length=%d", len(response_text))
        history = state.get("history", []) + [
            f"User: {state['user_input']}",
            f"Assistant: {response_text}",
        ]
        return {
            **state,
            "response_text": response_text,
            "history": history,
            "grammar_json": None,
            "messages": [ai_msg],
            "_tool_call_iterations": iterations,
        }

    def _tts_node(self, state: AgentState) -> AgentState:
        """Convert the generated reply into speech and store the raw bytes in state."""
        logger.debug("tts_node start text_length=%d", len(state["response_text"]))
        audio_bytes = self.tts_service.convert_text_to_speech(
            state["response_text"],
            voice_gender=state.get("voice_gender"),
        )
        logger.debug("tts_node done audio_bytes=%d", len(audio_bytes))
        return {**state, "audio_bytes": audio_bytes}

    def _build_graph(self):
        tool_node = ToolNode(FLASHCARD_TOOLS)
        graph = StateGraph(AgentState)
        graph.add_node("respond", self._respond_node)
        graph.add_node("tools", tool_node)
        graph.add_node("tts", self._tts_node)
        graph.set_entry_point("respond")
        graph.add_conditional_edges("respond", _route_after_respond, {"tools": "tools", "tts": "tts"})
        graph.add_edge("tools", "respond")
        graph.add_edge("tts", END)
        logger.debug("pipeline graph built nodes=[respond, tools, tts]")
        return graph.compile()

    def run(
        self,
        user_input: str,
        history: list[str] | None = None,
        voice_gender: str | None = None,
        category: str | None = None,
        topic: str | None = None,
    ) -> AgentState:
        """Execute the pipeline for a single user message and return the final state."""
        initial_state: AgentState = {
            "user_input": user_input,
            "response_text": "",
            "audio_bytes": b"",
            "history": history or [],
            "voice_gender": voice_gender,
            "grammar_json": None,
            "category": category,
            "topic": topic,
            "messages": [],
            "_tool_call_iterations": 0,
        }
        return self.app.invoke(initial_state)
