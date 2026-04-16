from typing import List, TypedDict

class AgentState(TypedDict):
    user_input: str
    response_text: str
    audio_path: str
    history: List[str]