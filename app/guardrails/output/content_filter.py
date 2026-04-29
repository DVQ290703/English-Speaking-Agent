from __future__ import annotations

import re
from dataclasses import dataclass, field

SAFE_FALLBACK = "I'm sorry, I can't provide that response. Please ask me something else."

_TOXICITY_PATTERNS: list[str] = [
    r"\bfuck\s+you\b",
    r"\bgo\s+to\s+hell\b",
    r"\bi\s+will\s+kill\s+you\b",
    r"\bkill\s+yourself\b",
    r"\byou\s+stupid\s+(idiot|moron|bastard)\b",
    r"\bpiece\s+of\s+shit\b",
]

_TOXICITY_COMPILED: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE) for p in _TOXICITY_PATTERNS
]

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
        """Block toxic content; redact PII. Never raises — degrades gracefully."""
        # Toxicity check — replace entire response if detected
        for pattern in _TOXICITY_COMPILED:
            if pattern.search(text):
                return ContentFilterResult(text=SAFE_FALLBACK, flags=["is_toxic"])

        # PII redaction — replace in-place
        flags: list[str] = []
        result = text
        for pattern, replacement in _PII_RULES:
            new_text = pattern.sub(replacement, result)
            if new_text != result:
                if "contains_pii" not in flags:
                    flags.append("contains_pii")
                result = new_text

        return ContentFilterResult(text=result, flags=flags)
