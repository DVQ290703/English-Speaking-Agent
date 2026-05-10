# OAuth Login (Google + Microsoft + Facebook) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google, Microsoft, and Facebook social login to the app using Authorization Code Flow with a backend callback that issues the existing JWT session.

**Architecture:** Provider redirects back to the FastAPI backend (`GET /api/auth/oauth/callback/{provider}`), which exchanges the code for an identity, runs find-or-create against the DB, issues a JWT via the existing `create_access_token`, then HTTP-redirects the browser to the frontend `/auth/callback` page with the token in the URL fragment. The frontend reads the fragment and calls `AuthContext.login()` — the same entry point as email/password login.

**Tech Stack:** FastAPI, PyJWT (PyJWKClient), httpx, Redis (already wired), psycopg2, React 18 JSX, react-icons, react-router-dom v6

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `db_schema/schema.sql` | Modify | Add `email_verified` cols to users, relax NOT NULL constraints, add `oauth_accounts` table |
| `app/core/settings.py` | Modify | Add 6 OAuth env vars + APP_BASE_URL + FRONTEND_URL |
| `app/api/oauth.py` | Create | OAuth router: login URL, callback, identity extraction, find-or-create |
| `app/api/router.py` | Modify | Register oauth_router |
| `tests/test_api/test_oauth.py` | Create | All backend OAuth tests |
| `tests/conftest.py` | Modify | Add APP_BASE_URL + FRONTEND_URL defaults |
| `frontend/src/api/config.ts` | Modify | Add oauth endpoints to ENDPOINTS |
| `frontend/src/components/auth/OAuthButtons.jsx` | Create | Three-provider OAuth buttons |
| `frontend/src/pages/OAuthCallbackPage.jsx` | Create | Fragment reader → AuthContext.login() |
| `frontend/src/router.tsx` | Modify | Add `/auth/callback` route under PublicRoute |
| `frontend/src/pages/LoginPage.jsx` | Modify | Import and render OAuthButtons below the form |

---

## Task 1: DB Schema — Update `users` and add `oauth_accounts`

**Files:**
- Modify: `db_schema/schema.sql:21-31`

- [ ] **Step 1: Replace the `users` table definition**

Open `db_schema/schema.sql`. The current `users` CREATE TABLE starts at line 21. Replace it entirely:

```sql
CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               CITEXT UNIQUE,              -- NULL allowed: Facebook phone-only accounts
    password_hash       TEXT,                        -- NULL allowed: OAuth-only users
    display_name        VARCHAR(100),
    avatar_url          TEXT,
    english_level       TEXT CHECK (english_level IN ('A1','A2','B1','B2','C1','C2')),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified      BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Add `oauth_accounts` table after the `auth_sessions` block**

After the `idx_auth_sessions_token_hash` index line, add:

```sql
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider                TEXT NOT NULL CHECK (provider IN ('google', 'microsoft', 'facebook')),
    provider_user_id        TEXT NOT NULL,
    provider_email          CITEXT,
    provider_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    provider_display_name   TEXT,
    provider_avatar_url     TEXT,
    provider_tenant_id      TEXT,
    granted_scopes          TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_oauth_accounts_provider_user UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id
    ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_email
    ON oauth_accounts(provider_email);

CREATE TRIGGER trg_oauth_accounts_updated_at
    BEFORE UPDATE ON oauth_accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 3: Verify schema applies cleanly**

```bash
cd D:/work/projects/English-Speaking-Agent
psql -U voice_user -d voice_agent -f db_schema/reset.sql
psql -U voice_user -d voice_agent -f db_schema/schema.sql
```

Expected: no errors. If you get "column already exists", check `schema.sql` for duplicate column definitions.

- [ ] **Step 4: Commit**

```bash
git add db_schema/schema.sql
git commit -m "feat(db): add oauth_accounts table, relax users NOT NULL for OAuth"
```

---

## Task 2: Settings — Add OAuth Environment Variables

**Files:**
- Modify: `app/core/settings.py`

- [ ] **Step 1: Add OAuth credentials and URL settings**

At the end of `app/core/settings.py`, append:

