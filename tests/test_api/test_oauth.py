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


# ---------------------------------------------------------------------------
# exchange_code_for_identity
# ---------------------------------------------------------------------------

def test_exchange_code_google_extracts_identity(monkeypatch):
    fake_claims = {
        "sub": "google_uid_456",
        "email": "alice@gmail.com",
        "email_verified": True,
        "name": "Alice",
        "picture": "https://example.com/pic.jpg",
    }
    mock_token_resp = MagicMock()
    mock_token_resp.json.return_value = {"id_token": "header.payload.sig", "access_token": "acc"}
    mock_token_resp.raise_for_status = MagicMock()

    mock_signing_key = MagicMock()
    mock_signing_key.key = "fake_key"
    mock_jwks_client = MagicMock()
    mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key

    with (
        patch("app.api.oauth.httpx.post", return_value=mock_token_resp),
        patch("app.api.oauth.PyJWKClient", return_value=mock_jwks_client),
        patch("app.api.oauth.jwt.decode", return_value=fake_claims),
    ):
        from app.api.oauth import exchange_code_for_identity
        identity = exchange_code_for_identity("google", "test_code")

    assert identity["provider_user_id"] == "google_uid_456"
    assert identity["email"] == "alice@gmail.com"
    assert identity["email_verified"] is True
    assert identity["name"] == "Alice"
    assert identity["tenant_id"] is None


def test_exchange_code_microsoft_uses_oid_and_always_verified(monkeypatch):
    fake_claims = {
        "oid": "ms_oid_789",
        "email": "bob@company.com",
        "name": "Bob",
        "tid": "tenant_abc",
    }
    mock_token_resp = MagicMock()
    mock_token_resp.json.return_value = {"id_token": "header.payload.sig"}
    mock_token_resp.raise_for_status = MagicMock()

    mock_signing_key = MagicMock()
    mock_signing_key.key = "fake_key"
    mock_jwks_client = MagicMock()
    mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key

    with (
        patch("app.api.oauth.httpx.post", return_value=mock_token_resp),
        patch("app.api.oauth.PyJWKClient", return_value=mock_jwks_client),
        patch("app.api.oauth.jwt.decode", return_value=fake_claims),
    ):
        from app.api.oauth import exchange_code_for_identity
        identity = exchange_code_for_identity("microsoft", "test_code")

    assert identity["provider_user_id"] == "ms_oid_789"
    assert identity["email_verified"] is True  # always True for Microsoft
    assert identity["tenant_id"] == "tenant_abc"


def test_exchange_code_facebook_with_email(monkeypatch):
    mock_token_resp = MagicMock()
    mock_token_resp.json.return_value = {"access_token": "fb_token"}
    mock_token_resp.raise_for_status = MagicMock()

    mock_graph_resp = MagicMock()
    mock_graph_resp.json.return_value = {
        "id": "fb_uid_999",
        "name": "Carol",
        "email": "carol@example.com",
        "picture": {"data": {"url": "https://example.com/carol.jpg"}},
    }
    mock_graph_resp.raise_for_status = MagicMock()

    with (
        patch("app.api.oauth.httpx.post", return_value=mock_token_resp),
        patch("app.api.oauth.httpx.get", return_value=mock_graph_resp),
    ):
        from app.api.oauth import exchange_code_for_identity
        identity = exchange_code_for_identity("facebook", "test_code")

    assert identity["provider_user_id"] == "fb_uid_999"
    assert identity["email"] == "carol@example.com"
    assert identity["email_verified"] is True
    assert identity["picture"] == "https://example.com/carol.jpg"


def test_exchange_code_facebook_no_email(monkeypatch):
    mock_token_resp = MagicMock()
    mock_token_resp.json.return_value = {"access_token": "fb_token"}
    mock_token_resp.raise_for_status = MagicMock()

    mock_graph_resp = MagicMock()
    mock_graph_resp.json.return_value = {"id": "fb_phone_user", "name": "Dave"}
    mock_graph_resp.raise_for_status = MagicMock()

    with (
        patch("app.api.oauth.httpx.post", return_value=mock_token_resp),
        patch("app.api.oauth.httpx.get", return_value=mock_graph_resp),
    ):
        from app.api.oauth import exchange_code_for_identity
        identity = exchange_code_for_identity("facebook", "test_code")

    assert identity["email"] is None
    assert identity["email_verified"] is False
