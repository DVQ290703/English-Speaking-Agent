# tests/test_api/test_audio_proxy.py
"""Tests for GET /api/audio/{storage_key} proxy endpoint."""
import os
import sys
import types
import uuid
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


def test_audio_proxy_returns_audio_bytes():
    """GET /api/audio/{key} streams MinIO bytes with correct content-type and cache headers."""
    user_id = str(uuid.uuid4())
    storage_key = f"conversations/{uuid.uuid4()}/assistant_tts/{uuid.uuid4()}.mp3"

    fake_audio = b"ID3fakemp3bytes"

    mock_response = MagicMock()
    mock_response.read.return_value = fake_audio
    mock_response.getheader.return_value = "audio/mpeg"

    mock_client = MagicMock()
    mock_client.get_object.return_value = mock_response

    with patch("app.api.audio.get_minio_client", return_value=mock_client):
        with TestClient(app) as client:
            resp = client.get(
                f"/api/audio/{storage_key}",
                headers=_auth(user_id),
            )

    assert resp.status_code == 200
    assert resp.content == fake_audio
    assert "audio" in resp.headers["content-type"]
    assert "max-age" in resp.headers.get("cache-control", "")


def test_audio_proxy_returns_404_for_missing_key():
    """GET /api/audio/{key} returns 404 when the object does not exist in MinIO."""
    user_id = str(uuid.uuid4())
    storage_key = "conversations/fake/missing.mp3"

    mock_client = MagicMock()
    mock_client.get_object.side_effect = Exception("NoSuchKey")

    with patch("app.api.audio.get_minio_client", return_value=mock_client):
        with TestClient(app) as client:
            resp = client.get(
                f"/api/audio/{storage_key}",
                headers=_auth(user_id),
            )

    assert resp.status_code == 404
