import pytest

from app.guardrails.exceptions import GuardrailException
from app.guardrails.input.validator import InputValidator


def test_empty_string_raises_input_invalid():
    v = InputValidator()
    with pytest.raises(GuardrailException) as exc_info:
        v.check("")
    assert exc_info.value.code == "INPUT_INVALID"


def test_whitespace_only_raises_input_invalid():
    v = InputValidator()
    with pytest.raises(GuardrailException) as exc_info:
        v.check("   \t\n  ")
    assert exc_info.value.code == "INPUT_INVALID"


def test_too_long_raises_input_too_long(monkeypatch):
    import app.core.settings as s
    monkeypatch.setattr(s, "MAX_INPUT_CHARS", 10)
    v = InputValidator()
    with pytest.raises(GuardrailException) as exc_info:
        v.check("a" * 11)
    assert exc_info.value.code == "INPUT_TOO_LONG"


def test_exactly_max_length_passes(monkeypatch):
    import app.core.settings as s
    monkeypatch.setattr(s, "MAX_INPUT_CHARS", 10)
    v = InputValidator()
    result = v.check("a" * 10)
    assert result == "a" * 10


def test_whitespace_normalized():
    v = InputValidator()
    result = v.check("hello   world\t  foo")
    assert result == "hello world foo"


def test_leading_trailing_whitespace_stripped():
    v = InputValidator()
    result = v.check("  hello world  ")
    assert result == "hello world"


def test_valid_input_returned():
    v = InputValidator()
    result = v.check("How do I improve my English?")
    assert result == "How do I improve my English?"
