from __future__ import annotations

import json
from dataclasses import dataclass, field

from app.core.logger import get_logger
from app.core.telemetry import span_context
from app.guardrails.output.content_filter import ContentFilter

_log = get_logger("guardrail")


@dataclass
class OutputGuardrailsResult:
    text: str
    flags: list[str] = field(default_factory=list)
    needs_retry: bool = False


class OutputGuardrails:
    """Run output content filter (PII redaction only)."""

    def __init__(self, content_filter: ContentFilter | None = None):
        self._content_filter = content_filter or ContentFilter()

    def check(self, text: str) -> OutputGuardrailsResult:
        """Return PII-redacted text and flags. Never raises."""
        with span_context("guardrail.output", kind="guardrail"):
            cf_result = self._content_filter.check(text)
            result = OutputGuardrailsResult(text=cf_result.text, flags=cf_result.flags)

        pii_redacted = "contains_pii" in result.flags
        _log.info(json.dumps({
            "event": "guardrail.output.check",
            "result": "pass",
            "pii_redacted": pii_redacted,
            "output_length": len(text),
        }))
        return result
