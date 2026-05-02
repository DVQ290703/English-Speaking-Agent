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
