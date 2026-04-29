import json
from unittest.mock import MagicMock, patch

from app.guardrails.hitl.router import HITLRouter


def _make_mock_conn():
    mock_cursor = MagicMock()
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return mock_conn, mock_cursor


def test_no_flags_does_not_insert():
    mock_conn, mock_cursor = _make_mock_conn()
    with patch("app.guardrails.hitl.router.get_connection", return_value=mock_conn):
        router = HITLRouter()
        result = router.route(
            flags=[],
            conversation_id="conv-1",
            message_id="msg-1",
            user_input="Hello",
            response_text="Hi there!",
        )
    assert result is False
    mock_cursor.execute.assert_not_called()


def test_flags_present_inserts_into_hitl_queue():
    mock_conn, mock_cursor = _make_mock_conn()
    with patch("app.guardrails.hitl.router.get_connection", return_value=mock_conn):
        router = HITLRouter()
        result = router.route(
            flags=["is_toxic"],
            conversation_id="conv-2",
            message_id="msg-2",
            user_input="bad input",
            response_text="fallback",
        )
    assert result is True
    mock_cursor.execute.assert_called_once()
    call_args = mock_cursor.execute.call_args
    sql = call_args[0][0]
    params = call_args[0][1]
    assert "hitl_queue" in sql
    assert params[4] == json.dumps(["is_toxic"])


def test_db_error_returns_false_without_raising():
    mock_conn, mock_cursor = _make_mock_conn()
    mock_cursor.execute.side_effect = Exception("DB down")
    with patch("app.guardrails.hitl.router.get_connection", return_value=mock_conn):
        router = HITLRouter()
        result = router.route(
            flags=["is_toxic"],
            conversation_id="conv-3",
            message_id="msg-3",
            user_input="input",
            response_text="output",
        )
    assert result is False  # never raises — degraded gracefully


def test_multiple_flags_all_stored():
    mock_conn, mock_cursor = _make_mock_conn()
    with patch("app.guardrails.hitl.router.get_connection", return_value=mock_conn):
        router = HITLRouter()
        router.route(
            flags=["is_toxic", "contains_pii"],
            conversation_id="conv-4",
            message_id="msg-4",
            user_input="input",
            response_text="output",
        )
    params = mock_cursor.execute.call_args[0][1]
    stored_flags = json.loads(params[4])
    assert "is_toxic" in stored_flags
    assert "contains_pii" in stored_flags
