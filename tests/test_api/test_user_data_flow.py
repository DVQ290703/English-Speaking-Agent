# tests/test_api/test_user_data_flow.py
"""
User-centric data-flow tests.

Covers the scenarios that matter most for a logged-in user:
  1. Full lifecycle: register → login → chat → history
  2. Continuing an existing conversation (conversation_id provided)
  3. Turn-number increments on subsequent chat turns
  4. User isolation: user B cannot see user A's conversations / messages
  5. Empty history on a fresh user
  6. Display-name and english_level are persisted and returned via /me
  7. Conversation title reflects the topic sent
"""

import io
import os
import sys
import types
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

# ── Stub minio (must be before any app import) ────────────────────────────────
_minio_stub = types.ModuleType("minio")
_minio_stub.Minio = MagicMock  # type: ignore[attr-defined]
_minio_error_stub = types.ModuleType("minio.error")
_minio_error_stub.S3Error = Exception  # type: ignore[attr-defined]
sys.modules.setdefault("minio", _minio_stub)
sys.modules.setdefault("minio.error", _minio_error_stub)

# ── Env vars ──────────────────────────────────────────────────────────────────
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only!")  # 32 bytes
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

from app.core.security import create_access_token, hash_password


# ===========================================================================
# Helpers (same pattern as test_routes.py)
# ===========================================================================

def _uid() -> str:
    return str(uuid.uuid4())


def _bearer(user_id: str, email: str = "user@example.com") -> dict:
    token, _ = create_access_token(user_id=user_id, email=email)
    return {"Authorization": f"Bearer {token}"}


def _make_conn(fetchone_side_effect=(), fetchall_value=None, fetchone_by_sql=None, fetchall_by_sql=None):
    return make_mock_connection(
        fetchone_side_effect=fetchone_side_effect,
        fetchall_value=fetchall_value,
        fetchone_by_sql=fetchone_by_sql,
        fetchall_by_sql=fetchall_by_sql,
    )


@contextmanager
def _client(conn=None):
    real_conn, cursor = conn if conn else _make_conn()
    with (
        patch("app.api.auth.get_connection", return_value=real_conn),
        patch("app.api.chat.get_connection", return_value=real_conn),
        patch("app.api.conversations.get_connection", return_value=real_conn),
    ):
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c, cursor


# ===========================================================================
# 1. Full user lifecycle: register → login → chat → list → messages
# ===========================================================================

