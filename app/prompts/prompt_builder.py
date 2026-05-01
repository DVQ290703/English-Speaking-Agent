from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.core.logger import logger

_SYSTEM_PROMPT_PATH = Path(__file__).with_name("system_prompt.md")
_TOPIC_PROMPTS_PATH = Path(__file__).with_name("topic_prompts.md")

_BASE_FALLBACK = (
    "You are an AI English-speaking coach. Keep replies short, natural, "
    "supportive, and easy to say aloud. Ask one follow-up question that helps "
    "the learner keep speaking."
)

_CACHE: dict[str, Any] = {
    "base_mtime": None, "base": None,
    "topics_mtime": None, "topics": None,
}


def _normalize_key(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def _load_base_prompt() -> str:
    try:
        mtime = _SYSTEM_PROMPT_PATH.stat().st_mtime
    except OSError:
        logger.exception("system_prompt.md not found at %s", _SYSTEM_PROMPT_PATH)
        return _BASE_FALLBACK

    if _CACHE["base_mtime"] == mtime and isinstance(_CACHE["base"], str):
        return _CACHE["base"]

    try:
        text = _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        logger.exception("Failed to read system_prompt.md")
        return _BASE_FALLBACK

    _CACHE["base_mtime"] = mtime
    _CACHE["base"] = text
    return text


def _parse_topics(content: str) -> dict[str, Any]:
    topics: dict[str, Any] = {}
    topic_re = re.compile(r"^# Topic:\s*(.+)$", re.MULTILINE)
    subtopic_re = re.compile(r"^## Sub-topic:\s*(.+)$", re.MULTILINE)
    sep_re = re.compile(r"^---\s*$", re.MULTILINE)

    topic_matches = list(topic_re.finditer(content))
    for i, tm in enumerate(topic_matches):
        topic_key = _normalize_key(tm.group(1))
        block_start = tm.end()
        block_end = topic_matches[i + 1].start() if i + 1 < len(topic_matches) else len(content)
        block = content[block_start:block_end]

        sub_matches = list(subtopic_re.finditer(block))
        topic_prompt_raw = block[: sub_matches[0].start()] if sub_matches else block
        topic_prompt = sep_re.sub("", topic_prompt_raw).strip()

        options: dict[str, str] = {}
        for j, sm in enumerate(sub_matches):
            sub_key = _normalize_key(sm.group(1))
            sub_start = sm.end()
            sub_end = sub_matches[j + 1].start() if j + 1 < len(sub_matches) else len(block)
            options[sub_key] = sep_re.sub("", block[sub_start:sub_end]).strip()

        topics[topic_key] = {"topic_prompt": topic_prompt, "options": options}

    return topics


def _load_topics() -> dict[str, Any]:
    try:
        mtime = _TOPIC_PROMPTS_PATH.stat().st_mtime
    except OSError:
        logger.exception("topic_prompts.md not found at %s", _TOPIC_PROMPTS_PATH)
        return {}

    if _CACHE["topics_mtime"] == mtime and isinstance(_CACHE["topics"], dict):
        return _CACHE["topics"]

    try:
        content = _TOPIC_PROMPTS_PATH.read_text(encoding="utf-8")
    except OSError:
        logger.exception("Failed to read topic_prompts.md")
        return {}

    topics = _parse_topics(content)
    _CACHE["topics_mtime"] = mtime
    _CACHE["topics"] = topics
    return topics


def extract_prompt_context(history: list[str]) -> tuple[str | None, str | None]:
    """Extract topic and scenario metadata from normalized history lines."""
    topic_line = next((ln for ln in history if ln.startswith("Topic:")), None)
    sub_option_line = next((ln for ln in history if ln.startswith("Sub-option:")), None)
    topic = topic_line[6:].strip() if topic_line else None
    sub_option = sub_option_line[11:].strip() if sub_option_line else None
    return topic or None, sub_option or None


def build_system_prompt(topic: str | None = None, sub_option: str | None = None) -> str:
    """Compose a system prompt: base -> topic layer -> sub-option layer."""
    prompt_parts = [_load_base_prompt()]

    if topic:
        topics = _load_topics()
        topic_key = _normalize_key(topic)
        topic_data = topics.get(topic_key)

        if topic_data:
            topic_prompt = topic_data.get("topic_prompt", "").strip()
            if topic_prompt:
                prompt_parts.append(f"---\n\n## Topic: {topic_key}\n{topic_prompt}")

            if sub_option:
                sub_key = _normalize_key(sub_option)
                option_prompt = topic_data.get("options", {}).get(sub_key, "").strip()
                if option_prompt:
                    prompt_parts.append(f"---\n\n## Scenario: {sub_key}\n{option_prompt}")
                else:
                    prompt_parts.append(
                        f"---\n\n## Scenario: {sub_option.strip()}\n"
                        "The learner selected this scenario. "
                        "Adapt the conversation to it while keeping the same coaching style."
                    )
        else:
            prompt_parts.append(
                f"---\n\n## Topic: {topic.strip()}\n"
                "The learner selected this topic. "
                "Create a realistic speaking-practice conversation around it."
            )
            if sub_option:
                prompt_parts.append(
                    f"---\n\n## Scenario: {sub_option.strip()}\n"
                    "The learner selected this scenario. "
                    "Adapt the conversation to it while keeping the same coaching style."
                )

    return "\n\n".join(part for part in prompt_parts if part)
