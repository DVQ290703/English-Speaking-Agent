"""Parse the structured LLM JSON output into grammar domain objects."""
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


def parse_grammar_response(
    raw_json: str | None, user_input: str
) -> tuple[str | None, GrammarData]:
    """Parse the LLM JSON blob into (response_text, GrammarData).

    Returns (None, empty GrammarData) when raw_json is None or malformed.
    Never raises.
    """
    empty = GrammarData()
    if not raw_json:
        return None, empty
    try:
        data = json.loads(raw_json)
        response_text = data.get("response_text", "").strip() or None
        errors = [
            GrammarError(
                original=str(e["original"]),
                corrected=str(e["corrected"]),
                start_char=int(e["start_char"]),
                end_char=int(e["end_char"]),
                category=str(e["category"]),
                severity=str(e["severity"]),
                explanation=str(e["explanation"]),
                rule=str(e["rule"]),
                example=str(e["example"]),
            )
            for e in data.get("grammar_errors", [])
        ]
        return response_text, GrammarData(
            errors=errors,
            corrected_sentence=data.get("corrected_sentence") or None,
            overall_score=int(data.get("overall_score", 100)),
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        logger.warning("grammar_parser: failed to parse LLM response user_input_length=%d", len(user_input))
        return None, empty