```python
# ── OAuth providers ───────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID      = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET  = os.getenv("GOOGLE_CLIENT_SECRET", "")

MICROSOFT_CLIENT_ID      = os.getenv("MICROSOFT_CLIENT_ID", "")
MICROSOFT_CLIENT_SECRET  = os.getenv("MICROSOFT_CLIENT_SECRET", "")

FACEBOOK_CLIENT_ID      = os.getenv("FACEBOOK_CLIENT_ID", "")
FACEBOOK_CLIENT_SECRET  = os.getenv("FACEBOOK_CLIENT_SECRET", "")

# Base URL of this backend (used to build OAuth redirect URIs)
APP_BASE_URL  = os.getenv("APP_BASE_URL", "http://localhost:8000")
# Base URL of the frontend (used to build post-OAuth redirects)
FRONTEND_URL  = os.getenv("FRONTEND_URL", "http://localhost:5173")
```

- [ ] **Step 2: Add test defaults to `tests/conftest.py`**

In `tests/conftest.py`, after the existing `os.environ.setdefault` lines (around line 35), add:

```python
os.environ.setdefault("APP_BASE_URL", "http://localhost:8000")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
```

- [ ] **Step 3: Verify import**

```bash
python -c "from app.core.settings import GOOGLE_CLIENT_ID, FRONTEND_URL, APP_BASE_URL; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add app/core/settings.py tests/conftest.py
git commit -m "feat(settings): add OAuth provider credentials and URL env vars"
```

---

## Task 3: OAuth Router — Login Endpoint + `build_auth_url`

**Files:**
- Create: `app/api/oauth.py`
- Create: `tests/test_api/test_oauth.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_api/test_oauth.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_api/test_oauth.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.api.oauth'` or `ImportError`

- [ ] **Step 3: Create `app/api/oauth.py` with the login endpoint and helpers**

```python
from __future__ import annotations

import json
import secrets
from urllib.parse import quote, urlencode

import httpx
import jwt
from jwt import PyJWKClient
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from app.core.database import get_connection
from app.core.logger import logger
from app.core.security import create_access_token
from app.core.settings import (
    APP_BASE_URL,
    FACEBOOK_CLIENT_ID,
    FACEBOOK_CLIENT_SECRET,
    FRONTEND_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET,
    REDIS_URL,
)

router = APIRouter(prefix="/auth/oauth", tags=["oauth"])

_PROVIDERS = frozenset({"google", "microsoft", "facebook"})

_OAUTH_CONFIG: dict[str, dict] = {
    "google": {
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "jwks_url": "https://www.googleapis.com/oauth2/v3/certs",
        "scope": "openid email profile",
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "extra_params": {"prompt": "select_account"},
    },
    "microsoft": {
        "auth_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "jwks_url": "https://login.microsoftonline.com/common/discovery/v2.0/keys",
        "scope": "openid email profile",
        "client_id": MICROSOFT_CLIENT_ID,
        "client_secret": MICROSOFT_CLIENT_SECRET,
        "extra_params": {"prompt": "select_account"},
    },
    "facebook": {
        "auth_url": "https://www.facebook.com/v18.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v18.0/oauth/access_token",
        "graph_url": "https://graph.facebook.com/me",
        "scope": "email,public_profile",
        "client_id": FACEBOOK_CLIENT_ID,
        "client_secret": FACEBOOK_CLIENT_SECRET,
        "extra_params": {},
    },
}


def _get_redis():
    import redis as redis_lib
    return redis_lib.from_url(REDIS_URL, decode_responses=True)


def _redirect_uri(provider: str) -> str:
    return f"{APP_BASE_URL}/api/auth/oauth/callback/{provider}"


def _error_redirect() -> RedirectResponse:
    return RedirectResponse(f"{FRONTEND_URL}/login?error=oauth_failed", status_code=302)


def build_auth_url(provider: str, state: str) -> str:
    """Return the provider authorization URL with all required params."""
    cfg = _OAUTH_CONFIG[provider]
    params = {
        "client_id": cfg["client_id"],
        "redirect_uri": _redirect_uri(provider),
        "response_type": "code",
        "scope": cfg["scope"],
        "state": state,
        **cfg.get("extra_params", {}),
    }
    return cfg["auth_url"] + "?" + urlencode(params)


@router.get("/login/{provider}")
def oauth_login(provider: str):
    if provider not in _PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
    state = secrets.token_hex(32)
    _get_redis().setex(f"oauth_state:{state}", 600, provider)
    return {"auth_url": build_auth_url(provider, state)}
```

(The callback endpoint and helpers will be added in Tasks 4–6.)

- [ ] **Step 4: Run login tests to verify they pass**

