# tests/test_api/test_routes.py
"""
Unit tests for app.api.routes
Covers: POST /api/auth/login
        POST /api/auth/register
        GET  /api/auth/me
        POST /api/chat/respond
        GET  /api/conversations
        GET  /api/conversations/{id}/messages

All external services (DB, MinIO, LLM, TTS, STT) are mocked.
"""

import base64
import io
import os
import sys
import types
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch, call

# ── Stub `minio` BEFORE any app import ───────────────────────────────────────
_minio_stub = types.ModuleType("minio")
_minio_stub.Minio = MagicMock  # type: ignore[attr-defined]
_minio_error_stub = types.ModuleType("minio.error")
_minio_error_stub.S3Error = Exception  # type: ignore[attr-defined]
sys.modules.setdefault("minio", _minio_stub)
sys.modules.setdefault("minio.error", _minio_error_stub)

# ── Env BEFORE importing app ──────────────────────────────────────────────────
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only-xx")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password")
os.environ.setdefault("POSTGRES_DB", "test_db")
os.environ.setdefault("POSTGRES_USER", "test_user")
os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
os.environ.setdefault("MINIO_SECRET_KEY", "minioadmin")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")

import pytest
from fastapi.testclient import TestClient

# Import app ONCE — reused across all tests with per-test patches
with (
    patch("app.core.database.init_db_pool"),
    patch("app.core.storage.init_storage"),
):
    from app.main import app

from app.core.security import create_access_token, hash_password


# ===========================================================================
# Helpers
# ===========================================================================

def _new_uuid() -> str:
    return str(uuid.uuid4())


def _make_bearer(user_id: str, email: str = "user@example.com") -> dict:
    token, _ = create_access_token(user_id=user_id, email=email)
    return {"Authorization": f"Bearer {token}"}


def _make_conn(fetchone_side_effect=(), fetchall_value=None):
    """
    Build a fresh mock psycopg2 connection.

    - fetchone_side_effect: iterable of values returned successively by
      cursor.fetchone(); each call pops the next item.
    - fetchall_value: value returned by cursor.fetchall().
    """
    cursor = MagicMock()
    if fetchone_side_effect:
        cursor.fetchone.side_effect = list(fetchone_side_effect)
    if fetchall_value is not None:
        cursor.fetchall.return_value = fetchall_value

    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return conn, cursor


@contextmanager
def _client(conn=None):
    """
    Yield a TestClient with get_connection mocked to *conn*.
    *conn* may be a (conn, cursor) pair or None for a bare mock.
    """
    if conn is None:
        real_conn, cursor = _make_conn()
    else:
        real_conn, cursor = conn

    with patch("app.api.routes.get_connection", return_value=real_conn):
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c, cursor


# ===========================================================================
# POST /api/auth/login
# ===========================================================================

class TestLogin:
    _user_id = _new_uuid()
    _email = "alice@example.com"
    _password = "Password123!"

    def _ok_conn(self):
        pw_hash = hash_password(self._password)
        return _make_conn(
            fetchone_side_effect=[(self._user_id, self._email, pw_hash, "Alice", "B2")]
        )

    def test_login_happy_path_returns_200_with_token(self):
        with _client(self._ok_conn()) as (c, _):
            r = c.post("/api/auth/login", json={"email": self._email, "password": self._password})
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"
        assert body["expires_in"] > 0
        assert body["user"]["email"] == self._email
        assert body["user"]["id"] == self._user_id

    def test_login_response_contains_display_name(self):
        with _client(self._ok_conn()) as (c, _):
            r = c.post("/api/auth/login", json={"email": self._email, "password": self._password})
        assert r.json()["user"]["display_name"] == "Alice"

    def test_login_email_is_lowercased(self):
        with _client(self._ok_conn()) as (c, _):
            r = c.post("/api/auth/login", json={"email": "ALICE@EXAMPLE.COM", "password": self._password})
        assert r.status_code == 200

    def test_login_user_not_found_returns_401(self):
        conn = _make_conn(fetchone_side_effect=[None])
        with _client(conn) as (c, _):
            r = c.post("/api/auth/login", json={"email": "ghost@example.com", "password": "AnyPass1!"})
        assert r.status_code == 401

    def test_login_wrong_password_returns_401(self):
        with _client(self._ok_conn()) as (c, _):
            r = c.post("/api/auth/login", json={"email": self._email, "password": "WrongPass!"})
        assert r.status_code == 401

    def test_login_invalid_email_format_returns_422(self):
        with _client() as (c, _):
            r = c.post("/api/auth/login", json={"email": "not-an-email", "password": "pass"})
        assert r.status_code == 422

    def test_login_missing_password_returns_422(self):
        with _client() as (c, _):
            r = c.post("/api/auth/login", json={"email": self._email})
        assert r.status_code == 422


