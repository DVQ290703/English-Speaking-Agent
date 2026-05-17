class GuardrailException(Exception):
    """Raised by any guardrail check to signal a blocked request."""

    def __init__(self, code: str, reason: str = "", retry_after: int | None = None):
        self.code = code
        self.reason = reason
        self.retry_after = retry_after
        super().__init__(f"{code}: {reason}")
