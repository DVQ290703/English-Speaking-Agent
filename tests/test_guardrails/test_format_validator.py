from app.guardrails.output.format_validator import FormatValidator


def test_clean_response_unchanged():
    v = FormatValidator()
    result = v.check("That's a great question! Let me help you practice.")
    assert result.text == "That's a great question! Let me help you practice."
    assert result.flags == []
    assert result.needs_retry is False


def test_url_stripped_when_not_in_allowlist():
    v = FormatValidator(url_allowlist=[])
    result = v.check("Visit https://example.com for more info.")
    assert "https://example.com" not in result.text
    assert result.text.strip() != ""


def test_url_preserved_when_in_allowlist():
    v = FormatValidator(url_allowlist=["https://trusted.com"])
    result = v.check("Visit https://trusted.com/page for help.")
    assert "https://trusted.com/page" in result.text


def test_url_stripped_when_not_matching_allowlist():
    v = FormatValidator(url_allowlist=["https://trusted.com"])
    result = v.check("Visit https://other.com/page for help.")
    assert "https://other.com/page" not in result.text


def test_empty_response_sets_format_invalid_and_needs_retry():
    v = FormatValidator()
    result = v.check("")
    assert "format_invalid" in result.flags
    assert result.needs_retry is True


def test_very_short_response_sets_needs_retry():
    v = FormatValidator()
    result = v.check("ok")  # 2 chars < 5
    assert "format_invalid" in result.flags
    assert result.needs_retry is True


def test_five_char_response_passes():
    v = FormatValidator()
    result = v.check("Hello")  # exactly 5 chars
    assert result.needs_retry is False
    assert "format_invalid" not in result.flags


def test_response_with_only_url_becomes_empty_and_triggers_retry():
    v = FormatValidator(url_allowlist=[])
    result = v.check("https://example.com")
    assert result.needs_retry is True