```bash
pytest tests/test_api/test_oauth.py::test_oauth_login_google_returns_auth_url \
       tests/test_api/test_oauth.py::test_oauth_login_microsoft_returns_auth_url \
       tests/test_api/test_oauth.py::test_oauth_login_facebook_returns_auth_url \
       tests/test_api/test_oauth.py::test_oauth_login_invalid_provider_returns_400 \
       tests/test_api/test_oauth.py::test_build_auth_url_contains_required_params -v
```

Expected: 5 PASSED

- [ ] **Step 5: Commit**

```bash
git add app/api/oauth.py tests/test_api/test_oauth.py tests/conftest.py
git commit -m "feat(oauth): login endpoint + build_auth_url, with tests"
```

---

## Task 4: OAuth Router — `exchange_code_for_identity`

**Files:**
- Modify: `app/api/oauth.py` (add function)
- Modify: `tests/test_api/test_oauth.py` (add tests)

- [ ] **Step 1: Write failing tests**

Append to `tests/test_api/test_oauth.py`:

```python
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
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_api/test_oauth.py::test_exchange_code_google_extracts_identity -v
```

Expected: `ImportError: cannot import name 'exchange_code_for_identity'`

- [ ] **Step 3: Add `exchange_code_for_identity` to `app/api/oauth.py`**

Append this function before the `@router.get("/login/{provider}")` line:

```python
def exchange_code_for_identity(provider: str, code: str) -> dict:
    """Exchange OAuth authorization code for a normalized identity dict.

    Returns:
        {
            provider_user_id: str,
            email: str | None,
            email_verified: bool,
            name: str | None,
            picture: str | None,
            tenant_id: str | None,   # Microsoft only
        }
    """
    cfg = _OAUTH_CONFIG[provider]

    if provider in ("google", "microsoft"):
        resp = httpx.post(cfg["token_url"], data={
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"],
            "code": code,
            "redirect_uri": _redirect_uri(provider),
            "grant_type": "authorization_code",
        })
        resp.raise_for_status()
        id_token = resp.json()["id_token"]

        jwks_client = PyJWKClient(cfg["jwks_url"])
        signing_key = jwks_client.get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )

        if provider == "google":
            return {
                "provider_user_id": claims["sub"],
                "email": claims.get("email"),
                "email_verified": bool(claims.get("email_verified", False)),
                "name": claims.get("name"),
                "picture": claims.get("picture"),
                "tenant_id": None,
            }
        else:  # microsoft
            return {
                "provider_user_id": claims["oid"],
                "email": claims.get("email") or claims.get("preferred_username"),
                "email_verified": True,  # Microsoft enforces email verification
                "name": claims.get("name"),
                "picture": None,
                "tenant_id": claims.get("tid"),
            }

    else:  # facebook
        resp = httpx.post(cfg["token_url"], params={
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"],
            "code": code,
            "redirect_uri": _redirect_uri(provider),
        })
        resp.raise_for_status()
        access_token = resp.json()["access_token"]

        graph_resp = httpx.get(cfg["graph_url"], params={
            "fields": "id,name,email,picture",
            "access_token": access_token,
        })
        graph_resp.raise_for_status()
        data = graph_resp.json()

        email = data.get("email")
        picture_data = data.get("picture")
        picture_url = (
            picture_data.get("data", {}).get("url")
            if isinstance(picture_data, dict)
            else None
        )
        return {
            "provider_user_id": data["id"],
            "email": email,
            "email_verified": email is not None,  # FB only returns email when verified
            "name": data.get("name"),
            "picture": picture_url,
            "tenant_id": None,
        }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_api/test_oauth.py::test_exchange_code_google_extracts_identity \
       tests/test_api/test_oauth.py::test_exchange_code_microsoft_uses_oid_and_always_verified \
       tests/test_api/test_oauth.py::test_exchange_code_facebook_with_email \
       tests/test_api/test_oauth.py::test_exchange_code_facebook_no_email -v
```

Expected: 4 PASSED

- [ ] **Step 5: Commit**

```bash
git add app/api/oauth.py tests/test_api/test_oauth.py
git commit -m "feat(oauth): exchange_code_for_identity for Google, Microsoft, Facebook"
```

---

## Task 5: OAuth Router — `find_or_create_user`

**Files:**
- Modify: `app/api/oauth.py`
- Modify: `tests/test_api/test_oauth.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_api/test_oauth.py`:

```python
# ---------------------------------------------------------------------------
# find_or_create_user
# ---------------------------------------------------------------------------

def _identity(provider_user_id="uid123", email="user@example.com",
               email_verified=True, name="Test User", picture=None, tenant_id=None):
    return {
        "provider_user_id": provider_user_id,
        "email": email,
        "email_verified": email_verified,
        "name": name,
        "picture": picture,
        "tenant_id": tenant_id,
    }


def test_find_or_create_returns_existing_oauth_user(mock_db_conn):
    mock_conn, mock_cursor = mock_db_conn
    mock_cursor.fetchone.side_effect = [
        ("existing_user_id",),   # oauth_accounts lookup found
        ("user@example.com",),   # users email lookup
    ]

    with patch("app.api.oauth.get_connection", return_value=mock_conn):
        from app.api.oauth import find_or_create_user
        user_id, email = find_or_create_user("google", _identity())

    assert user_id == "existing_user_id"
    assert email == "user@example.com"


def test_find_or_create_auto_links_existing_email(mock_db_conn):
    mock_conn, mock_cursor = mock_db_conn
    mock_cursor.fetchone.side_effect = [
        None,                    # no oauth_accounts match
        ("existing_user_id",),   # users email match (auto-link)
    ]

    with patch("app.api.oauth.get_connection", return_value=mock_conn):
        from app.api.oauth import find_or_create_user
        user_id, email = find_or_create_user("google", _identity(email_verified=True))

    assert user_id == "existing_user_id"
    assert email == "user@example.com"


def test_find_or_create_new_user_when_no_match(mock_db_conn):
    mock_conn, mock_cursor = mock_db_conn
    mock_cursor.fetchone.side_effect = [
        None,                # no oauth_accounts
        None,                # no email match
        ("new_user_id",),    # INSERT users RETURNING id
    ]

    with patch("app.api.oauth.get_connection", return_value=mock_conn):
        from app.api.oauth import find_or_create_user
        user_id, email = find_or_create_user("google", _identity())

    assert user_id == "new_user_id"
    assert email == "user@example.com"


def test_find_or_create_unverified_email_skips_link(mock_db_conn):
    mock_conn, mock_cursor = mock_db_conn
    mock_cursor.fetchone.side_effect = [
        None,                # no oauth_accounts
        ("new_user_id",),    # INSERT users RETURNING id (email link step skipped)
    ]

    with patch("app.api.oauth.get_connection", return_value=mock_conn):
        from app.api.oauth import find_or_create_user
        user_id, _ = find_or_create_user("google", _identity(email_verified=False))

    assert user_id == "new_user_id"
    # Confirm no SELECT WHERE email was executed
    executed_sql = [str(call) for call in mock_cursor.execute.call_args_list]
    assert not any("WHERE email" in sql for sql in executed_sql)


def test_find_or_create_facebook_no_email_creates_user(mock_db_conn):
    mock_conn, mock_cursor = mock_db_conn
    mock_cursor.fetchone.side_effect = [
        None,                # no oauth_accounts
        ("new_user_id",),    # INSERT users RETURNING id
    ]
    identity = _identity(email=None, email_verified=False)

    with patch("app.api.oauth.get_connection", return_value=mock_conn):
        from app.api.oauth import find_or_create_user
        user_id, email = find_or_create_user("facebook", identity)

    assert user_id == "new_user_id"
    assert email is None
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_api/test_oauth.py::test_find_or_create_returns_existing_oauth_user -v
```

Expected: `ImportError: cannot import name 'find_or_create_user'`

- [ ] **Step 3: Add `find_or_create_user` to `app/api/oauth.py`**

Append this function before the `@router.get("/login/{provider}")` line:

