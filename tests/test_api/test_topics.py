"""Unit tests for GET /api/topics/categories"""
import os
import sys
import types
from unittest.mock import MagicMock, patch

_minio_stub = types.ModuleType("minio")
_minio_stub.Minio = MagicMock  # type: ignore[attr-defined]
_minio_error_stub = types.ModuleType("minio.error")
_minio_error_stub.S3Error = Exception  # type: ignore[attr-defined]
sys.modules.setdefault("minio", _minio_stub)
sys.modules.setdefault("minio.error", _minio_error_stub)

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only!")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("POSTGRES_DB", "test_db")
os.environ.setdefault("POSTGRES_USER", "test_user")
os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
os.environ.setdefault("MINIO_SECRET_KEY", "minio-test-secret-2026")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key-2026")

from fastapi.testclient import TestClient

with (
    patch("app.core.database.init_db_pool"),
    patch("app.core.storage.init_storage"),
):
    from app.main import app

client = TestClient(app, raise_server_exceptions=True)


def make_mock_conn(rows):
    """Return a mock psycopg2 context-manager connection whose cursor yields `rows`."""
    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = rows
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return mock_conn


def test_get_categories_returns_grouped_structure():
    """Two rows from the same category should be nested under one category object."""
    db_rows = [
        # cat_code, cat_title, cat_sort, topic_code, topic_title, topic_desc, difficulty, topic_sort
        ("ielts", "IELTS Speaking", 1, "ielts_part1", "Part 1", "Intro questions", "beginner", 1),
        ("ielts", "IELTS Speaking", 1, "ielts_part2", "Part 2", "Long turn", "intermediate", 2),
    ]
    mock_conn = make_mock_conn(db_rows)
    with patch("app.api.topics.get_connection", return_value=mock_conn):
        resp = client.get("/api/topics/categories")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    cat = data[0]
    assert cat["code"] == "ielts"
    assert cat["title"] == "IELTS Speaking"
    assert cat["sort_order"] == 1
    assert len(cat["topics"]) == 2
    assert cat["topics"][0]["code"] == "ielts_part1"
    assert cat["topics"][1]["code"] == "ielts_part2"


def test_get_categories_two_categories():
    """Rows from two distinct categories produce two top-level objects."""
    db_rows = [
        ("ielts",    "IELTS Speaking", 1, "ielts_part1", "Part 1", None, "beginner",     1),
        ("business", "Business",       2, "business_job_interview", "Job Interview", None, "intermediate", 1),
    ]
    mock_conn = make_mock_conn(db_rows)
    with patch("app.api.topics.get_connection", return_value=mock_conn):
        resp = client.get("/api/topics/categories")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["code"] == "ielts"
    assert data[1]["code"] == "business"


def test_get_categories_empty_db():
    """Empty DB returns an empty list (not an error)."""
    mock_conn = make_mock_conn([])
    with patch("app.api.topics.get_connection", return_value=mock_conn):
        resp = client.get("/api/topics/categories")

    assert resp.status_code == 200
    assert resp.json() == []


def test_get_categories_no_auth_required():
    """Endpoint must be accessible without an Authorization header."""
    mock_conn = make_mock_conn([])
    with patch("app.api.topics.get_connection", return_value=mock_conn):
        resp = client.get("/api/topics/categories")
    assert resp.status_code == 200
