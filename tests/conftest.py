"""
tests/conftest.py
Shared fixtures used across all test modules.
"""

import os
import sys
import types
import uuid
from unittest.mock import MagicMock, patch

# ── Stub the `minio` package before any app module is imported ────────────────
_minio_stub = types.ModuleType("minio")
_minio_stub.Minio = MagicMock  # type: ignore[attr-defined]
_minio_error_stub = types.ModuleType("minio.error")
_minio_error_stub.S3Error = Exception  # type: ignore[attr-defined]
sys.modules.setdefault("minio", _minio_stub)
sys.modules.setdefault("minio.error", _minio_error_stub)

import pytest
from fastapi.testclient import TestClient

# ── Patch external services BEFORE importing app ──────────────────────────────
# Prevents real DB/MinIO/AI connections during import-time initialization.

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only!")  # 32 bytes
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("POSTGRES_DB", "test_db")
os.environ.setdefault("POSTGRES_USER", "test_user")
os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
os.environ.setdefault("MINIO_SECRET_KEY", "minio-test-secret-2026")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")


# ---------------------------------------------------------------------------
# Reusable helpers
# ---------------------------------------------------------------------------

def make_user_id() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# App-level fixture (patched DB + storage)
# ---------------------------------------------------------------------------

@pytest.fixture()
def mock_db_conn():
    """Return a mock psycopg2 connection + cursor pair."""
    mock_cursor = MagicMock()
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return mock_conn, mock_cursor


@pytest.fixture()
def client(mock_db_conn):
    """FastAPI TestClient with DB, MinIO, and AI services mocked out."""
    mock_conn, _ = mock_db_conn

    with (
        patch("app.core.database.init_db_pool"),
        patch("app.core.storage.init_storage"),
        patch("app.core.database.get_connection", return_value=mock_conn),
    ):
        from app.main import app
        with TestClient(app, raise_server_exceptions=True) as c:
            yield c


# ---------------------------------------------------------------------------
# Auth helper: pre-built JWT for a given user_id
# ---------------------------------------------------------------------------

@pytest.fixture()
def auth_headers():
    """Factory fixture: returns a function that generates Bearer headers."""
    from app.core.security import create_access_token

    def _make(user_id: str | None = None, email: str = "alice@example.com"):
        uid = user_id or make_user_id()
        token, _ = create_access_token(user_id=uid, email=email)
        return {"Authorization": f"Bearer {token}"}, uid

    return _make