```python
def find_or_create_user(provider: str, identity: dict) -> tuple[str, str | None]:
    """Find or create a user row for the given OAuth identity.

    Returns (user_id, email).

    Priority:
      1. Existing oauth_accounts row → return linked user.
      2. Email auto-link (verified email only) → link new oauth row to existing user.
      3. Create new user + oauth row.
    """
    provider_user_id = identity["provider_user_id"]
    email = identity["email"]
    email_verified = identity["email_verified"]

    with get_connection() as conn:
        with conn.cursor() as cur:
            # Step 1: lookup by provider identity
            cur.execute(
                "SELECT user_id::text FROM oauth_accounts "
                "WHERE provider = %s AND provider_user_id = %s",
                (provider, provider_user_id),
            )
            row = cur.fetchone()
            if row:
                cur.execute(
                    "SELECT email::text FROM users WHERE id = %s",
                    (row[0],),
                )
                user_row = cur.fetchone()
                return row[0], (user_row[0] if user_row else None)

            user_id: str | None = None

            # Step 2: email auto-link (only if verified and present)
            if email and email_verified:
                cur.execute(
                    "SELECT id::text FROM users WHERE email = %s",
                    (email,),
                )
                user_row = cur.fetchone()
                if user_row:
                    user_id = user_row[0]

            # Step 3: create new user
            if not user_id:
                cur.execute(
                    """
                    INSERT INTO users
                        (email, display_name, avatar_url, email_verified, email_verified_at)
                    VALUES (%s, %s, %s, TRUE, NOW())
                    RETURNING id::text
                    """,
                    (email, identity.get("name"), identity.get("picture")),
                )
                user_id = cur.fetchone()[0]

            # Insert oauth_accounts link (idempotent)
            cur.execute(
                """
                INSERT INTO oauth_accounts (
                    user_id, provider, provider_user_id,
                    provider_email, provider_email_verified,
                    provider_display_name, provider_avatar_url, provider_tenant_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (provider, provider_user_id) DO NOTHING
                """,
                (
                    user_id, provider, provider_user_id,
                    email, email_verified,
                    identity.get("name"), identity.get("picture"),
                    identity.get("tenant_id"),
                ),
            )

            return user_id, email
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_api/test_oauth.py::test_find_or_create_returns_existing_oauth_user \
       tests/test_api/test_oauth.py::test_find_or_create_auto_links_existing_email \
       tests/test_api/test_oauth.py::test_find_or_create_new_user_when_no_match \
       tests/test_api/test_oauth.py::test_find_or_create_unverified_email_skips_link \
       tests/test_api/test_oauth.py::test_find_or_create_facebook_no_email_creates_user -v
```

Expected: 5 PASSED

- [ ] **Step 5: Commit**

```bash
git add app/api/oauth.py tests/test_api/test_oauth.py
git commit -m "feat(oauth): find_or_create_user with auto-link and Facebook no-email path"
```

---

## Task 6: OAuth Router — Callback Endpoint

**Files:**
- Modify: `app/api/oauth.py`
- Modify: `tests/test_api/test_oauth.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_api/test_oauth.py`:

```python
# ---------------------------------------------------------------------------
# Callback endpoint
# ---------------------------------------------------------------------------

def test_callback_missing_code_redirects_to_error(client, monkeypatch):
    mock_redis = MagicMock()
    monkeypatch.setattr("app.api.oauth._get_redis", lambda: mock_redis)

    resp = client.get(
        "/api/auth/oauth/callback/google?state=abc",
        follow_redirects=False,
    )

    assert resp.status_code == 302
    assert "oauth_failed" in resp.headers["location"]


def test_callback_invalid_state_redirects_to_error(client, monkeypatch):
    mock_redis = MagicMock()
    mock_redis.get.return_value = "microsoft"  # state belongs to microsoft, not google
    monkeypatch.setattr("app.api.oauth._get_redis", lambda: mock_redis)

    resp = client.get(
        "/api/auth/oauth/callback/google?code=abc&state=wrong_state",
        follow_redirects=False,
    )

    assert resp.status_code == 302
    assert "oauth_failed" in resp.headers["location"]


def test_callback_state_deleted_on_first_use(client, monkeypatch):
    mock_redis = MagicMock()
    mock_redis.get.return_value = "google"
    monkeypatch.setattr("app.api.oauth._get_redis", lambda: mock_redis)
    # Make exchange raise so we hit the error path after state deletion
    monkeypatch.setattr(
        "app.api.oauth.exchange_code_for_identity",
        lambda p, c: (_ for _ in ()).throw(Exception("stop")),
    )

    client.get(
        "/api/auth/oauth/callback/google?code=abc&state=valid_state",
        follow_redirects=False,
    )

    mock_redis.delete.assert_called_once_with("oauth_state:valid_state")


def test_callback_success_redirects_with_token_fragment(client, mock_db_conn, monkeypatch):
    mock_conn, mock_cursor = mock_db_conn
    mock_cursor.fetchone.side_effect = [
        None,                  # no oauth_accounts
        None,                  # no existing user
        ("new_user_id",),      # INSERT users
    ]

    mock_redis = MagicMock()
    mock_redis.get.return_value = "google"
    monkeypatch.setattr("app.api.oauth._get_redis", lambda: mock_redis)
    monkeypatch.setattr(
        "app.api.oauth.exchange_code_for_identity",
        lambda p, c: {
            "provider_user_id": "gid123",
            "email": "user@gmail.com",
            "email_verified": True,
            "name": "Test User",
            "picture": None,
            "tenant_id": None,
        },
    )
    monkeypatch.setattr("app.api.oauth.get_connection", return_value=mock_conn)

    resp = client.get(
        "/api/auth/oauth/callback/google?code=abc&state=valid",
        follow_redirects=False,
    )

    assert resp.status_code == 302
    location = resp.headers["location"]
    assert "/auth/callback#" in location
    assert "token=" in location
    assert "expires_in=" in location
    assert "user=" in location


def test_callback_exchange_failure_redirects_to_error(client, monkeypatch):
    mock_redis = MagicMock()
    mock_redis.get.return_value = "google"
    monkeypatch.setattr("app.api.oauth._get_redis", lambda: mock_redis)
    monkeypatch.setattr(
        "app.api.oauth.exchange_code_for_identity",
        lambda p, c: (_ for _ in ()).throw(Exception("httpx error")),
    )

    resp = client.get(
        "/api/auth/oauth/callback/google?code=abc&state=valid",
        follow_redirects=False,
    )

    assert resp.status_code == 302
    assert "oauth_failed" in resp.headers["location"]
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_api/test_oauth.py::test_callback_missing_code_redirects_to_error -v
```

