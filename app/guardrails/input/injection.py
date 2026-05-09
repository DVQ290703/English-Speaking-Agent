from __future__ import annotations

import re
from abc import ABC, abstractmethod

from app.guardrails.exceptions import GuardrailException

_INJECTION_PATTERNS: list[str] = [
    r"ignore\s+(previous|prior|all)\s+instructions",
    r"you\s+are\s+now",
    r"reveal\s+(your\s+)?system\s+prompt",
    r"act\s+as\s+(DAN|an?\s+(unrestricted|unfiltered))",
    r"jailbreak",
    r"pretend\s+you\s+(are|have\s+no)",
    r"disregard\s+(your|all)\s+(rules|guidelines|instructions)",
    r"do\s+anything\s+now",
    r"bypass\s+(your\s+)?(safety|restrictions|filters|guidelines)",
    r"forget\s+(your\s+)?(previous\s+)?instructions",
    r"override\s+(your\s+)?(instructions|programming)",
    r"you\s+have\s+no\s+restrictions",
    r"developer\s+mode",
]

_COMPILED: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE) for p in _INJECTION_PATTERNS
]


class InjectionClassifier(ABC):
    @abstractmethod
    def classify(self, text: str) -> tuple[bool, str]:
        """Return (is_malicious, reason)."""


class RegexClassifier(InjectionClassifier):
    def classify(self, text: str) -> tuple[bool, str]:
        for pattern in _COMPILED:
            if pattern.search(text):
                return True, pattern.pattern
        return False, ""


class LLMClassifier(InjectionClassifier):
    """Plug-in slot for an LLM-backed classifier. Not yet implemented."""

    def classify(self, text: str) -> tuple[bool, str]:
        raise NotImplementedError(
            "LLM classifier not implemented. "
            "Subclass LLMClassifier and pass an instance to InjectionDetector."
        )


class InjectionDetector:
    def __init__(self, classifier: InjectionClassifier | None = None):
        self._classifier = classifier or RegexClassifier()

    def check(self, text: str) -> None:
        """Raise GuardrailException(INJECTION_DETECTED) if injection is found."""
        is_malicious, reason = self._classifier.classify(text)
        if is_malicious:
            raise GuardrailException(code="INJECTION_DETECTED", reason=reason)
