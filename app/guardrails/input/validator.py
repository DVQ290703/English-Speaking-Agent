import re

from app.core import settings
from app.guardrails.exceptions import GuardrailException


class InputValidator:
    """Reject empty/oversized input and normalize whitespace."""

    def check(self, text: str) -> str:
        """Return normalized text, or raise GuardrailException."""
        if not text or not text.strip():
            raise GuardrailException(code="INPUT_INVALID", reason="Input must not be empty")
        if len(text) > settings.MAX_INPUT_CHARS:
            raise GuardrailException(
                code="INPUT_TOO_LONG",
                reason=f"Input exceeds {settings.MAX_INPUT_CHARS} characters",
            )
        return re.sub(r"\s+", " ", text).strip()
