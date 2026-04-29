import json
import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only!")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key-2026")


def _make_mock_conn(rows=None):
    mock_cursor = MagicMock()
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    if rows is not None:
        mock_cursor.fetchall.return_value = rows
        mock_cursor.fetchone.return_value = rows[0] if rows else None
    return mock_conn, mock_cursor


@pytest.fixture()
def hitl_client():
    from fastapi import FastAPI
    from app.guardrails.hitl.review_api import router
    app = FastAPI()
    app.include_router(router)
    return TestClient(app, raise_server_exceptions=True)


ADMIN_HEADERS = {"x-admin-key": "test-admin-key-2026"}
BAD_HEADERS = {"x-admin-key": "wrong-key"}


def test_list_queue_requires_admin_key(hitl_client):
    resp = hitl_client.get("/api/admin/hitl/queue")
    assert resp.status_code == 422  # missing header


def test_list_queue_rejects_wrong_key(hitl_client):
    with patch("app.guardrails.hitl.review_api.get_connection"):
        resp = hitl_client.get("/api/admin/hitl/queue", headers=BAD_HEADERS)
    assert resp.status_code == 403


def test_list_queue_returns_items(hitl_client):
    from datetime import datetime
    rows = [
        ("id-1", "conv-1", "msg-1", "hello", "hi", ["is_toxic"], "pending", datetime.utcnow())
    ]
    mock_conn, _ = _make_mock_conn(rows)
    with patch("app.guardrails.hitl.review_api.get_connection", return_value=mock_conn):
        resp = hitl_client.get("/api/admin/hitl/queue", headers=ADMIN_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["id"] == "id-1"


def test_review_item_updates_status(hitl_client):
    mock_conn, mock_cursor = _make_mock_conn(rows=[("id-1",)])
    with patch("app.guardrails.hitl.review_api.get_connection", return_value=mock_conn):
        resp = hitl_client.post(
            "/api/admin/hitl/id-1/review",
            json={"reviewer_notes": "Looks like a false positive"},
            headers=ADMIN_HEADERS,
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "reviewed"


def test_review_item_404_when_not_found(hitl_client):
    mock_conn, mock_cursor = _make_mock_conn(rows=[])
    mock_cursor.fetchone.return_value = None
    with patch("app.guardrails.hitl.review_api.get_connection", return_value=mock_conn):
        resp = hitl_client.post(
            "/api/admin/hitl/nonexistent/review",
            json={"reviewer_notes": ""},
            headers=ADMIN_HEADERS,
        )
    assert resp.status_code == 404


def test_dismiss_item(hitl_client):
    mock_conn, mock_cursor = _make_mock_conn(rows=[("id-2",)])
    with patch("app.guardrails.hitl.review_api.get_connection", return_value=mock_conn):
        resp = hitl_client.post(
            "/api/admin/hitl/id-2/dismiss",
            headers=ADMIN_HEADERS,
        )
    assert resp.status_code == 200
    assert resp.json()["status"] == "dismissed"


def test_dismiss_item_404_when_not_found(hitl_client):
    mock_conn, mock_cursor = _make_mock_conn(rows=[])
    mock_cursor.fetchone.return_value = None
    with patch("app.guardrails.hitl.review_api.get_connection", return_value=mock_conn):
        resp = hitl_client.post(
            "/api/admin/hitl/nonexistent/dismiss",
            headers=ADMIN_HEADERS,
        )
    assert resp.status_code == 404
