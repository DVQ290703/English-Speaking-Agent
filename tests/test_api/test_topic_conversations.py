# tests/test_api/test_topic_conversations.py
"""Tests for for-topic and delete conversation endpoints."""
import os
import sys
import types
import uuid
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
from tests.helpers.db_mocks import make_mock_connection

with (
    patch("app.core.database.init_db_pool"),
    patch("app.core.storage.init_storage"),
):
    from app.main import app

from app.core.security import create_access_token


def _auth(user_id: str) -> dict:
    token, _ = create_access_token(user_id=user_id, email="u@test.com")
    return {"Authorization": f"Bearer {token}"}


def test_for_topic_response_schema():
    """ForTopicResponse schema is importable and validates correctly."""
    from app.api.schemas import ForTopicConversationOut, ForTopicResponse
    now = datetime.now(timezone.utc)
    conv = ForTopicConversationOut(
        id=str(uuid.uuid4()),
        title="IELTS Part 1 - Session 1",
        status="active",
        session_number=1,
        started_at=now,
        updated_at=now,
    )
    resp = ForTopicResponse(
        topic_code="ielts_part1",
        topic_title="IELTS Part 1 — Intro",
        conversations=[conv],
        total=1,
        limit_reached=False,
    )
    assert resp.limit_reached is False
    assert resp.conversations[0].session_number == 1


def test_list_conversations_excludes_deleted():
    """GET /conversations must not return conversations where deleted_at IS NOT NULL."""
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    conn, _ = make_mock_connection(
        fetchall_value=[
            # Only one row — the soft-deleted one is absent (filtered by SQL)
            (str(uuid.uuid4()), "Live Session", "active", now, None, None, None, "ielts_part1"),
        ]
    )
    with patch("app.api.conversations.get_connection", return_value=conn):
        with TestClient(app) as client:
            resp = client.get("/api/conversations", headers=_auth(user_id))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["conversations"]) == 1
    assert data["conversations"][0]["title"] == "Live Session"


def test_for_topic_returns_conversations_with_session_number():
    """GET /conversations/for-topic returns conversations with session_number."""
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    conn, _ = make_mock_connection(
        fetchall_by_sql={
            "select count(*) from conversations c2": [
                (str(uuid.uuid4()), "IELTS Part 1 — Intro - Session 2", "active", now, now, 2),
                (str(uuid.uuid4()), "IELTS Part 1 — Intro - Session 1", "active", now, now, 1),
            ],
        },
        fetchone_by_sql={
            "select id::text, title from topics": ("topic-uuid", "IELTS Part 1 — Intro"),
            "select count(*)": (2,),
        },
    )
    with patch("app.api.conversations.get_connection", return_value=conn):
        with TestClient(app) as client:
            resp = client.get(
                "/api/conversations/for-topic",
                params={"topic_code": "ielts_part1"},
                headers=_auth(user_id),
            )
    assert resp.status_code == 200
    data = resp.json()
    assert data["topic_code"] == "ielts_part1"
    assert data["topic_title"] == "IELTS Part 1 — Intro"
    assert len(data["conversations"]) == 2
    assert data["conversations"][0]["session_number"] == 2
    assert data["limit_reached"] is False
    assert data["total"] == 2


def test_for_topic_limit_reached_when_5_conversations():
    """GET /conversations/for-topic sets limit_reached=True when total == 5."""
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    five_convs = [
        (str(uuid.uuid4()), f"Session {i}", "active", now, now, i)
        for i in range(5, 0, -1)
    ]
    conn, _ = make_mock_connection(
        fetchall_by_sql={"select count(*) from conversations c2": five_convs},
        fetchone_by_sql={
            "select id::text, title from topics": ("topic-uuid", "IELTS Part 1 — Intro"),
            "select count(*)": (5,),
        },
    )
    with patch("app.api.conversations.get_connection", return_value=conn):
        with TestClient(app) as client:
            resp = client.get(
                "/api/conversations/for-topic",
                params={"topic_code": "ielts_part1"},
                headers=_auth(user_id),
            )
    assert resp.status_code == 200
    data = resp.json()
    assert data["limit_reached"] is True
    assert data["total"] == 5


def test_for_topic_missing_topic_code_returns_422():
    """GET /conversations/for-topic without topic_code returns 422."""
    user_id = str(uuid.uuid4())
    with TestClient(app) as client:
        resp = client.get("/api/conversations/for-topic", headers=_auth(user_id))
    assert resp.status_code == 422