# ===========================================================================
# POST /api/auth/register
# ===========================================================================

class TestRegister:
    _user_id = _new_uuid()
    _email = "bob@example.com"
    _password = "Secure1Pass!"

    def _ok_conn(self):
        return _make_conn(
            fetchone_side_effect=[(self._user_id, self._email, "Bob", "A2")]
        )

    def test_register_happy_path_returns_201(self):
        with _client(self._ok_conn()) as (c, _):
            r = c.post(
                "/api/auth/register",
                json={"email": self._email, "password": self._password, "display_name": "Bob", "english_level": "A2"},
            )
        assert r.status_code == 201
        body = r.json()
        assert "access_token" in body
        assert body["user"]["email"] == self._email

    def test_register_response_token_is_valid_jwt(self):
        from app.core.security import decode_token
        with _client(self._ok_conn()) as (c, _):
            r = c.post("/api/auth/register", json={"email": self._email, "password": self._password})
        assert r.status_code == 201
        payload = decode_token(r.json()["access_token"])
        assert payload["sub"] == self._user_id

    def test_register_display_name_defaults_to_email_prefix(self):
        conn = _make_conn(fetchone_side_effect=[(_new_uuid(), "charlie@example.com", "charlie", None)])
        with _client(conn) as (c, _):
            r = c.post("/api/auth/register", json={"email": "charlie@example.com", "password": "ValidPass1!"})
        assert r.status_code == 201

    def test_register_password_too_short_returns_400(self):
        with _client() as (c, _):
            r = c.post("/api/auth/register", json={"email": self._email, "password": "short"})
        assert r.status_code == 400
        assert "8 characters" in r.json()["detail"]

    def test_register_duplicate_email_returns_400(self):
        import psycopg2
        conn, cursor = _make_conn()
        cursor.execute.side_effect = psycopg2.errors.UniqueViolation("dup key")
        with _client((conn, cursor)) as (c, _):
            r = c.post("/api/auth/register", json={"email": self._email, "password": self._password})
        assert r.status_code == 400
        assert "already registered" in r.json()["detail"]

    def test_register_invalid_email_returns_422(self):
        with _client() as (c, _):
            r = c.post("/api/auth/register", json={"email": "bademail@@", "password": self._password})
        assert r.status_code == 422


# ===========================================================================
# GET /api/auth/me
# ===========================================================================

class TestMe:
    _user_id = _new_uuid()
    _email = "carol@example.com"

    def _headers(self):
        return _make_bearer(self._user_id, self._email)

    def _ok_conn(self):
        return _make_conn(fetchone_side_effect=[(self._user_id, self._email, "Carol", "C1")])

    def test_me_happy_path_returns_user(self):
        with _client(self._ok_conn()) as (c, _):
            r = c.get("/api/auth/me", headers=self._headers())
        assert r.status_code == 200
        assert r.json()["email"] == self._email
        assert r.json()["id"] == self._user_id

    def test_me_returns_display_name_and_english_level(self):
        conn = _make_conn(fetchone_side_effect=[(self._user_id, self._email, "Carol Nguyen", "C1")])
        with _client(conn) as (c, _):
            r = c.get("/api/auth/me", headers=self._headers())
        assert r.json()["display_name"] == "Carol Nguyen"
        assert r.json()["english_level"] == "C1"

    def test_me_no_token_returns_401(self):
        """HTTPBearer raises 401 when the Authorization header is missing."""
        with _client() as (c, _):
            r = c.get("/api/auth/me")
        assert r.status_code == 401

    def test_me_invalid_token_returns_401(self):
        with _client() as (c, _):
            r = c.get("/api/auth/me", headers={"Authorization": "Bearer bad.token.value"})
        assert r.status_code == 401

    def test_me_user_not_found_in_db_returns_401(self):
        conn = _make_conn(fetchone_side_effect=[None])
        with _client(conn) as (c, _):
            r = c.get("/api/auth/me", headers=self._headers())
        assert r.status_code == 401


# ===========================================================================
# POST /api/chat/respond  (logged-in user)
# ===========================================================================

