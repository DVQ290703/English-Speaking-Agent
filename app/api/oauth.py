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
