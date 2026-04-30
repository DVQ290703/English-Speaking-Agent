import json
import time
from unittest.mock import MagicMock, patch

import pytest

from app.guardrails.audit.logger import AuditLogger


def _call_log(logger, **overrides):
    defaults = dict(
        user_id="user-1",
        conversation_id="conv-1",
        user_input="Hello",
        response_text="Hi there!",
        guardrail_decisions={"input_valid": True, "rate_limited": False},
        flags=[],
        start_time=time.time() - 0.1,
    )
    defaults.update(overrides)
    logger.log(**defaults)


def test_log_emits_structured_json(caplog):
    import logging
    logger = AuditLogger()
    with caplog.at_level(logging.INFO):
        _call_log(logger)
    assert any("audit_event" in r.message for r in caplog.records)


def test_log_event_contains_required_fields(caplog):
    import logging
    logger = AuditLogger()
    with caplog.at_level(logging.INFO):
        _call_log(logger, flags=["contains_pii"])
    audit_record = next(r for r in caplog.records if "audit_event" in r.message)
    payload_str = audit_record.message.replace("audit_event ", "", 1)
    event = json.loads(payload_str)
    assert "event_id" in event
    assert "timestamp" in event
    assert event["user_id"] == "user-1"
    assert event["conversation_id"] == "conv-1"
    assert event["flags"] == ["contains_pii"]
    assert "latency_ms" in event
    assert event["latency_ms"] >= 0
    assert "user_input_length" in event
    assert "response_length" in event
    assert "guardrail_decisions" in event


def test_raw_text_not_in_audit_event(caplog):
    """Raw user input and response text must not appear in the audit log."""
    import logging
    logger = AuditLogger()
    with caplog.at_level(logging.INFO):
        _call_log(logger, user_input="secret message", response_text="secret reply")
    audit_record = next(r for r in caplog.records if "audit_event" in r.message)
    assert "secret message" not in audit_record.message
    assert "secret reply" not in audit_record.message


def test_audit_db_write_skipped_when_disabled(monkeypatch):
    import app.core.settings as s
    monkeypatch.setattr(s, "AUDIT_DB_ENABLED", False)
    logger = AuditLogger()
    with patch("app.guardrails.audit.logger.get_connection") as mock_get_conn:
        _call_log(logger)
    mock_get_conn.assert_not_called()


def test_audit_db_write_called_when_enabled(monkeypatch):
    import app.core.settings as s
    monkeypatch.setattr(s, "AUDIT_DB_ENABLED", True)
    mock_cursor = MagicMock()
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    logger_instance = AuditLogger()
    with patch("app.guardrails.audit.logger.get_connection", return_value=mock_conn):
        _call_log(logger_instance)
    mock_cursor.execute.assert_called_once()


def test_db_write_error_is_caught_and_logged(monkeypatch, caplog):
    import logging
    import app.core.settings as s
    monkeypatch.setattr(s, "AUDIT_DB_ENABLED", True)
    with patch("app.guardrails.audit.logger.get_connection", side_effect=Exception("db down")):
        with caplog.at_level(logging.ERROR):
            _call_log(AuditLogger())  # must not raise
    assert any("audit_log DB write failed" in r.message for r in caplog.records)