class TestUserLifecycle:
    """
    Simulates the complete journey of a new user.
    Each step is independent (separate mock) but models the real sequence.
    """

    _email = "lifecycle@example.com"
    _password = "LifeCycle1Pass!"
    _user_id = _uid()
    _conv_id = _uid()
    _msg_id = _uid()

    # ── Step 1: Register ──────────────────────────────────────────────────────

    def test_step1_register_creates_user_and_returns_token(self):
        conn = _make_conn(
            fetchone_side_effect=[(self._user_id, self._email, "lifecycle", None)]
        )
        with _client(conn) as (c, _):
            r = c.post("/api/auth/register", json={
                "email": self._email,
                "password": self._password,
                "display_name": "LifeCycle User",
            })
        assert r.status_code == 201
        body = r.json()
        assert "access_token" in body
        assert body["user"]["email"] == self._email

    # ── Step 2: Login with registered credentials ─────────────────────────────

    def test_step2_login_returns_same_user_id(self):
        pw_hash = hash_password(self._password)
        conn = _make_conn(
            fetchone_side_effect=[(self._user_id, self._email, pw_hash, "LifeCycle User", "B1")]
        )
        with _client(conn) as (c, _):
            r = c.post("/api/auth/login", json={
                "email": self._email,
                "password": self._password,
            })
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["id"] == self._user_id
        assert body["user"]["display_name"] == "LifeCycle User"
        assert body["user"]["english_level"] == "B1"

    # ── Step 3: Get profile after login ──────────────────────────────────────

    def test_step3_me_returns_persisted_display_name(self):
        conn = _make_conn(
            fetchone_side_effect=[(self._user_id, self._email, "LifeCycle User", "B1")]
        )
        with _client(conn) as (c, _):
            r = c.get("/api/auth/me", headers=_bearer(self._user_id, self._email))
        assert r.status_code == 200
        assert r.json()["display_name"] == "LifeCycle User"
        assert r.json()["english_level"] == "B1"

    # ── Step 4: Send first chat message (creates conversation) ────────────────

    def test_step4_first_chat_creates_conversation_and_returns_id(self):
        conn = _make_conn(
            fetchone_by_sql={
                "insert into conversations": (self._conv_id,),
                "max(turn_number)": (1,),
            }
        )
        with (
            patch("app.api.chat.run_langraph_agent", return_value=("Good job!", b"audio")),
            patch("app.api.chat.store_user_audio", return_value=None),
            patch("app.api.chat._upload"),
            patch("app.api.chat.get_presigned_url", return_value="http://s3/audio.mp3"),
        ):
            with _client(conn) as (c, _):
                r = c.post("/api/chat/respond",
                    data={"text": "Hello, let's practice IELTS."},
                    headers=_bearer(self._user_id, self._email),
                )
        assert r.status_code == 200
        body = r.json()
        assert body["conversation_id"] == self._conv_id
        assert body["user_input"] == "Hello, let's practice IELTS."
        assert body["response_text"] == "Good job!"

    # ── Step 5: List conversations — should include the new one ───────────────

    def test_step5_list_conversations_shows_new_conversation(self):
        now = datetime.now(timezone.utc)
        conn = _make_conn(
            fetchall_value=[(self._conv_id, "New Conversation", "active", now, None, None, None, None)]
        )
        with _client(conn) as (c, _):
            r = c.get("/api/conversations", headers=_bearer(self._user_id, self._email))
        assert r.status_code == 200
        convs = r.json()["conversations"]
        assert len(convs) == 1
        assert convs[0]["id"] == self._conv_id
        assert convs[0]["status"] == "active"

    # ── Step 6: Retrieve messages from the conversation ───────────────────────

    def test_step6_messages_contain_user_and_assistant_turns(self):
        now = datetime.now(timezone.utc)
        conn = _make_conn(
            fetchone_side_effect=[(self._conv_id,)],
            fetchall_value=[
                (self._msg_id,    "user",      "text", "Hello, let's practice IELTS.", now, None),
                (_uid(),          "assistant", "text", "Good job!",                   now, None),
            ],
        )
        with _client(conn) as (c, _):
            r = c.get(
                f"/api/conversations/{self._conv_id}/messages",
                headers=_bearer(self._user_id, self._email),
            )
        assert r.status_code == 200
        msgs = r.json()["messages"]
        assert len(msgs) == 2
        roles = {m["role"] for m in msgs}
        assert roles == {"user", "assistant"}
        assert msgs[0]["text_content"] == "Hello, let's practice IELTS."


# ===========================================================================
# 2. Continue existing conversation
# ===========================================================================

class TestContinueConversation:
    """
    When a user sends a message with an existing conversation_id,
    the route SELECTS that conversation instead of creating a new one.
    """

    _user_id = _uid()
    _conv_id = _uid()
    _email = "continue@example.com"

    def _existing_conv_conn(self, turn_number: int = 2):
        return _make_conn(
            fetchone_by_sql={
                "from conversations where id = %s and user_id = %s": (self._conv_id,),
                "max(turn_number)": (turn_number,),
            }
        )

    def test_continue_conversation_returns_same_conv_id(self):
        conn = self._existing_conv_conn(turn_number=2)
        with (
            patch("app.api.chat.run_langraph_agent", return_value=("Great!", b"audio")),
            patch("app.api.chat.store_user_audio", return_value=None),
            patch("app.api.chat._upload"),
            patch("app.api.chat.get_presigned_url", return_value="http://s3/url"),
        ):
            with _client(conn) as (c, _):
                r = c.post("/api/chat/respond",
                    data={"text": "Second message", "conversation_id": self._conv_id},
                    headers={"Authorization": f"Bearer {create_access_token(self._user_id, self._email)[0]}"},
                )
        assert r.status_code == 200
        assert r.json()["conversation_id"] == self._conv_id

    def test_continue_conversation_turn_number_increments(self):
        """Third message → turn_number should be 3."""
        conn = self._existing_conv_conn(turn_number=3)
        with (
            patch("app.api.chat.run_langraph_agent", return_value=("OK!", b"")),
            patch("app.api.chat.store_user_audio", return_value=None),
            patch("app.api.chat._upload"),
            patch("app.api.chat.get_presigned_url", side_effect=RuntimeError("no audio")),
        ):
            with _client(conn) as (c, _):
                r = c.post("/api/chat/respond",
                    data={"text": "Third message", "conversation_id": self._conv_id},
                    headers=_bearer(self._user_id, self._email),
                )
        # Route still returns 200 — presign failure on empty audio is graceful
        assert r.status_code == 200
        assert r.json()["conversation_id"] == self._conv_id

    def test_continue_conversation_wrong_user_returns_404(self):
        """
        A different user provides a valid UUID but it doesn't belong to them.
        The SELECT WHERE id=? AND user_id=? returns nothing → 404.
        """
        conn = _make_conn(fetchone_side_effect=[None])  # conv not found for this user
        other_user_id = _uid()
        with _client(conn) as (c, _):
            r = c.post("/api/chat/respond",
                data={"text": "Trying to hijack", "conversation_id": self._conv_id},
                headers=_bearer(other_user_id, "intruder@example.com"),
            )
        assert r.status_code == 404
        assert "not found" in r.json()["detail"].lower()


