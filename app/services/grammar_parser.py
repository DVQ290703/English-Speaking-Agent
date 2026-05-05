"""Parse the structured LLM JSON output into grammar domain objects.

The LLM marks errors with angle brackets in a `tagged_input` field, e.g.:
  "I <go> to <store> yesterday"

We parse those tags to derive exact character positions — no LLM character
counting involved, which eliminates off-by-one hallucinations.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field

from app.core.logger import logger


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


def _parse_tagged_input(tagged: str) -> list[tuple[str, int, int]]:
    """Extract (original, start_char, end_char) spans from a <tagged> string.

    Positions are offsets into the *clean* (tag-stripped) string, so
    user_input[start_char:end_char] == original.

    Example:
        "Yes, I <will enjoy> today." → [("will enjoy", 7, 17)]

    Malformed or unclosed tags are treated as plain text and skipped.
    """
    spans: list[tuple[str, int, int]] = []
    clean_offset = 0
    i = 0
    while i < len(tagged):
        if tagged[i] == "<":
            close = tagged.find(">", i + 1)
            if close == -1:
                # Unclosed tag — treat as literal text
                clean_offset += 1
                i += 1
            else:
                original = tagged[i + 1 : close]
                if original:  # ignore empty <> tags
                    spans.append((original, clean_offset, clean_offset + len(original)))
                clean_offset += len(original)
                i = close + 1
        else:
            clean_offset += 1
            i += 1
    return spans


def parse_grammar_response(
    raw_json: str | None, user_input: str
) -> tuple[str | None, GrammarData]:
    """Parse the LLM JSON blob into (response_text, GrammarData).

    Span positions are derived from the `tagged_input` field rather than
    trusting LLM-supplied char offsets, eliminating hallucinated positions.

    Returns (None, empty GrammarData) when raw_json is None or malformed.
    Never raises.
    """
    empty = GrammarData()
    if not raw_json:
        return None, empty
    try:
        data = json.loads(raw_json)
        response_text = data.get("response_text", "").strip() or None

        # Derive reliable positions from the tagged string
        tagged_input: str = data.get("tagged_input", "")
        spans = _parse_tagged_input(tagged_input) if tagged_input else []
        # Build a lookup keyed by original text; preserve insertion order so
        # first-match wins when the same phrase appears more than once.
        span_lookup: dict[str, tuple[int, int]] = {}
        for original, start, end in spans:
            span_lookup.setdefault(original, (start, end))

        errors: list[GrammarError] = []
        for e in data.get("grammar_errors", []):
            original = str(e["original"])
            start_char, end_char = span_lookup.get(original, (0, 0))
            errors.append(
                GrammarError(
                    original=original,
                    corrected=str(e["corrected"]),
                    start_char=start_char,
                    end_char=end_char,
                    category=str(e["category"]),
                    severity=str(e["severity"]),
                    explanation=str(e["explanation"]),
                    rule=str(e["rule"]),
                    example=str(e["example"]),
                )
            )

        return response_text, GrammarData(
            errors=errors,
            corrected_sentence=data.get("corrected_sentence") or None,
            overall_score=int(data.get("overall_score", 100)),
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        logger.warning(
            "grammar_parser: failed to parse LLM response user_input_length=%d",
            len(user_input),
        )
        return None, empty
