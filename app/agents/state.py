from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    user_input: str
    response_text: str
    audio_bytes: bytes   # raw MP3 bytes from TTS; empty on failure
    history: list[str]
    voice_gender: str | None
    grammar_raw: str | None  # raw compact JSON from <grammar> tag; None on failure
    category: str | None      # routing context — e.g. "daily_conversation"
    topic: str | None         # routing context — e.g. "ordering_food"
    user_id: str | None       # authenticated user UUID — passed via RunnableConfig to tools; gates tool-client selection
    messages: Annotated[list[BaseMessage], add_messages]  # tool-calling sub-loop accumulator
    _tool_call_iterations: int                            # loop guard counter
