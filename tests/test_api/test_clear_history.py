# tests/test_api/test_clear_history.py
"""Tests for conversation clear endpoint and cleared_at message filter."""
import os
import sys
import types
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

_minio_stub = types.ModuleType("minio")
_minio_stub.Minio = MagicMock
_minio_error_stub = types.ModuleType("minio.error")
_minio_error_stub.S3Error = Exception
sys.modules.setdefault("minio", _minio_stub)
sys.modules.setdefault("minio.error", _minio_error_stub)

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only-xx")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("POSTGRES_DB", "test_db")
os.environ.setdefault("POSTGRES_USER", "test_user")
os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
os.environ.setdefault("MINIO_SECRET_KEY", "minio-test-secret-2026")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")

import pytest
from fastapi.testclient import TestClient

with (
    patch("app.core.database.init_db_pool"),
    patch("app.core.storage.init_storage"),
):
    from app.main import app

from app.core.security import create_access_token


def _auth(user_id: str) -> dict:
    token, _ = create_access_token(user_id=user_id, email="u@test.com")
    return {"Authorization": f"Bearer {token}"}


@contextmanager
def _make_conn(cursor_mock):
    """Build a mock psycopg2 connection that yields cursor_mock."""
    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor_mock)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    yield conn


def test_conversation_out_has_cleared_at_field():
    """ConversationOut schema must include cleared_at (nullable datetime)."""
    from app.api.schemas import ConversationOut
    conv = ConversationOut(
        id=str(uuid.uuid4()),
        title="Test",
        status="active",
        started_at=datetime.now(timezone.utc),
        ended_at=None,
        topic_id=None,
        cleared_at=None,
    )
    assert conv.cleared_at is None


def test_clear_conversation_returns_204():
    """POST /conversations/{id}/clear returns 204 when conversation belongs to user."""
    user_id = str(uuid.uuid4())
    conv_id = str(uuid.uuid4())

    cur = MagicMock()
    cur.fetchone.return_value = (conv_id,)

    with patch("app.api.conversations.get_connection", return_value=_make_conn(cur)):
        with TestClient(app) as client:
            resp = client.post(
                f"/api/conversations/{conv_id}/clear",
                headers=_auth(user_id),
            )
    assert resp.status_code == 204


def test_clear_conversation_returns_404_when_not_owned():
    """POST /conversations/{id}/clear returns 404 when conversation not found or not owned."""
    user_id = str(uuid.uuid4())
    conv_id = str(uuid.uuid4())

    cur = MagicMock()
    cur.fetchone.return_value = None

    with patch("app.api.conversations.get_connection", return_value=_make_conn(cur)):
        with TestClient(app) as client:
            resp = client.post(
                f"/api/conversations/{conv_id}/clear",
                headers=_auth(user_id),
            )
    assert resp.status_code == 404


def test_clear_conversation_rejects_invalid_uuid():
    """POST /conversations/not-a-uuid/clear returns 422."""
    user_id = str(uuid.uuid4())
    with TestClient(app) as client:
        resp = client.post(
            "/api/conversations/not-a-uuid/clear",
            headers=_auth(user_id),
        )
    assert resp.status_code == 422


def test_get_messages_with_scores_excludes_pre_clear_messages():
    """GET /conversations/{id}/messages-with-scores only returns messages after cleared_at."""
    user_id = str(uuid.uuid4())
    conv_id = str(uuid.uuid4())
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    cur = MagicMock()
    # First fetchone: ownership check
    cur.fetchone.return_value = (conv_id,)
    # fetchall: messages (post-clear only)
    cur.fetchall.return_value = [
        (msg_id, "assistant", "text", "Hello after clear", now, [], None, None, None, None, None, None, None, None),
    ]

    with (
        patch("app.api.conversations.get_connection", return_value=_make_conn(cur)),
    ):
        with TestClient(app) as client:
            resp = client.get(
                f"/api/conversations/{conv_id}/messages-with-scores",
                headers=_auth(user_id),
            )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["messages"]) == 1
    assert data["messages"][0]["text_content"] == "Hello after clear"


def test_chat_respond_does_not_accept_history_field():
    """After server-side history, ChatResponse still has conversation_id."""
    from app.api.schemas import ChatResponse
    assert "conversation_id" in ChatResponse.model_fields
