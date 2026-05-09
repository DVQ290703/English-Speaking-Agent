from __future__ import annotations

import re

from app.guardrails.exceptions import GuardrailException

_DEFAULT_RULES: list[tuple[str, str]] = [
    (r"\bhack(ing|ed|er)?\b", "hacking"),
    (r"\b(sql\s*injection|xss|cross.site\s*scripting|exploit|malware|ransomware|ddos|botnet)\b", "hacking"),
    (r"\bhow\s+to\s+make\s+(a\s+)?bomb\b", "weapons"),
    (r"\bexplosives?\b", "weapons"),
    (r"\b(buy|sell|purchase)\s+(drugs|cocaine|heroin|meth|fentanyl)\b", "illegal_activity"),
    (r"\bhow\s+to\s+(kill|murder|assault|stab|shoot)\b", "illegal_activity"),
    (r"\bcsam\b|\bchild\s+pornography\b", "illegal_activity"),
    (r"\b(methods?\s+of\s+)?self.?harm\b", "self_harm"),
    (r"\bsuicide\s+(method|instruction|how)", "self_harm"),
]


class TopicFilter:
    def __init__(self, extra_patterns: list[str] | None = None):
        self._rules: list[tuple[re.Pattern, str]] = [
            (re.compile(pattern, re.IGNORECASE), category)
            for pattern, category in _DEFAULT_RULES
        ]
        for pattern in (extra_patterns or []):
            self._rules.append((re.compile(pattern, re.IGNORECASE), "custom"))

    def check(self, text: str) -> None:
        """Raise GuardrailException(TOPIC_BLOCKED) if a blocked topic is detected."""
        for compiled, category in self._rules:
            if compiled.search(text):
                raise GuardrailException(
                    code="TOPIC_BLOCKED",
                    reason=f"Input contains blocked topic: {category}",
                )
