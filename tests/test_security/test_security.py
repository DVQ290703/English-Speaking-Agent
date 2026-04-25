# tests/test_security/test_security.py
"""
Unit tests for app.core.security
Covers: hash_password, verify_password, create_access_token, decode_token,
        get_current_user_id
"""

import time
import uuid
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

# ── env must be set before any app import ────────────────────────────────────
import os
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only!")  # 32 bytes
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")

from app.core.security import (
    create_access_token,
    decode_token,
    get_current_user_id,
    hash_password,
    verify_password,
)
from app.core import settings as _settings

# ---------------------------------------------------------------------------
# hash_password
# ---------------------------------------------------------------------------

class TestHashPassword:
    def test_hash_password_returns_string(self):
        result = hash_password("Password123!")
        assert isinstance(result, str)

    def test_hash_password_is_bcrypt_format(self):
        result = hash_password("Password123!")
        assert result.startswith("$2b$") or result.startswith("$2a$")

    def test_hash_password_different_hashes_same_input(self):
        """Each call should produce a unique salt → different hash."""
        h1 = hash_password("SamePassword!")
        h2 = hash_password("SamePassword!")
        assert h1 != h2

    def test_hash_password_empty_string(self):
        result = hash_password("")
        assert isinstance(result, str)
        assert len(result) > 0


# ---------------------------------------------------------------------------
# verify_password
# ---------------------------------------------------------------------------

class TestVerifyPassword:
    def test_verify_password_correct(self):
        plain = "CorrectHorse#99"
        hashed = hash_password(plain)
        assert verify_password(plain, hashed) is True

    def test_verify_password_wrong(self):
        hashed = hash_password("RealPassword1!")
        assert verify_password("WrongPassword!", hashed) is False

    def test_verify_password_empty_plain(self):
        hashed = hash_password("SomePassword1!")
        assert verify_password("", hashed) is False

    def test_verify_password_invalid_hash_returns_false(self):
        """Corrupted hash must not raise — should return False."""
        result = verify_password("Password1!", "not-a-bcrypt-hash")
        assert result is False

    def test_verify_password_case_sensitive(self):
        plain = "CaseSensitive1!"
        hashed = hash_password(plain)
        assert verify_password("casesensitive1!", hashed) is False


# ---------------------------------------------------------------------------
# create_access_token
# ---------------------------------------------------------------------------

class TestCreateAccessToken:
    def test_create_access_token_returns_tuple(self):
        uid = str(uuid.uuid4())
        token, expires_in = create_access_token(user_id=uid, email="test@example.com")
        assert isinstance(token, str)
        assert isinstance(expires_in, int)

    def test_create_access_token_expires_in_positive(self):
        uid = str(uuid.uuid4())
        _, expires_in = create_access_token(user_id=uid, email="test@example.com")
        assert expires_in > 0

    def test_create_access_token_payload_contains_sub(self):
        uid = str(uuid.uuid4())
        token, _ = create_access_token(user_id=uid, email="user@example.com")
        decoded = jwt.decode(
            token,
            _settings.JWT_SECRET_KEY,
            algorithms=[_settings.JWT_ALGORITHM],
        )
        assert decoded["sub"] == uid

    def test_create_access_token_payload_contains_email(self):
        uid = str(uuid.uuid4())
        email = "check@example.com"
        token, _ = create_access_token(user_id=uid, email=email)
        decoded = jwt.decode(
            token,
            _settings.JWT_SECRET_KEY,
            algorithms=[_settings.JWT_ALGORITHM],
        )
        assert decoded["email"] == email

    def test_create_access_token_payload_contains_iat_exp(self):
        uid = str(uuid.uuid4())
        token, _ = create_access_token(user_id=uid, email="x@example.com")
        decoded = jwt.decode(
            token,
            _settings.JWT_SECRET_KEY,
            algorithms=[_settings.JWT_ALGORITHM],
        )
        assert "iat" in decoded
        assert "exp" in decoded
        assert decoded["exp"] > decoded["iat"]

    def test_create_access_token_expires_in_matches_config(self):
        uid = str(uuid.uuid4())
        _, expires_in = create_access_token(user_id=uid, email="e@example.com")
        expected = _settings.JWT_EXPIRE_MINUTES * 60
        # Allow ±2 s of clock drift
        assert abs(expires_in - expected) <= 2


# ---------------------------------------------------------------------------
# decode_token
# ---------------------------------------------------------------------------

class TestDecodeToken:
    def _make_token(self, uid=None, email="t@example.com"):
        uid = uid or str(uuid.uuid4())
        token, _ = create_access_token(user_id=uid, email=email)
        return token, uid

    def test_decode_token_happy_path(self):
        token, uid = self._make_token()
        payload = decode_token(token)
        assert payload["sub"] == uid

    def test_decode_token_invalid_token_raises_401(self):
        with pytest.raises(HTTPException) as exc_info:
            decode_token("this.is.not.a.jwt")
        assert exc_info.value.status_code == 401

    def test_decode_token_wrong_secret_raises_401(self):
        uid = str(uuid.uuid4())
        bad_token = jwt.encode(
            {"sub": uid, "exp": int(time.time()) + 3600},
            "a-completely-different-secret-k!",  # 32 bytes, intentionally wrong
            algorithm=_settings.JWT_ALGORITHM,
        )
        with pytest.raises(HTTPException) as exc_info:
            decode_token(bad_token)
        assert exc_info.value.status_code == 401

    def test_decode_token_expired_raises_401(self):
        uid = str(uuid.uuid4())
        expired_token = jwt.encode(
            {"sub": uid, "exp": int(time.time()) - 1},
            _settings.JWT_SECRET_KEY,
            algorithm=_settings.JWT_ALGORITHM,
        )
        with pytest.raises(HTTPException) as exc_info:
            decode_token(expired_token)
        assert exc_info.value.status_code == 401

    def test_decode_token_empty_string_raises_401(self):
        with pytest.raises(HTTPException) as exc_info:
            decode_token("")
        assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# get_current_user_id
# ---------------------------------------------------------------------------

class TestGetCurrentUserID:
    def _make_credentials(self, uid=None, email="u@example.com"):
        uid = uid or str(uuid.uuid4())
        token, _ = create_access_token(user_id=uid, email=email)
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        return creds, uid

    def test_get_current_user_id_happy_path(self):
        creds, uid = self._make_credentials()
        result = get_current_user_id(credentials=creds)
        assert result == uid

    def test_get_current_user_id_invalid_token_raises_401(self):
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad.token.here")
        with pytest.raises(HTTPException) as exc_info:
            get_current_user_id(credentials=creds)
        assert exc_info.value.status_code == 401

    def test_get_current_user_id_missing_sub_raises_401(self):
        """Token without 'sub' claim must raise 401."""
        token_no_sub = jwt.encode(
            {"email": "x@x.com", "exp": int(time.time()) + 3600},
            _settings.JWT_SECRET_KEY,
            algorithm=_settings.JWT_ALGORITHM,
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token_no_sub)
        with pytest.raises(HTTPException) as exc_info:
            get_current_user_id(credentials=creds)
        assert exc_info.value.status_code == 401
