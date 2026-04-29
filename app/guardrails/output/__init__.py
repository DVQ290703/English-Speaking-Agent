from __future__ import annotations

from dataclasses import dataclass, field

from app.core import settings
from app.guardrails.output.content_filter import ContentFilter
from app.guardrails.output.format_validator import FormatValidator


@dataclass
class OutputGuardrailsResult:
    text: str
    flags: list[str] = field(default_factory=list)
    needs_retry: bool = False


class OutputGuardrails:
    """Orchestrate output checks: content filter → format validator."""

    def __init__(
        self,
        content_filter: ContentFilter | None = None,
        format_validator: FormatValidator | None = None,
        format_validator_allowlist: list[str] | None = None,
    ):
        self._content_filter = content_filter or ContentFilter()
        self._format_validator = format_validator or FormatValidator(
            url_allowlist=format_validator_allowlist
            if format_validator_allowlist is not None
            else settings.URL_ALLOWLIST
        )

    def check(self, text: str) -> OutputGuardrailsResult:
        """Return cleaned text and combined flags. Never raises."""
        cf_result = self._content_filter.check(text)
        fv_result = self._format_validator.check(cf_result.text)

        flags = list(dict.fromkeys(cf_result.flags + fv_result.flags))
        return OutputGuardrailsResult(
            text=fv_result.text,
            flags=flags,
            needs_retry=fv_result.needs_retry,
        )
