from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from app.core.logger import logger

_ARCHITECTURE_PATH = Path(__file__).with_name("prompt_architecture.json")

_BASE_FALLBACK = (
    "You are an AI English-speaking coach. Keep replies short, natural, "
    "supportive, and easy to say aloud. Ask one follow-up question that helps "
    "the learner keep speaking."
)
_PROMPT_CACHE: dict[str, Any] = {"mtime": None, "data": None}


def _normalize_key(value: str | None) -> str:
    if not value:
        return ""
    normalized = re.sub(r"[^a-z0-9]+", "_", value.strip().lower())
    return normalized.strip("_")


def load_prompt_architecture() -> dict[str, Any]:
    """Load the layered prompt architecture from JSON."""
    try:
        mtime = _ARCHITECTURE_PATH.stat().st_mtime
    except OSError:
        logger.exception("Prompt architecture file not found at %s", _ARCHITECTURE_PATH)
        return {"base_prompt": _BASE_FALLBACK, "topics": {}}

    if _PROMPT_CACHE["mtime"] == mtime and isinstance(_PROMPT_CACHE["data"], dict):
        return _PROMPT_CACHE["data"]

    try:
        with _ARCHITECTURE_PATH.open(encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        logger.exception("Failed to load prompt architecture from %s", _ARCHITECTURE_PATH)
        return {"base_prompt": _BASE_FALLBACK, "topics": {}}

    if not isinstance(data, dict):
        logger.warning("Prompt architecture root is not an object")
        return {"base_prompt": _BASE_FALLBACK, "topics": {}}
    _PROMPT_CACHE["mtime"] = mtime
    _PROMPT_CACHE["data"] = data
    return data


def _resolve_topic(data: dict[str, Any], topic: str | None) -> tuple[str, dict[str, Any] | None]:
    topics = data.get("topics")
    if not isinstance(topics, dict):
        return "", None

    topic_key = _normalize_key(topic)
    if topic_key in topics and isinstance(topics[topic_key], dict):
        return topic_key, topics[topic_key]

    for key, value in topics.items():
        if not isinstance(value, dict):
            continue
        aliases = value.get("aliases", [])
        if isinstance(aliases, list) and topic_key in {_normalize_key(str(alias)) for alias in aliases}:
            return str(key), value

    return topic_key, None


def _resolve_option(topic_data: dict[str, Any], sub_option: str | None) -> dict[str, Any] | None:
    options = topic_data.get("options")
    if not isinstance(options, dict):
        return None

    option_key = _normalize_key(sub_option)
    if option_key in options and isinstance(options[option_key], dict):
        return options[option_key]

    for value in options.values():
        if not isinstance(value, dict):
            continue
        aliases = value.get("aliases", [])
        if isinstance(aliases, list) and option_key in {_normalize_key(str(alias)) for alias in aliases}:
            return value

    return None


def extract_prompt_context(history: list[str]) -> tuple[str | None, str | None]:
    """Extract topic and scenario metadata from normalized history lines."""
    topic_line = next((ln for ln in history if ln.startswith("Topic:")), None)
    sub_option_line = next((ln for ln in history if ln.startswith("Sub-option:")), None)
    topic = topic_line[6:].strip() if topic_line else None
    sub_option = sub_option_line[11:].strip() if sub_option_line else None
    return topic or None, sub_option or None


def build_system_prompt(topic: str | None = None, sub_option: str | None = None) -> str:
    """
    Compose a dynamic system prompt using the layered architecture:
    base prompt -> topic prompt -> sub-option prompt.
    """
    data = load_prompt_architecture()
    base_prompt = str(data.get("base_prompt") or _BASE_FALLBACK).strip()
    prompt_parts = [base_prompt]

    topic_key, topic_data = _resolve_topic(data, topic)
    if topic and topic_data:
        topic_prompt = str(topic_data.get("topic_prompt") or "").strip()
        if topic_prompt:
            prompt_parts.append(f"Topic layer ({topic_key}):\n{topic_prompt}")

        option_data = _resolve_option(topic_data, sub_option)
        if sub_option and option_data:
            option_prompt = str(option_data.get("system_prompt") or "").strip()
            if option_prompt:
                prompt_parts.append(f"Sub-option layer:\n{option_prompt}")
        elif sub_option:
            prompt_parts.append(
                "Sub-option layer:\n"
                f"The learner selected this scenario: {sub_option.strip()}. "
                "Adapt the conversation to that scenario while keeping the same coaching style."
            )
    elif topic:
        prompt_parts.append(
            "Topic layer:\n"
            f"The learner selected this topic: {topic.strip()}. "
            "Create a realistic speaking-practice conversation around it."
        )

    return "\n\n".join(part for part in prompt_parts if part)
