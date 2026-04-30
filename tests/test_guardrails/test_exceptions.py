from app.guardrails.exceptions import GuardrailException


def test_exception_stores_code_and_reason():
    exc = GuardrailException(code="INPUT_INVALID", reason="empty input")
    assert exc.code == "INPUT_INVALID"
    assert exc.reason == "empty input"
    assert exc.retry_after is None


def test_exception_stores_retry_after():
    exc = GuardrailException(code="RATE_LIMITED", reason="too fast", retry_after=42)
    assert exc.retry_after == 42


def test_exception_is_exception_subclass():
    exc = GuardrailException(code="X", reason="y")
    assert isinstance(exc, Exception)


def test_exception_str_includes_code():
    exc = GuardrailException(code="TOPIC_BLOCKED", reason="hacking")
    assert "TOPIC_BLOCKED" in str(exc)
