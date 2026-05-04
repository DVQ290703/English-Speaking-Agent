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
    return f"{APP_BASE_URL}/api/auth/oauth/{provider}/callback"


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
            leeway=60,
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


@router.get("/login/{provider}")
def oauth_login(provider: str):
    if provider not in _PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
    state = secrets.token_hex(32)
    try:
        _get_redis().setex(f"oauth_state:{state}", 600, provider)
    except Exception:
        logger.warning("Redis unavailable for OAuth state storage provider=%s", provider)
        raise HTTPException(status_code=503, detail="OAuth service temporarily unavailable")
    return {"auth_url": build_auth_url(provider, state)}


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
                if user_row:
                    return row[0], user_row[0]
                # oauth_accounts points to a deleted user — delete the stale link
                # and fall through to re-create the user below
                cur.execute(
                    "DELETE FROM oauth_accounts WHERE provider = %s AND provider_user_id = %s",
                    (provider, provider_user_id),
                )

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


@router.get("/{provider}/callback")
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
