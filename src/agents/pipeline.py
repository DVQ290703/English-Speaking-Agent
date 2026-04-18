import logging

from langgraph.graph import END, StateGraph

from src.services.elevenlabs_tts import ElevenLabsTTS
from src.services.groq_llm import GroqLLMService
from .state import AgentState

logger = logging.getLogger(__name__)


class VoiceAgentPipeline:
    """Coordinate the LLM and text-to-speech steps for one voice chat turn."""

    def __init__(self, llm_service: GroqLLMService, tts_service: ElevenLabsTTS):
        self.llm_service = llm_service
        self.tts_service = tts_service
        self.app = self._build_graph()

    def _respond_node(self, state: AgentState) -> AgentState:
        """Generate the assistant response and update the running conversation history."""
        logger.debug("respond_node start input=%r", state["user_input"][:80])
        response_text = self.llm_service.generate_response(
            user_input=state["user_input"],
            history=state.get("history", []),
        )
        logger.debug("respond_node done response=%r", response_text[:80])
        history = state.get("history", []) + [
            f"User: {state['user_input']}",
            f"Assistant: {response_text}",
        ]
        return {**state, "response_text": response_text, "history": history}

    def _tts_node(self, state: AgentState) -> AgentState:
        """Convert the generated reply into speech and store the raw bytes in state."""
        logger.debug("tts_node start text=%r", state["response_text"][:80])
        audio_bytes = self.tts_service.convert_text_to_speech(state["response_text"])
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

    def run(self, user_input: str, history: list[str] | None = None) -> AgentState:
        """Execute the pipeline for a single user message and return the final state."""
        initial_state: AgentState = {
            "user_input": user_input,
            "response_text": "",
            "audio_bytes": b"",
            "history": history or [],
        }
        return self.app.invoke(initial_state)
