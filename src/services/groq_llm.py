"""Groq LLM service — generates speech-friendly responses via ChatGroq."""

import os
from pathlib import Path

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq

_PROMPT_PATH = Path(__file__).resolve().parents[1] / "prompts" / "system_prompt.md"


def load_system_prompt() -> str:
    """Load the assistant system prompt from markdown with a safe inline fallback."""
    try:
        text = _PROMPT_PATH.read_text(encoding="utf-8").strip()
        if text:
            return text
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
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY is missing. Set it in your environment or .env file.")
        self.client = ChatGroq(api_key=api_key, model=model_name, temperature=0.2)

    def generate_response(self, user_input: str, history: list[str] | None = None) -> str:
        """Generate a reply using the system prompt and properly-structured conversation history."""
        messages: list = [SystemMessage(content=SYSTEM_PROMPT)]

        if history:
            # Inject the practice topic as a system note so it stays in context regardless
            # of how deep the history window is.
            topic_line = next((ln for ln in history if ln.startswith("Topic:")), None)
            if topic_line:
                messages.append(SystemMessage(content=f"Practice topic: {topic_line[6:].strip()}"))

            # Rebuild the last 8 turns as proper alternating Human/AI messages so the LLM
            # receives correct role structure instead of a raw text dump.
            for line in history[-8:]:
                if line.startswith("User:"):
                    messages.append(HumanMessage(content=line[5:].strip()))
                elif line.startswith("Assistant:"):
                    messages.append(AIMessage(content=line[10:].strip()))

        messages.append(HumanMessage(content=user_input))

        response = self.client.invoke(messages)
        if isinstance(response, AIMessage):
            return response.content
        return str(response)