class TestChatRespond:
    _user_id = _new_uuid()
    _conv_id = _new_uuid()
    _email = "dave@example.com"

    def _headers(self):
        return _make_bearer(self._user_id, self._email)

    def _new_conv_conn(self):
        """
        Fetchone sequence for Block-1 of a fresh conversation (no topic, text mode):
          1. topic SELECT → None (miss)
          2. INSERT conversations RETURNING id → conv_id
          3. MAX(turn_number) + 1 → 1
        Block-2 writes do not read fetchone.
        """
        return _make_conn(
            fetchone_side_effect=[
                None,              # topic lookup miss
                (self._conv_id,),  # new conv id
                (1,),              # turn_number
            ]
        )

    def test_chat_respond_text_happy_path(self):
        with (
            _client(self._new_conv_conn()) as (c, _),
            patch("app.api.routes.normalize_history", return_value=[]),
            patch("app.api.routes.run_langraph_agent", return_value=("Great job!", b"mp3data")),
            patch("app.api.routes.store_user_audio", return_value=None),
            patch("app.api.routes._upload"),
            patch("app.api.routes.get_presigned_url", return_value="http://minio/audio.mp3"),
        ):
            r = c.post(
                "/api/chat/respond",
                data={"text": "Tell me about IELTS", "topic": "ielts1"},
                headers=self._headers(),
            )
        assert r.status_code == 200
        body = r.json()
        assert body["user_input"] == "Tell me about IELTS"
        assert body["response_text"] == "Great job!"
        assert body["conversation_id"] == self._conv_id

    def test_chat_respond_audio_base64_is_correct(self):
        # No topic sent → no topic SELECT → sequence is: conv INSERT, turn_number
        fresh_conn = _make_conn(
            fetchone_side_effect=[(self._conv_id,), (1,)]
        )
        with (
            patch("app.api.routes.normalize_history", return_value=[]),
            patch("app.api.routes.run_langraph_agent", return_value=("Reply!", b"audiodata")),
            patch("app.api.routes.store_user_audio", return_value=None),
            patch("app.api.routes._upload"),
            patch("app.api.routes.get_presigned_url", return_value="http://minio/url"),
        ):
            with _client(fresh_conn) as (c, _):
                r = c.post("/api/chat/respond", data={"text": "Hello"}, headers=self._headers())
        assert r.status_code == 200, f"Unexpected {r.status_code}: {r.text}"
        assert base64.b64decode(r.json()["audio_base64"]) == b"audiodata"

    def test_chat_respond_audio_mode_calls_stt(self):
        with (
            _client(self._new_conv_conn()) as (c, _),
            patch("app.api.routes.transcribe_audio", return_value="I said hello") as mock_stt,
            patch("app.api.routes.normalize_history", return_value=[]),
            patch("app.api.routes.run_langraph_agent", return_value=("Nice!", b"mp3")),
            patch("app.api.routes.store_user_audio", return_value=("key", "audio/webm")),
            patch("app.api.routes._upload"),
            patch("app.api.routes.get_presigned_url", return_value="http://minio/url"),
        ):
            r = c.post(
                "/api/chat/respond",
                data={"topic": "daily"},
                files={"audio_file": ("rec.webm", io.BytesIO(b"small-audio"), "audio/webm")},
                headers=self._headers(),
            )
        assert r.status_code == 200
        mock_stt.assert_called_once()

    def test_chat_respond_no_input_returns_400(self):
        with _client() as (c, _):
            r = c.post("/api/chat/respond", data={"text": "   "}, headers=self._headers())
        assert r.status_code == 400

    def test_chat_respond_no_auth_returns_401(self):
        """HTTPBearer raises 401 when the Authorization header is missing."""
        with _client() as (c, _):
            r = c.post("/api/chat/respond", data={"text": "Hello"})
        assert r.status_code == 401

    def test_chat_respond_invalid_conversation_id_returns_400(self):
        with _client() as (c, _):
            r = c.post(
                "/api/chat/respond",
                data={"text": "Hello", "conversation_id": "not-a-uuid"},
                headers=self._headers(),
            )
        assert r.status_code == 400

    def test_chat_respond_audio_upload_too_large_returns_413(self):
        big = b"x" * (25 * 1024 * 1024 + 1)
        with _client() as (c, _):
            r = c.post(
                "/api/chat/respond",
                data={"text": ""},
                files={"audio_file": ("big.webm", io.BytesIO(big), "audio/webm")},
                headers=self._headers(),
            )
        assert r.status_code == 413

    def test_chat_respond_conversation_not_found_returns_404(self):
        conn = _make_conn(fetchone_side_effect=[None])
        with (
            _client(conn) as (c, _),
            patch("app.api.routes.normalize_history", return_value=[]),
            patch("app.api.routes.run_langraph_agent", return_value=("reply", b"")),
        ):
            r = c.post(
                "/api/chat/respond",
                data={"text": "Hello", "conversation_id": _new_uuid()},
                headers=self._headers(),
            )
        assert r.status_code == 404


# ===========================================================================
# GET /api/conversations
# ===========================================================================

