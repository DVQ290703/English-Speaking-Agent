from app.guardrails.output.content_filter import ContentFilter, SAFE_FALLBACK


def test_clean_text_passes_unchanged():
    f = ContentFilter()
    result = f.check("Great job! Your pronunciation is improving.")
    assert result.text == "Great job! Your pronunciation is improving."
    assert result.flags == []


def test_toxic_content_replaced_with_fallback():
    f = ContentFilter()
    result = f.check("fuck you, go to hell")
    assert result.text == SAFE_FALLBACK
    assert "is_toxic" in result.flags


def test_email_redacted():
    f = ContentFilter()
    result = f.check("Contact me at alice@example.com for more info.")
    assert "alice@example.com" not in result.text
    assert "[EMAIL REDACTED]" in result.text
    assert "contains_pii" in result.flags


def test_phone_redacted():
    f = ContentFilter()
    result = f.check("Call me at +1-800-555-0100 anytime.")
    assert "+1-800-555-0100" not in result.text
    assert "[PHONE REDACTED]" in result.text
    assert "contains_pii" in result.flags


def test_api_key_redacted():
    f = ContentFilter()
    result = f.check("Use this key: sk-abcdefghijklmnopqrstuvwxyz12345678")
    assert "sk-abcdefghijklmnopqrstuvwxyz12345678" not in result.text
    assert "[KEY REDACTED]" in result.text
    assert "contains_pii" in result.flags


def test_bearer_token_redacted():
    f = ContentFilter()
    result = f.check("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")
    assert "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" not in result.text
    assert "[KEY REDACTED]" in result.text
    assert "contains_pii" in result.flags


def test_credit_card_redacted():
    f = ContentFilter()
    result = f.check("Pay with card 4111 1111 1111 1111 please.")
    assert "4111 1111 1111 1111" not in result.text
    assert "[CARD REDACTED]" in result.text
    assert "contains_pii" in result.flags


def test_multiple_pii_types_redacted():
    f = ContentFilter()
    result = f.check("Email: bob@test.com, Phone: 555-123-4567")
    assert "bob@test.com" not in result.text
    assert "555-123-4567" not in result.text
    assert "contains_pii" in result.flags


def test_pii_flag_not_duplicated():
    f = ContentFilter()
    result = f.check("alice@a.com and bob@b.com are both here")
    assert result.flags.count("contains_pii") == 1


def test_toxic_content_wins_over_pii():
    """Toxicity check replaces entire response; PII redaction does not run on fallback."""
    f = ContentFilter()
    result = f.check("fuck you, also email me at x@y.com")
    assert result.text == SAFE_FALLBACK
    assert "is_toxic" in result.flags
