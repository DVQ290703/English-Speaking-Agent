from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.core.logger import get_logger

logger = get_logger("prompts")

_SYSTEM_PROMPT_PATH = Path(__file__).with_name("system_prompt.md")
_TOPIC_PROMPTS_PATH = Path(__file__).with_name("topic_prompts.md")
_PROMPTS_ROOT = Path(__file__).resolve().parent

_SECTION_RE = re.compile(
    r"<!--\s*BEGIN:\s*(\w+)\s*-->(.*?)<!--\s*END:\s*\1\s*-->",
    re.DOTALL,
)

_BASE_FALLBACK = (
    "You are a professional English-speaking coach. Keep replies short, natural, "
    "supportive, and easy to say aloud. Ask one follow-up question that helps "
    "the learner keep speaking. Greetings and check-ins like 'Can you hear me?' "
    "are normal conversation — respond to them warmly, never refuse."
)

_GRAMMAR_FALLBACK = """\
---

RESPONSE FORMAT — always wrap your output in these XML tags, no exceptions:

<response>
[Your conversational coaching reply here — natural, warm, encouraging. PLAIN TEXT ONLY: no **bold**, no *italics*, no markdown.]
</response>
<grammar>
{"ann":"<user sentence with {wrong->correct} markers>","err":[{"cat":"<code>","sev":<1|2|3>,"msg":"<one explanation sentence>","eg":"<optional example>"}],"score":<0-100>}
</grammar>

Grammar annotation rules:
- ann: copy the user's LATEST message verbatim, wrapping EVERY error as {wrong->correct} — do not skip errors
- Insertion (missing word): {->word}  |  Deletion (extra word): {word->}
- Category codes: vt=verb tense, art=article, prep=preposition, sv=subject-verb agreement,
  sp=spelling, wc=word choice, punc=punctuation, wo=word order, pl=plural/singular, other=catch-all
- Severity: 1=minor  2=major  3=critical
- err[i] corresponds to the i-th {wrong->correct} annotation in ann, in order
- "eg" field is optional — omit for simple or obvious errors
- No errors: ann=<original message unchanged>, err=[], score=100
- score = 100 minus (critical_count×15 + major_count×8 + minor_count×3), minimum 0
- ann/err captures ALL errors. The <response> block speaks about only the ONE most impactful error (highest severity). These are independent — never omit an error from ann just because you didn't mention it in <response>.
- Context-aware tense: use the full conversation history to determine the correct tense. If prior turns or time words (yesterday, last week, earlier) establish a past-tense context, a present-tense verb in the user's message is a verb-tense error (vt, sev:2). Example: user said "yesterday I went to the cinema" then says "I see a great film" → flag {see->saw}.
- Include the <grammar> block ONLY in your final conversational reply.
  Do NOT include it when you are calling tools.\
"""

_SUGGESTIONS_FALLBACK = """\
---

SUGGESTIONS FORMAT - include this block in every final text reply:

<suggestions>
{"suggestions":["<simple continuation>","<follow-up question>","<opinion or experience response>"]}
</suggestions>

Suggestion rules:
- Generate exactly 3 suggestions for the learner's next turn.
- Each suggestion must be one natural English phrase or sentence the learner can say directly.
- Make the 3 suggestions meaningfully different: simple continuation, follow-up question, and opinion or experience response.
- Keep each suggestion concise and relevant to the latest assistant response and conversation history.
- Do not include suggestions when your response is only a tool call with no spoken text.
- The 75-word limit applies only to the spoken <response> block, not this JSON block.\
"""

