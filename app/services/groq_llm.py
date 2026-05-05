"""Groq LLM service — generates speech-friendly responses via ChatGroq."""

import json
import os
from pathlib import Path

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from app.core.logger import logger
from app.prompts.prompt_builder import build_system_prompt, extract_prompt_context

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
        logger.info(
            "GroqLLM generate_response model=%s history_lines=%d input_length=%d",
            self.model_name,
            len(history),
            len(user_input),
        )

        category, topic = extract_prompt_context(history)
        dynamic_prompt = build_system_prompt(category=category, topic=topic)
        messages: list = [SystemMessage(content=dynamic_prompt or SYSTEM_PROMPT)]

        if history:
            if category:
                logger.debug("GroqLLM resolved dynamic prompt category=%s topic_present=%s", category, bool(topic))

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

        logger.info("GroqLLM response_length=%d", len(result))
        return result

    def generate_response_with_grammar(
        self, user_input: str, history: list[str] | None = None
    ) -> tuple[str, str | None]:
        """Generate a reply with grammar analysis in one JSON-mode LLM call.

        Returns (response_text, raw_json_str).
        Falls back to (plain_response_text, None) when JSON mode fails.
        """
        history = history or []
        logger.info(
            "GroqLLM generate_response_with_grammar model=%s history_lines=%d input_length=%d",
            self.model_name,
            len(history),
            len(user_input),
        )

        category, topic = extract_prompt_context(history)
        dynamic_prompt = build_system_prompt(category=category, topic=topic, include_grammar=True)
        messages: list = [SystemMessage(content=dynamic_prompt or SYSTEM_PROMPT)]

        for line in history[-8:]:
            if line.startswith("User:"):
                messages.append(HumanMessage(content=line[5:].strip()))
            elif line.startswith("Assistant:"):
                messages.append(AIMessage(content=line[10:].strip()))

        messages.append(HumanMessage(content=user_input))

        try:
            json_client = self.client.bind(response_format={"type": "json_object"})
            response = json_client.invoke(messages)
            raw = response.content if isinstance(response, AIMessage) else str(response)

            data = json.loads(raw)
            response_text = data.get("response_text", "").strip()
            if response_text:
                logger.info("GroqLLM grammar response parsed ok response_length=%d", len(response_text))
                return response_text, raw

            logger.warning("GroqLLM grammar response missing response_text key, falling back")
        except Exception:
            logger.exception("GroqLLM generate_response_with_grammar failed, falling back to plain response")

        fallback = self.generate_response(user_input=user_input, history=history)
        return fallback, None