class TestListConversations:
    _user_id = _new_uuid()
    _email = "eve@example.com"
    _conv_id = _new_uuid()

    def _headers(self):
        return _make_bearer(self._user_id, self._email)

    def test_list_conversations_happy_path(self):
        now = datetime.now(timezone.utc)
        conn = _make_conn(fetchall_value=[(self._conv_id, "IELTS Part 1", "active", now, None, None)])
        with _client(conn) as (c, _):
            r = c.get("/api/conversations", headers=self._headers())
        assert r.status_code == 200
        body = r.json()
        assert len(body["conversations"]) == 1
        assert body["conversations"][0]["id"] == self._conv_id

    def test_list_conversations_empty_list(self):
        conn = _make_conn(fetchall_value=[])
        with _client(conn) as (c, _):
            r = c.get("/api/conversations", headers=self._headers())
        assert r.status_code == 200
        assert r.json()["conversations"] == []

    def test_list_conversations_no_auth_returns_401(self):
        """HTTPBearer raises 401 when the Authorization header is missing."""
        with _client() as (c, _):
            r = c.get("/api/conversations")
        assert r.status_code == 401

    def test_list_conversations_invalid_token_returns_401(self):
        with _client() as (c, _):
            r = c.get("/api/conversations", headers={"Authorization": "Bearer invalid.token.here"})
        assert r.status_code == 401


# ===========================================================================
# GET /api/conversations/{id}/messages
# ===========================================================================

class TestGetConversationMessages:
    _user_id = _new_uuid()
    _email = "frank@example.com"
    _conv_id = _new_uuid()
    _msg_id = _new_uuid()

    def _headers(self):
        return _make_bearer(self._user_id, self._email)

    def test_get_messages_happy_path(self):
        now = datetime.now(timezone.utc)
        conn = _make_conn(
            fetchone_side_effect=[(self._conv_id,)],
            fetchall_value=[
                (self._msg_id, "user", "text", "Hello AI", now, None),
                (_new_uuid(), "assistant", "text", "Hello human!", now, None),
            ],
        )
        with _client(conn) as (c, _):
            r = c.get(f"/api/conversations/{self._conv_id}/messages", headers=self._headers())
        assert r.status_code == 200
        body = r.json()
        assert body["conversation_id"] == self._conv_id
        assert len(body["messages"]) == 2

    def test_get_messages_audio_url_generated_when_storage_key_present(self):
        now = datetime.now(timezone.utc)
        conn = _make_conn(
            fetchone_side_effect=[(self._conv_id,)],
            fetchall_value=[(self._msg_id, "user", "audio", "transcript", now, "audio/key/path.mp3")],
        )
        with (
            _client(conn) as (c, _),
            patch("app.api.routes.get_presigned_url", return_value="http://minio/presigned"),
        ):
            r = c.get(f"/api/conversations/{self._conv_id}/messages", headers=self._headers())
        assert r.status_code == 200
        assert r.json()["messages"][0]["audio_url"] == "http://minio/presigned"

    def test_get_messages_no_audio_url_when_storage_key_is_null(self):
        now = datetime.now(timezone.utc)
        conn = _make_conn(
            fetchone_side_effect=[(self._conv_id,)],
            fetchall_value=[(self._msg_id, "assistant", "text", "Hello!", now, None)],
        )
        with _client(conn) as (c, _):
            r = c.get(f"/api/conversations/{self._conv_id}/messages", headers=self._headers())
        assert r.status_code == 200
        assert r.json()["messages"][0]["audio_url"] is None

    def test_get_messages_presign_failure_does_not_propagate(self):
        now = datetime.now(timezone.utc)
        conn = _make_conn(
            fetchone_side_effect=[(self._conv_id,)],
            fetchall_value=[(self._msg_id, "user", "audio", "text", now, "bad/key")],
        )
        with (
            _client(conn) as (c, _),
            patch("app.api.routes.get_presigned_url", side_effect=RuntimeError("MinIO down")),
        ):
            r = c.get(f"/api/conversations/{self._conv_id}/messages", headers=self._headers())
        assert r.status_code == 200
        assert r.json()["messages"][0]["audio_url"] is None

    def test_get_messages_no_auth_returns_401(self):
        """HTTPBearer raises 401 when the Authorization header is missing."""
        with _client() as (c, _):
            r = c.get(f"/api/conversations/{self._conv_id}/messages")
        assert r.status_code == 401

    def test_get_messages_invalid_uuid_returns_400(self):
        with _client() as (c, _):
            r = c.get("/api/conversations/not-a-uuid/messages", headers=self._headers())
        assert r.status_code == 400

    def test_get_messages_conversation_not_found_returns_404(self):
        conn = _make_conn(fetchone_side_effect=[None])
        with _client(conn) as (c, _):
            r = c.get(f"/api/conversations/{self._conv_id}/messages", headers=self._headers())
        assert r.status_code == 404


# ===========================================================================
# Health check (smoke)
# ===========================================================================

class TestHealthCheck:
    def test_health_check_returns_ok(self):
        with _client() as (c, _):
            r = c.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}
