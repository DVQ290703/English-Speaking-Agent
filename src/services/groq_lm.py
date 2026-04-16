import os
from pathlib import Path

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq


PROMPT_PATH = Path(__file__).resolve().parents[1] / "prompts" / "system_prompt.md"


def load_system_prompt() -> str:
    """Load the assistant system prompt from markdown with a safe fallback."""
    try:
        prompt_text = PROMPT_PATH.read_text(encoding="utf-8").strip()
        if prompt_text:
            return prompt_text
    except OSError:
        pass

    return (
        "You are a helpful English-speaking voice assistant. "
        "Keep responses concise, natural, and easy to speak aloud."
    )


SYSTEM_PROMPT = load_system_prompt()


class GroqLLMService:
    """Wrapper around ChatGroq for short, speech-friendly assistant responses."""

    def __init__(self, model_name: str = "llama-3.3-70b-versatile"):
        """Initialize the Groq chat client with the selected model."""
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY is missing. Set it in your environment or .env file.")

        self.client = ChatGroq(
            api_key=api_key,
            model=model_name,
            temperature=0.2,
        )

    def generate_response(self, user_input: str, history: list[str] | None = None) -> str:
        """Generate a reply using the imported system prompt and recent history."""
        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
        ]

        if history:
            # Only send the recent turns to keep latency and token usage controlled.
            messages.append(HumanMessage(content="Conversation summary:\n" + "\n".join(history[-8:])))

        messages.append(HumanMessage(content=user_input))

        response = self.client.invoke(messages)
        if isinstance(response, AIMessage):
            return response.content
        return str(response)
