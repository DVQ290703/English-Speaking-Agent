from __future__ import annotations

import re
from dataclasses import dataclass, field

_PII_RULES: list[tuple[re.Pattern, str]] = [
    # Email
    (re.compile(r"[\w.+\-]+@[\w\-]+\.[\w.\-]+"), "[EMAIL REDACTED]"),
    # US phone numbers (various formats)
    (re.compile(r"\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b"), "[PHONE REDACTED]"),
    # API keys (sk-... style)
    (re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"), "[KEY REDACTED]"),
    # Bearer tokens
    (re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*"), "[KEY REDACTED]"),
    # Credit cards (16-digit groups)
    (re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b"), "[CARD REDACTED]"),
]


@dataclass
class ContentFilterResult:
    text: str
    flags: list[str] = field(default_factory=list)


class ContentFilter:
    def check(self, text: str) -> ContentFilterResult:
        """Redact PII from output text. Never raises."""
        flags: list[str] = []
        result = text
        for pattern, replacement in _PII_RULES:
            new_text = pattern.sub(replacement, result)
            if new_text != result:
                if "contains_pii" not in flags:
                    flags.append("contains_pii")
                result = new_text
        return ContentFilterResult(text=result, flags=flags)
