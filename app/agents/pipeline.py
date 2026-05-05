from langgraph.graph import END, StateGraph

from app.core.logger import logger
from app.services.elevenlabs_tts import ElevenLabsTTS
from app.services.groq_llm import GroqLLMService
from app.agents.state import AgentState


class VoiceAgentPipeline:
    """Coordinate the LLM and text-to-speech steps for one voice chat turn."""

    def __init__(self, llm_service: GroqLLMService, tts_service: ElevenLabsTTS):
        self.llm_service = llm_service
        self.tts_service = tts_service
        self.app = self._build_graph()

    def _respond_node(self, state: AgentState) -> AgentState:
        """Generate the assistant response with grammar analysis."""
        logger.debug("respond_node start input_length=%d", len(state["user_input"]))
        response_text, grammar_json = self.llm_service.generate_response_with_grammar(
            user_input=state["user_input"],
            history=state.get("history", []),
        )
        logger.debug("respond_node done response_length=%d grammar_present=%s", len(response_text), grammar_json is not None)
        history = state.get("history", []) + [
            f"User: {state['user_input']}",
            f"Assistant: {response_text}",
        ]
        return {**state, "response_text": response_text, "history": history, "grammar_json": grammar_json}

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
        graph = StateGraph(AgentState)
        graph.add_node("respond", self._respond_node)
        graph.add_node("tts", self._tts_node)
        graph.set_entry_point("respond")
        graph.add_edge("respond", "tts")
        graph.add_edge("tts", END)
        return graph.compile()

    def run(
        self,
        user_input: str,
        history: list[str] | None = None,
        voice_gender: str | None = None,
    ) -> AgentState:
        """Execute the pipeline for a single user message and return the final state."""
        initial_state: AgentState = {
            "user_input": user_input,
            "response_text": "",
            "audio_bytes": b"",
            "history": history or [],
            "voice_gender": voice_gender,
            "grammar_json": None,
        }
        return self.app.invoke(initial_state)