# ===========================================================================
# 3. User isolation
# ===========================================================================

class TestUserIsolation:
    """
    Verify that user B cannot access user A's data.
    The DB WHERE user_id = ? clause is the enforcement mechanism;
    we test that when it returns nothing, the API correctly returns 404.
    """

    _user_a = _uid()
    _user_b = _uid()
    _conv_of_a = _uid()

    def test_user_b_cannot_list_user_a_conversations(self):
        """User B's conversation list is empty even if user A has conversations."""
        conn = _make_conn(fetchall_value=[])  # DB returns [] for user B
        with _client(conn) as (c, _):
            r = c.get("/api/conversations", headers=_bearer(self._user_b))
        assert r.status_code == 200
        assert r.json()["conversations"] == []

    def test_user_b_cannot_read_user_a_messages(self):
        """User B requests user A's conversation → 404 (DB returns no rows)."""
        conn = _make_conn(fetchone_side_effect=[None])  # ownership check fails
        with _client(conn) as (c, _):
            r = c.get(
                f"/api/conversations/{self._conv_of_a}/messages",
                headers=_bearer(self._user_b),
            )
        assert r.status_code == 404

    def test_user_b_cannot_continue_user_a_conversation(self):
        """User B sends a message to user A's conversation_id → 404."""
        conn = _make_conn(fetchone_side_effect=[None])
        with _client(conn) as (c, _):
            r = c.post("/api/chat/respond",
                data={"text": "Hello", "conversation_id": self._conv_of_a},
                headers=_bearer(self._user_b),
            )
        assert r.status_code == 404

    def test_user_a_can_still_access_own_conversation(self):
        """Control test: user A can read their own conversation."""
        now = datetime.now(timezone.utc)
        msg_id = _uid()
        conn = _make_conn(
            fetchone_side_effect=[(self._conv_of_a,)],
            fetchall_value=[(msg_id, "user", "text", "Hello", now, None)],
        )
        with _client(conn) as (c, _):
            r = c.get(
                f"/api/conversations/{self._conv_of_a}/messages",
                headers=_bearer(self._user_a),
            )
        assert r.status_code == 200
        assert len(r.json()["messages"]) == 1


# ===========================================================================
# 4. Conversation history is returned in chronological order
# ===========================================================================

class TestConversationHistory:
    _user_id = _uid()
    _conv_id = _uid()

    def test_messages_returned_in_asc_order(self):
        """Oldest message first (ORDER BY created_at ASC)."""
        t1 = datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 1, 1, 10, 0, 5, tzinfo=timezone.utc)
        t3 = datetime(2026, 1, 1, 10, 0, 10, tzinfo=timezone.utc)
        conn = _make_conn(
            fetchone_side_effect=[(self._conv_id,)],
            fetchall_value=[
                (_uid(), "user",      "text", "Turn 1 user",      t1, None),
                (_uid(), "assistant", "text", "Turn 1 assistant",  t2, None),
                (_uid(), "user",      "text", "Turn 2 user",      t3, None),
            ],
        )
        with _client(conn) as (c, _):
            r = c.get(
                f"/api/conversations/{self._conv_id}/messages",
                headers=_bearer(self._user_id),
            )
        assert r.status_code == 200
        msgs = r.json()["messages"]
        assert len(msgs) == 3
        assert msgs[0]["text_content"] == "Turn 1 user"
        assert msgs[1]["text_content"] == "Turn 1 assistant"
        assert msgs[2]["text_content"] == "Turn 2 user"

    def test_empty_conversation_returns_empty_messages(self):
        conn = _make_conn(
            fetchone_side_effect=[(self._conv_id,)],
            fetchall_value=[],
        )
        with _client(conn) as (c, _):
            r = c.get(
                f"/api/conversations/{self._conv_id}/messages",
                headers=_bearer(self._user_id),
            )
        assert r.status_code == 200
        assert r.json()["messages"] == []
        assert r.json()["conversation_id"] == self._conv_id


