import json
import logging

from app.guardrails.output import OutputGuardrails


def test_clean_output_passes_through():
    g = OutputGuardrails()
    result = g.check("Great job on your pronunciation!")
    assert result.text == "Great job on your pronunciation!"
    assert result.flags == []
    assert result.needs_retry is False


def test_pii_redacted():
    g = OutputGuardrails()
    result = g.check("Contact alice@example.com for help.")
    assert "alice@example.com" not in result.text
    assert "contains_pii" in result.flags


def test_custom_content_filter_injected():
    from unittest.mock import MagicMock
    from app.guardrails.output.content_filter import ContentFilterResult
    mock_cf = MagicMock()
    mock_cf.check.return_value = ContentFilterResult(text="safe text", flags=["contains_pii"])
    g = OutputGuardrails(content_filter=mock_cf)
    result = g.check("any input")
    assert result.text == "safe text"
    assert "contains_pii" in result.flags
    mock_cf.check.assert_called_once_with("any input")


def test_pass_event_emitted(caplog):
    with caplog.at_level(logging.INFO, logger="AI-Lab-Agent.guardrail"):
        g = OutputGuardrails()
        g.check("Great job!")

    events = [
        json.loads(r.message)
        for r in caplog.records
        if r.name == "AI-Lab-Agent.guardrail"
    ]
    assert len(events) == 1
    e = events[0]
    assert e["event"] == "guardrail.output.check"
    assert e["result"] == "pass"
    assert e["pii_redacted"] is False
    assert e["output_length"] == len("Great job!")


def test_pii_redacted_event_emitted(caplog):
    with caplog.at_level(logging.INFO, logger="AI-Lab-Agent.guardrail"):
        g = OutputGuardrails()
        g.check("Contact alice@example.com for help.")

    events = [
        json.loads(r.message)
        for r in caplog.records
        if r.name == "AI-Lab-Agent.guardrail"
    ]
    assert len(events) == 1
    e = events[0]
    assert e["event"] == "guardrail.output.check"
    assert e["result"] == "pass"
    assert e["pii_redacted"] is True
