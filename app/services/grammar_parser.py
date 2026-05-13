"""Parse the XML-delimited LLM output and compact grammar JSON into domain objects.

The LLM returns output in this format:
    <response>conversational reply</response>
    <grammar>{"ann":"sentence {wrong->correct}","err":[...],"score":85}</grammar>

split_combined_output() separates the two sections.
parse_annotated_grammar() derives reliable char positions from the {wrong->correct}
annotations — never trusting LLM character counts.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from app.core.logger import logger

_RESPONSE_TAG_RE = re.compile(r"<response>(.*?)</response>", re.DOTALL)
_GRAMMAR_TAG_RE = re.compile(r"<grammar>(.*?)</grammar>", re.DOTALL)
_SUGGESTIONS_TAG_RE = re.compile(r"<suggestions>(.*?)</suggestions>", re.DOTALL)
_ANNOTATION_RE = re.compile(r"\{([^}]*?)->([^}]*?)\}")

_CAT_MAP: dict[str, str] = {
    "vt": "verb_tense",
    "art": "article",
    "prep": "preposition",
    "sv": "subject_verb_agreement",
    "sp": "spelling",
    "wc": "word_choice",
    "punc": "punctuation",
    "wo": "word_order",
    "pl": "plural_singular",
    "other": "other",
}

_SEV_MAP: dict[int, str] = {1: "minor", 2: "major", 3: "critical"}


@dataclass
class GrammarError:
    original: str
    corrected: str
    start_char: int
    end_char: int
    category: str
    severity: str
    explanation: str
    rule: str
    example: str


@dataclass
class GrammarData:
    errors: list[GrammarError] = field(default_factory=list)
    corrected_sentence: str | None = None
    overall_score: int = 100


def _parse_suggestions_raw(suggestions_raw: str | None) -> list[str]:
    """Parse compact suggestions JSON. Never raises."""
    if not suggestions_raw:
        return []
    try:
        data = json.loads(suggestions_raw)
    except json.JSONDecodeError:
        logger.warning("parse_suggestions: failed to parse suggestions JSON")
        return []

    values = data.get("suggestions") if isinstance(data, dict) else None
    if not isinstance(values, list):
        return []

    suggestions: list[str] = []
    for value in values:
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned:
                suggestions.append(cleaned)
        if len(suggestions) == 3:
            break
    return suggestions


def split_combined_output_with_suggestions(raw: str) -> tuple[str, str | None, list[str]]:
    """Split response, grammar, and suggestions sections from LLM output."""
    response_match = _RESPONSE_TAG_RE.search(raw)
    grammar_match = _GRAMMAR_TAG_RE.search(raw)
    suggestions_match = _SUGGESTIONS_TAG_RE.search(raw)

    grammar_raw = grammar_match.group(1).strip() if grammar_match else None
    suggestions_raw = suggestions_match.group(1).strip() if suggestions_match else None

    if response_match:
        response_text = response_match.group(1).strip()
    else:
        response_text = _SUGGESTIONS_TAG_RE.sub("", _GRAMMAR_TAG_RE.sub("", raw)).strip()

    return response_text, grammar_raw, _parse_suggestions_raw(suggestions_raw)


def split_combined_output(raw: str) -> tuple[str, str | None]:
    """Split response and grammar from LLM output, preserving the original API."""
    response_text, grammar_raw, _suggestions = split_combined_output_with_suggestions(raw)
    return response_text, grammar_raw


def parse_annotated_grammar(grammar_raw: str | None, user_input: str) -> GrammarData:
    """Parse compact annotated grammar JSON into GrammarData.

    Expects: {"ann":"sentence {wrong->correct}","err":[...],"score":85}

    Character positions are computed by searching user_input for annotation
    tokens left-to-right. Never raises — returns empty GrammarData on failure.
    """
    if not grammar_raw:
        return GrammarData()
    try:
        data = json.loads(grammar_raw)
        ann: str = data.get("ann", "")
        err_list: list = data.get("err", [])
        score: int = int(data.get("score", 100))

        # Extract annotation tokens in left-to-right order
        tokens = [(m.group(1), m.group(2)) for m in _ANNOTATION_RE.finditer(ann)]

        # Derive corrected_sentence: replace each {wrong->correct} with correct
        corrected_sentence = _ANNOTATION_RE.sub(lambda m: m.group(2), ann).strip() or None

        # Pair tokens with error detail items; use min length to handle mismatches
        pairs = list(zip(tokens, err_list))
        if len(tokens) != len(err_list):
            logger.warning(
                "parse_annotated_grammar annotation/error count mismatch tokens=%d errors=%d",
                len(tokens),
                len(err_list),
            )

        errors: list[GrammarError] = []
        cursor = 0  # tracks search position in user_input

        for (wrong_text, correct_text), err_item in pairs:
            start_char, end_char = 0, 0

            if wrong_text:  # substitution or deletion
                idx = user_input.lower().find(wrong_text.lower(), cursor)
                if idx != -1:
                    start_char = idx
                    end_char = idx + len(wrong_text)
                    cursor = end_char
            else:
                # Insertion {->word}: zero-width span at cursor position
                start_char = cursor
                end_char = cursor

            cat_code = str(err_item.get("cat", "other"))
            category = _CAT_MAP.get(cat_code, cat_code)
            sev_raw = err_item.get("sev", 1)
            severity = _SEV_MAP.get(int(sev_raw), "minor")

            errors.append(GrammarError(
                original=wrong_text,
                corrected=correct_text,
                start_char=start_char,
                end_char=end_char,
                category=category,
                severity=severity,
                explanation=str(err_item.get("msg", "")),
                rule="",
                example=str(err_item.get("eg", "")),
            ))

        return GrammarData(
            errors=errors,
            corrected_sentence=corrected_sentence,
            overall_score=score,
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        logger.warning(
            "parse_annotated_grammar: failed to parse grammar_raw user_input_length=%d",
            len(user_input),
        )
        return GrammarData()