_STRUCTURED_OUTPUT_INSTRUCTION = """\
---

RESPONSE FORMAT — you MUST reply ONLY with a single valid JSON object. No prose, no markdown, no extra text before or after.

Required schema:
{
  "response_text": "<your coaching reply — plain text only, no markdown, no XML tags>",
  "grammar": {
    "ann": "<user sentence with {wrong->correct} markers for every error>",
    "err": [{"cat": "<code>", "sev": <1|2|3>, "msg": "<one explanation sentence>", "eg": "<optional example>"}],
    "score": <0-100>
  },
  "suggestions": ["<simple continuation>", "<follow-up question>", "<opinion or experience>"]
}

If the user's message has no grammar errors, set "grammar" to {"ann": "<original message unchanged>", "err": [], "score": 100} — never use null.

Grammar annotation rules (same logic as always):
- ann: copy the user's LATEST message verbatim, wrapping EVERY error as {wrong->correct}
- Insertion (missing word): {->word}  |  Deletion (extra word): {word->}
- Category codes: vt=verb tense, art=article, prep=preposition, sv=subject-verb agreement, sp=spelling, wc=word choice, punc=punctuation, wo=word order, pl=plural/singular, other=catch-all
- Severity: 1=minor  2=major  3=critical
- err[i] corresponds to the i-th annotation in ann, in order
- score = 100 minus (critical×15 + major×8 + minor×3), minimum 0
- Context-aware tense: use conversation history to determine the correct tense
- "response_text" speaks about only the ONE most impactful error; ann/err captures ALL errors

Suggestions rules:
- Always include exactly 3 suggestions the learner can say directly next turn
- Make them meaningfully different: simple continuation, follow-up question, opinion or experience\
"""

_PREFLIGHT_FALLBACK = """\
You are a pre-flight classifier for an English learning voice assistant.

Evaluate the user's message on THREE dimensions and reply in EXACTLY this format (three lines, no extra text):
SAFETY: SAFE|UNSAFE
SCOPE: IN_SCOPE|OUT_OF_SCOPE
TOOL: NEEDS_TOOL|NO_TOOL

=== SAFETY ===
SAFE — general conversation, language questions, educational/fictional/news context, any sensitive topic discussed for learning.
UNSAFE — step-by-step harm instructions, violence against a specific target, sexual content involving minors, manipulation of real individuals.

=== SCOPE ===
IN_SCOPE — English speaking practice, pronunciation, grammar, vocabulary, roleplay for speaking, IELTS/business conversation, emotional support during learning.
OUT_OF_SCOPE — requests to write or debug code/programs, solve math/logic problems, write essays or reports unrelated to speaking practice, provide medical/legal/financial advice, or translate full documents. Brief L1 word equivalents to anchor vocabulary are IN_SCOPE.

=== TOOL ===
The assistant has flashcard tools (create deck, list decks, add card, review cards).
NEEDS_TOOL — user explicitly requests OR is clearly responding to an assistant prompt to create/view/manage a deck or card, save/add a word, or review flashcards. Use the conversation history to resolve ambiguous short replies (e.g. a name given in response to "What would you like to name it?").
NO_TOOL — everything else: greetings, small talk, language questions, pronunciation practice.\
"""

_BLOCKED_RESPONSE_FALLBACK = (
    "I'm sorry, that's outside what I can help with here. "
    "Tell me what you'd like to practice in English today."
)

_CACHE: dict[str, Any] = {
    "mtime": None,
    "sections": None,
    "topics_signature": None,
    "topics": None,
}


