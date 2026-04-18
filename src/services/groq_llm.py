"""Groq LLM service — generates speech-friendly responses via ChatGroq."""

import logging
import os
from pathlib import Path

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).resolve().parents[1] / "prompts" / "system_prompt.md"


def load_system_prompt() -> str:
    """Load the assistant system prompt from markdown with a safe inline fallback."""
    try:
        text = _PROMPT_PATH.read_text(encoding="utf-8").strip()
        if text:
            logger.info("System prompt loaded from %s (%d chars)", _PROMPT_PATH, len(text))
            return text
    except OSError:
        logger.warning("System prompt file not found at %s — using inline fallback", _PROMPT_PATH)
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
        self.model_name = model_name
        self.client = ChatGroq(api_key=api_key, model=model_name, temperature=0.2)
        logger.info("GroqLLMService ready model=%s", model_name)

    def generate_response(self, user_input: str, history: list[str] | None = None) -> str:
        """Generate a reply using the system prompt and properly-structured conversation history."""
        history = history or []
        logger.info("GroqLLM generate_response model=%s history_lines=%d input=%r", self.model_name, len(history), user_input[:80])

        messages: list = [SystemMessage(content=SYSTEM_PROMPT)]

        if history:
            topic_line = next((ln for ln in history if ln.startswith("Topic:")), None)
            if topic_line:
                messages.append(SystemMessage(content=f"Practice topic: {topic_line[6:].strip()}"))
                logger.debug("GroqLLM injecting topic: %s", topic_line)

            for line in history[-8:]:
                if line.startswith("User:"):
                    messages.append(HumanMessage(content=line[5:].strip()))
                elif line.startswith("Assistant:"):
                    messages.append(AIMessage(content=line[10:].strip()))

        messages.append(HumanMessage(content=user_input))
        logger.debug("GroqLLM sending %d messages to API", len(messages))

        response = self.client.invoke(messages)
        if isinstance(response, AIMessage):
            result = response.content
        else:
            result = str(response)

        logger.info("GroqLLM response=%r (len=%d)", result[:80], len(result))
        return result