Expected: `404 Not Found` (route doesn't exist yet)

- [ ] **Step 3: Add the callback endpoint to `app/api/oauth.py`**

Append this after the `oauth_login` function:

```python
@router.get("/callback/{provider}")
def oauth_callback(
    provider: str,
    code: str | None = None,
    state: str | None = None,
):
    if not code or not state:
        return _error_redirect()

    r = _get_redis()
    stored = r.get(f"oauth_state:{state}")
    r.delete(f"oauth_state:{state}")  # one-time use regardless of outcome
    if stored != provider:
        return _error_redirect()

    try:
        identity = exchange_code_for_identity(provider, code)
        user_id, email = find_or_create_user(provider, identity)
        token, expires_in = create_access_token(user_id=user_id, email=email or "")
        user_json = json.dumps({
            "id": user_id,
            "email": email,
            "display_name": identity.get("name"),
            "english_level": None,
        })
        fragment = (
            f"token={token}"
            f"&expires_in={expires_in}"
            f"&user={quote(user_json)}"
        )
        return RedirectResponse(
            f"{FRONTEND_URL}/auth/callback#{fragment}",
            status_code=302,
        )
    except Exception:
        logger.exception("OAuth callback failed provider=%s", provider)
        return _error_redirect()
```

- [ ] **Step 4: Run all callback tests**

```bash
pytest tests/test_api/test_oauth.py::test_callback_missing_code_redirects_to_error \
       tests/test_api/test_oauth.py::test_callback_invalid_state_redirects_to_error \
       tests/test_api/test_oauth.py::test_callback_state_deleted_on_first_use \
       tests/test_api/test_oauth.py::test_callback_success_redirects_with_token_fragment \
       tests/test_api/test_oauth.py::test_callback_exchange_failure_redirects_to_error -v
```

Expected: 5 PASSED

- [ ] **Step 5: Run the full test file**

```bash
pytest tests/test_api/test_oauth.py -v
```

Expected: all tests PASSED, no failures

- [ ] **Step 6: Commit**

```bash
git add app/api/oauth.py tests/test_api/test_oauth.py
git commit -m "feat(oauth): callback endpoint with state verification and token fragment redirect"
```

---

## Task 7: Register Router + Frontend Endpoints

**Files:**
- Modify: `app/api/router.py:14`
- Modify: `frontend/src/api/config.ts`

- [ ] **Step 1: Register oauth_router in `app/api/router.py`**

Open `app/api/router.py`. After the existing imports, add:

```python
from app.api.oauth import router as oauth_router
```

After `router.include_router(auth_router)`, add:

```python
router.include_router(oauth_router)
```

The file should now look like:

```python
from __future__ import annotations

from fastapi import APIRouter

from app.api.assess import router as assess_router
from app.api.audio import router as audio_router
from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.conversations import router as conversations_router
from app.api.flashcards import router as flashcards_router
from app.api.grammar import router as grammar_router
from app.api.oauth import router as oauth_router
from app.api.topics import router as topics_router

router = APIRouter(prefix="/api")
router.include_router(auth_router)
router.include_router(oauth_router)
router.include_router(chat_router)
router.include_router(assess_router)
router.include_router(conversations_router)
router.include_router(audio_router)
router.include_router(grammar_router)
router.include_router(topics_router)
router.include_router(flashcards_router)
```

- [ ] **Step 2: Verify routes are registered**

```bash
python -c "
from app.api.router import router
paths = [r.path for r in router.routes]
print([p for p in paths if 'oauth' in p])
"
```

Expected: `['/auth/oauth/login/{provider}', '/auth/oauth/callback/{provider}']`

Wait — these are sub-router paths. The full paths will have `/api` prefix. The check above may return empty list due to sub-routing. Alternative check:

```bash
pytest tests/test_api/test_oauth.py -v --tb=short
```

Expected: all tests still pass (router registration doesn't break anything)

- [ ] **Step 3: Add oauth entries to `frontend/src/api/config.ts`**

Open `frontend/src/api/config.ts`. Add an `oauth` block to the `ENDPOINTS` object:

```typescript
export const ENDPOINTS = {
  auth: {
    login: '/api/auth/login',
    register: '/api/auth/register',
    me: '/api/auth/me',
  },
  oauth: {
    login: (provider: string) => `/api/auth/oauth/login/${provider}`,
  },
  // ... rest unchanged
```

- [ ] **Step 4: Commit**

```bash
git add app/api/router.py frontend/src/api/config.ts
git commit -m "feat(oauth): register oauth router, add oauth endpoints to frontend config"
```

---

## Task 8: Frontend — `OAuthButtons.jsx`

**Files:**
- Create: `frontend/src/components/auth/OAuthButtons.jsx`

> Note: `frontend/src/components/auth/` directory does not exist yet — it will be created with the file.
> No frontend test suite is set up in this repo; frontend component testing is out of scope.

- [ ] **Step 1: Create `frontend/src/components/auth/OAuthButtons.jsx`**

```jsx
import { useState } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { SiMicrosoft } from 'react-icons/si';
import { FaFacebook } from 'react-icons/fa';
import { API_BASE_URL } from '../../api/config';

const PROVIDERS = [
  {
    id: 'google',
    label: 'Continue with Google',
    Icon: FcGoogle,
    iconColor: undefined,
  },
  {
    id: 'microsoft',
    label: 'Continue with Microsoft',
    Icon: SiMicrosoft,
    iconColor: '#2F2F2F',
  },
  {
    id: 'facebook',
    label: 'Continue with Facebook',
    Icon: FaFacebook,
    iconColor: '#1877F2',
  },
];

export default function OAuthButtons() {
  const [loading, setLoading] = useState(null); // provider id while redirecting

  const handleClick = async (provider) => {
    setLoading(provider);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/oauth/login/${provider}`);
      if (!res.ok) throw new Error('Failed to get auth URL');
      const { auth_url } = await res.json();
      window.location.href = auth_url;
    } catch {
      setLoading(null);
    }
  };

  return (
    <div className="oauth-buttons">
      {PROVIDERS.map(({ id, label, Icon, iconColor }) => (
        <button
          key={id}
          type="button"
          className="oauth-btn"
          onClick={() => handleClick(id)}
          disabled={loading !== null}
          aria-label={label}
        >
          <Icon size={18} color={iconColor} />
          <span>{loading === id ? 'Redirecting…' : label}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify no import errors**

```bash
cd D:/work/projects/English-Speaking-Agent/frontend
npx vite build --mode development 2>&1 | grep -E "(error|Error|OAuthButtons)" | head -20
```

Expected: no errors mentioning `OAuthButtons` or missing imports

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/auth/OAuthButtons.jsx
git commit -m "feat(frontend): add OAuthButtons component for Google, Microsoft, Facebook"
```

---

## Task 9: Frontend — `OAuthCallbackPage.jsx`

**Files:**
- Create: `frontend/src/pages/OAuthCallbackPage.jsx`

- [ ] **Step 1: Create `frontend/src/pages/OAuthCallbackPage.jsx`**

```jsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthContext';
import Spinner from '../components/ui/Spinner';

export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Provider sent back an error (e.g. user denied permission)
    if (searchParams.get('error') === 'oauth_failed') {
      toast.error('Sign-in failed. Please try again.');
      navigate('/login', { replace: true });
      return;
    }

    // Backend sets token in the URL fragment: /auth/callback#token=...&user=...
    const hash = window.location.hash.slice(1); // strip leading #
    if (!hash) {
      navigate('/login?error=oauth_failed', { replace: true });
      return;
    }

    const params = new URLSearchParams(hash);
    const token = params.get('token');
    const userRaw = params.get('user');

    if (!token || !userRaw) {
      navigate('/login?error=oauth_failed', { replace: true });
      return;
    }

    let user;
    try {
      user = JSON.parse(decodeURIComponent(userRaw));
    } catch {
      navigate('/login?error=oauth_failed', { replace: true });
      return;
    }

    login({ token, user });
    navigate('/chat', { replace: true }); // replace so back-button skips callback
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
    >
      <Spinner size={32} />
      <p style={{ margin: 0, color: 'var(--color-muted, #888)' }}>Signing you in…</p>
    </div>
  );
}
```

- [ ] **Step 2: Verify no import errors**

```bash
cd D:/work/projects/English-Speaking-Agent/frontend
npx vite build --mode development 2>&1 | grep -E "(error|Error|OAuthCallback)" | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/OAuthCallbackPage.jsx
git commit -m "feat(frontend): add OAuthCallbackPage — reads fragment, calls AuthContext.login"
```

---

## Task 10: Wire Router + LoginPage

**Files:**
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/pages/LoginPage.jsx`

- [ ] **Step 1: Add lazy import and route to `frontend/src/router.tsx`**

After the existing lazy imports (after `FlashcardStudyPage`), add:

```typescript
const OAuthCallbackPage = lazy(() => import('./pages/OAuthCallbackPage'));
```

Inside the `PublicRoute` children array (alongside `login` and `register`), add:

```typescript
{
  path: 'auth/callback',
  element: (
    <Suspense fallback={<PageFallback />}>
      <OAuthCallbackPage />
    </Suspense>
  ),
},
```

The `PublicRoute` children block should now be:

```typescript
{
  element: <PublicRoute />,
  children: [
    {
      path: 'login',
      element: <LoginPage />,
    },
    {
      path: 'register',
      element: (
        <Suspense fallback={<PageFallback />}>
          <RegisterPage />
        </Suspense>
      ),
    },
    {
      path: 'auth/callback',
      element: (
        <Suspense fallback={<PageFallback />}>
          <OAuthCallbackPage />
        </Suspense>
      ),
    },
  ],
},
```

- [ ] **Step 2: Add OAuthButtons to `frontend/src/pages/LoginPage.jsx`**

At the top of `LoginPage.jsx`, add the import after the existing imports:

```jsx
import OAuthButtons from '../components/auth/OAuthButtons';
```

Inside the `return`, after the closing `</form>` tag and before the `<div className="switch-link">` div, add:

```jsx
<div className="oauth-divider">
  <span>or continue with</span>
</div>
<OAuthButtons />
```

The bottom of the `.card-panel` section should now look like:

```jsx
          </form>

          <div className="oauth-divider">
            <span>or continue with</span>
          </div>
          <OAuthButtons />

          <div className="switch-link">
            <p style={{ margin: 0 }}>
              Don&apos;t have an account?{' '}
```

- [ ] **Step 3: Verify full build succeeds**

```bash
cd D:/work/projects/English-Speaking-Agent/frontend
npx vite build 2>&1 | tail -10
```

Expected: `built in Xs` with no errors

- [ ] **Step 4: Run the full backend test suite**

```bash
cd D:/work/projects/English-Speaking-Agent
pytest tests/ -v --tb=short 2>&1 | tail -30
```

Expected: all tests pass; no regressions

- [ ] **Step 5: Commit**

```bash
git add frontend/src/router.tsx frontend/src/pages/LoginPage.jsx
git commit -m "feat(frontend): wire OAuthCallbackPage route and OAuthButtons into LoginPage"
```

---

## Verification Checklist

Before calling this done, manually test the happy path:

- [ ] Start the backend: `uvicorn app.main:app --reload`
- [ ] Start the frontend: `cd frontend && npm run dev`
- [ ] Open `http://localhost:5173/login` — confirm 3 OAuth buttons appear below the form
- [ ] Click "Continue with Google" — confirm redirect to `accounts.google.com`
- [ ] After auth, confirm redirect lands at `http://localhost:5173/auth/callback#token=...`
- [ ] Confirm automatic redirect to `/chat` and user is logged in
- [ ] Check `localStorage` in DevTools: `voice_agent_auth` should contain `{ token, user }`
- [ ] Repeat with Microsoft — confirm redirect to `login.microsoftonline.com`
- [ ] Repeat with Facebook — confirm redirect to `facebook.com/dialog/oauth`
