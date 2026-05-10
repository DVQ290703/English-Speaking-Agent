"""Tests for app/api/oauth.py"""
from unittest.mock import MagicMock, patch
import pytest


# ---------------------------------------------------------------------------
# Login endpoint
# ---------------------------------------------------------------------------

def test_oauth_login_google_returns_auth_url(client, monkeypatch):
    mock_redis = MagicMock()
    monkeypatch.setattr("app.api.oauth._get_redis", lambda: mock_redis)

    resp = client.get("/api/auth/oauth/login/google")

    assert resp.status_code == 200
    data = resp.json()
    assert "auth_url" in data
    assert "accounts.google.com" in data["auth_url"]
    assert "state=" in data["auth_url"]
    assert "response_type=code" in data["auth_url"]
    mock_redis.setex.assert_called_once()


def test_oauth_login_microsoft_returns_auth_url(client, monkeypatch):
    mock_redis = MagicMock()
    monkeypatch.setattr("app.api.oauth._get_redis", lambda: mock_redis)

    resp = client.get("/api/auth/oauth/login/microsoft")

    assert resp.status_code == 200
    assert "login.microsoftonline.com" in resp.json()["auth_url"]


def test_oauth_login_facebook_returns_auth_url(client, monkeypatch):
    mock_redis = MagicMock()
    monkeypatch.setattr("app.api.oauth._get_redis", lambda: mock_redis)

    resp = client.get("/api/auth/oauth/login/facebook")

    assert resp.status_code == 200
    assert "facebook.com" in resp.json()["auth_url"]


def test_oauth_login_invalid_provider_returns_400(client, monkeypatch):
    mock_redis = MagicMock()
    monkeypatch.setattr("app.api.oauth._get_redis", lambda: mock_redis)

    resp = client.get("/api/auth/oauth/login/twitter")

    assert resp.status_code == 400


def test_build_auth_url_contains_required_params():
    from app.api.oauth import build_auth_url
    url = build_auth_url("google", "test_state_abc")
    assert "accounts.google.com" in url
    assert "state=test_state_abc" in url
    assert "response_type=code" in url
    assert "openid" in url
    assert "redirect_uri=" in url
