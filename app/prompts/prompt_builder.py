from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.core.logger import get_logger

logger = get_logger("prompts")

_SYSTEM_PROMPT_PATH = Path(__file__).with_name("system_prompt.md")
_TOPIC_PROMPTS_PATH = Path(__file__).with_name("topic_prompts.md")
_PROMPTS_ROOT = Path(__file__).resolve().parent

_BASE_FALLBACK = (
    "You are an AI English-speaking coach. Keep replies short, natural, "
    "supportive, and easy to say aloud. Ask one follow-up question that helps "
    "the learner keep speaking."
)

GRAMMAR_INSTRUCTION = """\
---

RESPONSE FORMAT (strict JSON only - no markdown, no code fences):
{
  "response_text": "<your conversational reply>",
  "tagged_input": "<copy the user's latest message exactly, wrapping each grammar error in angle brackets>",
  "grammar_errors": [
    {
      "original": "<error text exactly as it appears inside the angle brackets>",
      "corrected": "<corrected form>",
      "category": "<verb_tense|subject_verb_agreement|article|preposition|word_order|spelling|punctuation|other>",
      "severity": "<minor|moderate|major>",
      "explanation": "<one sentence explaining the error>",
      "rule": "<grammar rule name or principle>",
      "example": "<example of correct usage>"
    }
  ],
  "corrected_sentence": "<full corrected version of the user's latest message>",
  "overall_score": <integer 0-100>
}

Rules:
- Assess ONLY the latest user message, not conversation history.
- tagged_input: copy the user's message verbatim, wrapping each error in < > angle brackets.
  Example - user says "I go to store yesterday" -> tagged_input: "I <go> to <store> yesterday"
- grammar_errors: one entry per < > span in tagged_input, listed in the same order.
- original must match exactly the text inside the < > brackets.
- If there are no errors, tagged_input equals the original message unchanged and grammar_errors is [].
- overall_score: 100 minus (major_count*15 + moderate_count*8 + minor_count*3), minimum 0.\
"""