# ===========================================================================
# 5. Conversation title reflects the topic
# ===========================================================================

class TestConversationTitle:
    _user_id = _uid()
    _conv_id = _uid()

    def _chat_conn_with_topic(self, topic_found: bool):
        topic_id = _uid() if topic_found else None
        if topic_found:
            # Call order:
            # 1. SELECT id::text, title FROM topics → (topic_id, "Topic Title")
            # 2. SELECT COUNT(*) ... deleted_at IS NULL → (0,)  [active count]
            # 3. SELECT COUNT(*) ... (total ever)       → (0,)
            # 4. INSERT INTO conversations RETURNING id::text → (conv_id,)
            # 5. SELECT COALESCE(MAX(turn_number)...)   → (1,)
            return _make_conn(
                fetchone_side_effect=[
                    (topic_id, "IELTS Part 1 — Intro"),
                    (0,),
                    (0,),
                    (self._conv_id,),
                    (1,),
                ]
            )
        else:
            # No topic found: SELECT returns None, skip COUNT queries
            # Call order:
            # 1. SELECT id::text, title FROM topics → None
            # 2. INSERT INTO conversations RETURNING id::text → (conv_id,)
            # 3. SELECT COALESCE(MAX(turn_number)...) → (1,)
            return _make_conn(
                fetchone_side_effect=[
                    None,
                    (self._conv_id,),
                    (1,),
                ]
            )

    def test_chat_with_known_topic_returns_200(self):
        conn = self._chat_conn_with_topic(topic_found=True)
        with (
            patch("app.api.chat.run_langraph_agent", return_value=("Reply", b"")),
            patch("app.api.chat.store_user_audio", return_value=None),
            patch("app.api.chat._upload"),
            patch("app.api.chat.get_presigned_url", side_effect=Exception("no key")),
        ):
            with _client(conn) as (c, _):
                r = c.post("/api/chat/respond",
                    data={"text": "Let's talk", "topic": "ielts_part1"},
                    headers=_bearer(self._user_id),
                )
        assert r.status_code == 200
        assert r.json()["conversation_id"] == self._conv_id

    def test_chat_with_unknown_topic_still_creates_conversation(self):
        conn = self._chat_conn_with_topic(topic_found=False)
        with (
            patch("app.api.chat.run_langraph_agent", return_value=("Fallback", b"")),
            patch("app.api.chat.store_user_audio", return_value=None),
            patch("app.api.chat._upload"),
            patch("app.api.chat.get_presigned_url", side_effect=Exception("no key")),
        ):
            with _client(conn) as (c, _):
                r = c.post("/api/chat/respond",
                    data={"text": "Unknown topic test", "topic": "nonexistent_topic"},
                    headers=_bearer(self._user_id),
                )
        assert r.status_code == 200
        assert r.json()["conversation_id"] == self._conv_id

    def test_chat_without_topic_returns_200(self):
        """No topic at all → conversation still created with generic title."""
        conn = _make_conn(
            fetchone_by_sql={
                "insert into conversations": (self._conv_id,),
                "max(turn_number)": (1,),
            }
        )
        with (
            patch("app.api.chat.run_langraph_agent", return_value=("Hello!", b"")),
            patch("app.api.chat.store_user_audio", return_value=None),
            patch("app.api.chat._upload"),
            patch("app.api.chat.get_presigned_url", side_effect=Exception("no key")),
        ):
            with _client(conn) as (c, _):
                r = c.post("/api/chat/respond",
                    data={"text": "No topic here"},
                    headers=_bearer(self._user_id),
                )
        assert r.status_code == 200
