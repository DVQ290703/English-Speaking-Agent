from __future__ import annotations

import re

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials

from app.api.schemas import LoginRequest, LoginResponse, RegisterRequest, UserOut
from app.core.database import get_connection
from app.core.logger import logger
from app.core.security import (
    create_access_token,
    decode_token,
    hash_password,
    security,
    verify_password_with_padding,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_PASSWORD_POLICY_MESSAGE = (
    "Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol."
)


def _validate_password_strength(password: str) -> None:
    if (
        len(password) < 12
        or not re.search(r"[A-Z]", password)
        or not re.search(r"[a-z]", password)
        or not re.search(r"\d", password)
        or not re.search(r"[^A-Za-z0-9]", password)
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_PASSWORD_POLICY_MESSAGE)


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    """Authenticate with email/password; return a JWT and user profile. Raises 401 on bad credentials."""
    email = payload.email.lower().strip()
    logger.info("Login attempt for email=%s", email)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, email::text, password_hash, display_name, english_level
                FROM users
                WHERE email = %s AND is_active = TRUE
                LIMIT 1;
                """,
                (email,),
            )
            row = cur.fetchone()

    password_hash = row[2] if row else None
    password_ok = verify_password_with_padding(payload.password, password_hash)
    if not row or not password_ok:
        logger.warning("Login failed for email=%s", email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    user_id, email, _, display_name, english_level = row
    access_token, expires_in = create_access_token(user_id=user_id, email=email)
    logger.info("Login successful user_id=%s expires_in=%ds", user_id, expires_in)
    return LoginResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=UserOut(id=user_id, email=email, display_name=display_name, english_level=english_level),
    )


@router.get("/me", response_model=UserOut)
def me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Return the profile of the currently authenticated user. Raises 401 if token is invalid or user is inactive."""
    claims = decode_token(credentials.credentials)
    user_id = claims.get("sub")
    logger.debug("GET /auth/me user_id=%s", user_id)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, email::text, display_name, english_level
                FROM users
                WHERE id = %s AND is_active = TRUE
                LIMIT 1;
                """,
                (user_id,),
            )
            row = cur.fetchone()

    if not row:
        logger.warning("GET /auth/me user_id=%s not found or inactive", user_id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    user_id, email, display_name, english_level = row
    return UserOut(id=user_id, email=email, display_name=display_name, english_level=english_level)


@router.post("/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest):
    """Register a new account and return a JWT. Raises 400 if the email is taken or the password fails policy."""
    email = payload.email.lower().strip()
    logger.info("Register attempt email=%s", email)

    _validate_password_strength(payload.password)

    display_name = (payload.display_name or "").strip() or email.split("@", 1)[0]
    english_level = (payload.english_level or "").strip() or None
    password_hash = hash_password(payload.password)

    with get_connection() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """
                    INSERT INTO users (email, password_hash, display_name, english_level)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id::text, email::text, display_name, english_level;
                    """,
                    (email, password_hash, display_name, english_level),
                )
                row = cur.fetchone()
            except psycopg2.errors.UniqueViolation as exc:
                logger.warning("Register failed email already registered=%s", email)
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered") from exc

    if not row:
        logger.error("Register failed insert returned no row for email=%s", email)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="User registration failed")

    user_id, email, display_name, english_level = row
    access_token, expires_in = create_access_token(user_id=user_id, email=email)
    logger.info("Register successful user_id=%s", user_id)
    return LoginResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=UserOut(id=user_id, email=email, display_name=display_name, english_level=english_level),
    )
