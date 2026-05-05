from typing import TypedDict


class AgentState(TypedDict):
    user_input: str
    response_text: str
    audio_bytes: bytes   # raw MP3 bytes from TTS; empty on failure
    history: list[str]
    voice_gender: str | None
    grammar_json: str | None  # raw JSON from LLM grammar call; None on failure