_CACHE: dict[str, Any] = {
    "base_mtime": None,
    "base": None,
    "topics_signature": None,
    "topics": None,
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
        logger.debug("prompt_builder using inline fallback base prompt")
        return _BASE_FALLBACK

    if _CACHE["base_mtime"] == mtime and isinstance(_CACHE["base"], str):
        logger.debug(
            "prompt_builder base prompt cache HIT mtime=%.3f chars=%d",
            mtime,
            len(_CACHE["base"]),
        )
        return _CACHE["base"]

    try:
        text = _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        logger.exception("Failed to read system_prompt.md")
        return _BASE_FALLBACK

    _CACHE["base_mtime"] = mtime
    _CACHE["base"] = text
    logger.debug(
        "prompt_builder base prompt cache MISS - reloaded from disk chars=%d mtime=%.3f",
        len(text),
        mtime,
    )
    return text


def _resolve_include_path(include_target: str, base_path: Path) -> Path:
    candidate = (base_path.parent / include_target.strip()).resolve()
    try:
        candidate.relative_to(_PROMPTS_ROOT)
    except ValueError as exc:
        raise ValueError(f"Include path escapes prompts directory: {include_target}") from exc
    return candidate


def _expand_includes(path: Path, visited: set[Path] | None = None) -> str:
    visited = visited or set()
    resolved = path.resolve()
    if resolved in visited:
        raise ValueError(f"Cyclic prompt include detected for {resolved}")
    visited.add(resolved)

    content = path.read_text(encoding="utf-8")
    expanded_lines: list[str] = []
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("!include "):
            include_target = stripped[len("!include ") :].strip()
            include_path = _resolve_include_path(include_target, path)
            expanded_lines.append(_expand_includes(include_path, visited.copy()).strip())
        else:
            expanded_lines.append(line)
    return "\n".join(expanded_lines).strip()


def _collect_include_signature(
    path: Path,
    visited: set[Path] | None = None,
) -> tuple[tuple[str, float], ...]:
    visited = visited or set()
    resolved = path.resolve()
    if resolved in visited:
        return ()
    visited.add(resolved)

    entries: list[tuple[str, float]] = [(str(resolved), path.stat().st_mtime)]
    content = path.read_text(encoding="utf-8")
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("!include "):
            include_target = stripped[len("!include ") :].strip()
            include_path = _resolve_include_path(include_target, path)
            entries.extend(_collect_include_signature(include_path, visited))
    return tuple(entries)


def _parse_topics(content: str) -> dict[str, Any]:
    topics: dict[str, Any] = {}
    topic_re = re.compile(r"^# Category:\s*(.+)$", re.MULTILINE)
    subtopic_re = re.compile(r"^## Topic:\s*(.+)$", re.MULTILINE)
    sep_re = re.compile(r"^---\s*$", re.MULTILINE)

    topic_matches = list(topic_re.finditer(content))
    for i, topic_match in enumerate(topic_matches):
        topic_key = _normalize_key(topic_match.group(1))
        block_start = topic_match.end()
        block_end = (
            topic_matches[i + 1].start() if i + 1 < len(topic_matches) else len(content)
        )
        block = content[block_start:block_end]

        sub_matches = list(subtopic_re.finditer(block))
        topic_prompt_raw = block[: sub_matches[0].start()] if sub_matches else block
        topic_prompt = sep_re.sub("", topic_prompt_raw).strip()

        options: dict[str, str] = {}
        for j, sub_match in enumerate(sub_matches):
            sub_key = _normalize_key(sub_match.group(1))
            sub_start = sub_match.end()
            sub_end = sub_matches[j + 1].start() if j + 1 < len(sub_matches) else len(block)
            options[sub_key] = sep_re.sub("", block[sub_start:sub_end]).strip()

        topics[topic_key] = {"topic_prompt": topic_prompt, "options": options}

    return topics


def _load_topics() -> dict[str, Any]:
    try:
        signature = _collect_include_signature(_TOPIC_PROMPTS_PATH)
    except OSError:
        logger.exception("topic_prompts.md not found at %s", _TOPIC_PROMPTS_PATH)
        return {}
    except ValueError:
        logger.exception("Invalid include chain in topic prompts")
        return {}

    if _CACHE["topics_signature"] == signature and isinstance(_CACHE["topics"], dict):
        logger.debug(
            "prompt_builder topics cache HIT files=%d known_categories=%s",
            len(signature),
            list(_CACHE["topics"].keys()),
        )
        return _CACHE["topics"]

    try:
        content = _expand_includes(_TOPIC_PROMPTS_PATH)
    except OSError:
        logger.exception("Failed to read topic_prompts.md")
        return {}
    except ValueError:
        logger.exception("Failed to expand topic prompt includes")
        return {}

    topics = _parse_topics(content)
    _CACHE["topics_signature"] = signature
    _CACHE["topics"] = topics
    logger.debug(
        "prompt_builder topics cache MISS - reloaded from %d files categories=%s",
        len(signature),
        {key: list(value.get("options", {}).keys()) for key, value in topics.items()},
    )
    return topics


def extract_prompt_context(history: list[str]) -> tuple[str | None, str | None]:
    """Extract category and topic metadata from normalized history lines."""
    category_line = next((ln for ln in history if ln.startswith("Category:")), None)
    topic_line = next((ln for ln in history if ln.startswith("Topic:")), None)
    category = category_line[9:].strip() if category_line else None
    topic = topic_line[6:].strip() if topic_line else None
    return category or None, topic or None


def build_system_prompt(
    category: str | None = None,
    topic: str | None = None,
    include_grammar: bool = False,
) -> str:
    """Compose a system prompt: base -> category layer -> topic layer -> grammar instruction."""
    logger.debug(
        "prompt_builder build_system_prompt called category=%r topic=%r include_grammar=%s",
        category,
        topic,
        include_grammar,
    )

    prompt_parts = [_load_base_prompt()]

    if category:
        topics = _load_topics()
        category_key = _normalize_key(category)
        category_data = topics.get(category_key)

        logger.debug(
            "prompt_builder category lookup raw=%r normalized=%r found=%s",
            category,
            category_key,
            category_data is not None,
        )

        if category_data:
            category_prompt = category_data.get("topic_prompt", "").strip()
            if category_prompt:
                prompt_parts.append(f"---\n\n## Category: {category_key}\n{category_prompt}")
                logger.debug("prompt_builder layer=category injected chars=%d", len(category_prompt))
            else:
                logger.debug("prompt_builder layer=category found but topic_prompt is empty, skipping")

            if topic:
                topic_key = _normalize_key(topic)
                option_prompt = category_data.get("options", {}).get(topic_key, "").strip()

                logger.debug(
                    "prompt_builder topic lookup raw=%r normalized=%r found=%s available=%s",
                    topic,
                    topic_key,
                    bool(option_prompt),
                    list(category_data.get("options", {}).keys()),
                )

                if option_prompt:
                    prompt_parts.append(f"---\n\n## Topic: {topic_key}\n{option_prompt}")
                    logger.debug("prompt_builder layer=topic injected chars=%d", len(option_prompt))
                else:
                    prompt_parts.append(
                        f"---\n\n## Topic: {topic.strip()}\n"
                        "The learner selected this topic. "
                        "Adapt the conversation to it while keeping the same coaching style."
                    )
                    logger.debug("prompt_builder layer=topic NOT found in options - using generic fallback")
            else:
                logger.debug("prompt_builder no topic provided, skipping topic layer")
        else:
            logger.debug(
                "prompt_builder category NOT found in topics - using generic fallback available_categories=%s",
                list(topics.keys()),
            )
            prompt_parts.append(
                f"---\n\n## Category: {category.strip()}\n"
                "The learner selected this category. "
                "Create a realistic speaking-practice conversation around it."
            )
            if topic:
                prompt_parts.append(
                    f"---\n\n## Topic: {topic.strip()}\n"
                    "The learner selected this topic. "
                    "Adapt the conversation to it while keeping the same coaching style."
                )
                logger.debug("prompt_builder layer=topic generic fallback injected (category was also missing)")
    else:
        logger.debug("prompt_builder no category provided - base prompt only")

    if include_grammar:
        prompt_parts.append(GRAMMAR_INSTRUCTION)
        logger.debug("prompt_builder layer=grammar injected")

    final_prompt = "\n\n".join(part for part in prompt_parts if part)
    logger.debug(
        "prompt_builder final prompt layers=%d total_chars=%d",
        len(prompt_parts),
        len(final_prompt),
    )
    return final_prompt
