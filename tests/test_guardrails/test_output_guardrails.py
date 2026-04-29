from app.guardrails.output import OutputGuardrails
from app.guardrails.output.content_filter import SAFE_FALLBACK


def test_clean_output_passes_through():
    g = OutputGuardrails()
    result = g.check("Great job on your pronunciation!")
    assert result.text == "Great job on your pronunciation!"
    assert result.flags == []
    assert result.needs_retry is False


def test_toxic_content_replaced_with_fallback():
    g = OutputGuardrails()
    result = g.check("fuck you go to hell")
    assert result.text == SAFE_FALLBACK
    assert "is_toxic" in result.flags


def test_pii_redacted():
    g = OutputGuardrails()
    result = g.check("Contact alice@example.com for help.")
    assert "alice@example.com" not in result.text
    assert "contains_pii" in result.flags


def test_url_stripped():
    g = OutputGuardrails(format_validator_allowlist=[])
    result = g.check("Visit https://example.com for more details.")
    assert "https://example.com" not in result.text


def test_empty_response_triggers_retry():
    g = OutputGuardrails()
    result = g.check("")
    assert result.needs_retry is True
    assert "format_invalid" in result.flags


def test_flags_aggregated_from_both_checks():
    """PII in response that also becomes very short after URL strip."""
    g = OutputGuardrails(format_validator_allowlist=[])
    # Email is redacted, then remaining text is checked for length
    result = g.check("alice@example.com")
    # After PII redaction: "[EMAIL REDACTED]" — 17 chars, so no retry
    assert "contains_pii" in result.flags
    assert result.needs_retry is False
