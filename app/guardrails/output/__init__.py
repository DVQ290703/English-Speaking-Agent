from __future__ import annotations

from dataclasses import dataclass, field

from app.core.telemetry import span_context
from app.guardrails.output.content_filter import ContentFilter


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
            return OutputGuardrailsResult(text=cf_result.text, flags=cf_result.flags)