def test_for_topic_unknown_topic_returns_empty():
    """GET /conversations/for-topic with unknown topic_code returns 200 with empty list."""
    user_id = str(uuid.uuid4())
    conn, _ = make_mock_connection(
        fetchone_by_sql={"select id::text, title from topics": None},
    )
    with patch("app.api.conversations.get_connection", return_value=conn):
        with TestClient(app) as client:
            resp = client.get(
                "/api/conversations/for-topic",
                params={"topic_code": "nonexistent_topic"},
                headers=_auth(user_id),
            )
    assert resp.status_code == 200
    body = resp.json()
    assert body["conversations"] == []
    assert body["total"] == 0
    assert body["limit_reached"] is False


def test_delete_conversation_returns_204():
    """DELETE /conversations/{id} soft-deletes a conversation owned by user."""
    user_id = str(uuid.uuid4())
    conv_id = str(uuid.uuid4())
    conn, _ = make_mock_connection(
        fetchone_by_sql={"returning id": (conv_id,)},
    )
    with patch("app.api.conversations.get_connection", return_value=conn):
        with TestClient(app) as client:
            resp = client.delete(
                f"/api/conversations/{conv_id}",
                headers=_auth(user_id),
            )
    assert resp.status_code == 204


def test_delete_conversation_returns_404_when_not_owned():
    """DELETE /conversations/{id} returns 404 when conversation not found or not owned."""
    user_id = str(uuid.uuid4())
    conv_id = str(uuid.uuid4())
    conn, _ = make_mock_connection(
        fetchone_by_sql={"returning id": None},
    )
    with patch("app.api.conversations.get_connection", return_value=conn):
        with TestClient(app) as client:
            resp = client.delete(
                f"/api/conversations/{conv_id}",
                headers=_auth(user_id),
            )
    assert resp.status_code == 404


def test_delete_conversation_rejects_invalid_uuid():
    """DELETE /conversations/not-a-uuid returns 422."""
    user_id = str(uuid.uuid4())
    with TestClient(app) as client:
        resp = client.delete(
            "/api/conversations/not-a-uuid",
            headers=_auth(user_id),
        )
    assert resp.status_code == 422


def test_chat_respond_returns_409_when_5_conversations_exist():
    """POST /chat/respond returns 409 when user already has 5 non-deleted conversations for this topic."""
    from unittest.mock import patch as _patch
    user_id = str(uuid.uuid4())
    topic_id = str(uuid.uuid4())
    conn, cursor = make_mock_connection(
        fetchone_by_sql={
            "select id::text, title from topics": (topic_id, "IELTS Part 1 — Intro"),
            "select count(*) from conversations where user_id": (5,),
        },
    )
    with (
        _patch("app.api.chat.get_connection", return_value=conn),
        _patch("app.api.chat.run_langraph_agent", return_value=("Hello", b"", None)),
        _patch("app.api.chat._synthesize_audio_bytes", return_value=b""),
        _patch("app.api.chat.store_user_audio", return_value=(None, "audio/webm")),
        _patch("app.api.chat._upload"),
    ):
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/respond",
                headers=_auth(user_id),
                data={"text": "Hello", "topic": "ielts_part1"},
            )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "Conversation limit reached"


def test_chat_respond_creates_conversation_with_session_title():
    """POST /chat/respond creates conversation titled '{topic_title} - Session N'."""
    from unittest.mock import patch as _patch, call as _call
    user_id = str(uuid.uuid4())
    topic_id = str(uuid.uuid4())
    new_conv_id = str(uuid.uuid4())
    # fetchone_side_effect is consumed in call order:
    # 1. SELECT id::text, title FROM topics → (topic_id, topic_title)
    # 2. SELECT COUNT(*) ... deleted_at IS NULL → (0,)   [active count]
    # 3. SELECT COUNT(*) ... (total ever)       → (0,)
    # 4. INSERT ... RETURNING id::text           → (new_conv_id,)
    # 5. SELECT COALESCE(MAX(turn_number)...)    → (1,)
    # 6. _fetch_visible_history uses fetchall, not fetchone
    conn, cursor = make_mock_connection(
        fetchone_side_effect=[
            (topic_id, "IELTS Part 1 — Intro"),
            (0,),
            (0,),
            (new_conv_id,),
            (1,),
        ],
    )
    with (
        _patch("app.api.chat.get_connection", return_value=conn),
        _patch("app.api.chat.run_langraph_agent", return_value=("Hello!", b"", None)),
        _patch("app.api.chat._synthesize_audio_bytes", return_value=b""),
        _patch("app.api.chat.store_user_audio", return_value=(None, "audio/webm")),
        _patch("app.api.chat._upload"),
    ):
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/respond",
                headers=_auth(user_id),
                data={"text": "Hello", "topic": "ielts_part1"},
            )
    assert resp.status_code == 200
    # Check the cursor was called with an INSERT that contains the session title
    insert_calls = [str(c) for c in cursor.execute.call_args_list]
    title_insert = next(
        (c for c in insert_calls if "insert into conversations" in c.lower()), None
    )
    assert title_insert is not None
    assert "Session 1" in title_insert