def _normalize_key(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def _fallback_sections() -> dict[str, str]:
    return {
        "system_prompt": _BASE_FALLBACK,
        "grammar_instruction": _GRAMMAR_FALLBACK,
        "suggestions_instruction": _SUGGESTIONS_FALLBACK,
        "preflight_prompt": _PREFLIGHT_FALLBACK,
        "blocked_response": _BLOCKED_RESPONSE_FALLBACK,
    }


def _load_sections() -> dict[str, str]:
    try:
        mtime = _SYSTEM_PROMPT_PATH.stat().st_mtime
    except OSError:
        logger.exception("system_prompt.md not found at %s — ALL prompts will use fallbacks", _SYSTEM_PROMPT_PATH)
        return _fallback_sections()

    if _CACHE["mtime"] == mtime and isinstance(_CACHE["sections"], dict):
        logger.debug("prompt_builder sections cache HIT mtime=%.3f", mtime)
        return _CACHE["sections"]

    try:
        text = _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
    except OSError:
        logger.exception("Failed to read system_prompt.md — ALL prompts will use fallbacks")
        return _fallback_sections()

    sections: dict[str, str] = {
        m.group(1): m.group(2).strip()
        for m in _SECTION_RE.finditer(text)
    }
    _CACHE["mtime"] = mtime
    _CACHE["sections"] = sections
    logger.debug(
        "prompt_builder sections cache MISS - reloaded sections=%s chars=%d mtime=%.3f",
        list(sections.keys()),
        len(text),
        mtime,
    )
    return sections


def _load_base_prompt() -> str:
    sections = _load_sections()
    value = sections.get("system_prompt")
    if value:
        logger.info("prompt_builder base_prompt=file")
        return value
    logger.info("prompt_builder base_prompt=fallback (section missing from file)")
    return _BASE_FALLBACK


def _load_grammar_instruction() -> str:
    sections = _load_sections()
    value = sections.get("grammar_instruction")
    if value:
        logger.info("prompt_builder grammar_instruction=file")
        return value
    logger.info("prompt_builder grammar_instruction=fallback (section missing from file)")
    return _GRAMMAR_FALLBACK


def _load_suggestions_instruction() -> str:
    sections = _load_sections()
    value = sections.get("suggestions_instruction")
    if value:
        logger.info("prompt_builder suggestions_instruction=file")
        return value
    logger.info("prompt_builder suggestions_instruction=fallback (section missing from file)")
    return _SUGGESTIONS_FALLBACK


def _load_structured_output_instruction() -> str:
    sections = _load_sections()
    value = sections.get("structured_output_instruction")
    if value:
        logger.info("prompt_builder structured_output_instruction=file")
        return value
    logger.info("prompt_builder structured_output_instruction=fallback (section missing from file)")
    return _STRUCTURED_OUTPUT_INSTRUCTION


def load_preflight_prompt() -> str:
    sections = _load_sections()
    value = sections.get("preflight_prompt")
    if value:
        logger.info("prompt_builder preflight_prompt=file")
        return value
    logger.info("prompt_builder preflight_prompt=fallback (section missing from file)")
    return _PREFLIGHT_FALLBACK


def load_blocked_response() -> str:
    sections = _load_sections()
    value = sections.get("blocked_response")
    if value:
        logger.info("prompt_builder blocked_response=file")
        return value
    logger.info("prompt_builder blocked_response=fallback (section missing from file)")
    return _BLOCKED_RESPONSE_FALLBACK


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
    include_grammar: bool = True,
    include_suggestions: bool = True,
    use_structured_output: bool = False,
) -> str:
    """Compose a system prompt with optional grammar and suggestions instructions."""
    logger.debug(
        "prompt_builder build_system_prompt called category=%r topic=%r include_grammar=%s include_suggestions=%s use_structured_output=%s",
        category,
        topic,
        include_grammar,
        include_suggestions,
        use_structured_output,
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

    if include_grammar and not use_structured_output:
        prompt_parts.append(_load_grammar_instruction())
        logger.debug("prompt_builder layer=grammar injected")
        if include_suggestions:
            prompt_parts.append(_load_suggestions_instruction())
            logger.debug("prompt_builder layer=suggestions injected")
    elif include_grammar and use_structured_output:
        prompt_parts.append(_load_structured_output_instruction())
        logger.debug("prompt_builder layer=structured_output_instruction injected")

    final_prompt = "\n\n".join(part for part in prompt_parts if part)
    logger.debug(
        "prompt_builder final prompt layers=%d total_chars=%d",
        len(prompt_parts),
        len(final_prompt),
    )
    return final_prompt
