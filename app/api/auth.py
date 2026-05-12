from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials

from app.api.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    UserOut,
)
from app.core.database import get_connection
from app.core.logger import logger
from app.core.security import (
    create_access_token,
    decode_token,
    get_current_user_id,
    hash_password,
    security,
    verify_password,
    verify_password_with_padding,
)
from app.core.settings import APP_ENV, EMAIL_ENABLED, FRONTEND_URL
from app.services.email_service import PasswordResetEmailDeliveryError, send_password_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])

_PASSWORD_POLICY_MESSAGE = (
    "Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol."
)
_PASSWORD_RESET_SUCCESS_MESSAGE = "If the account exists, a reset link has been generated."
_PASSWORD_RESET_TTL_MINUTES = 5


def _validate_password_strength(password: str) -> None:
    if (
        len(password) < 12
        or not re.search(r"[A-Z]", password)
        or not re.search(r"[a-z]", password)
        or not re.search(r"\d", password)
        or not re.search(r"[^A-Za-z0-9]", password)
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_PASSWORD_POLICY_MESSAGE)


def _hash_password_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _build_password_reset_url(token: str) -> str:
    base_url = FRONTEND_URL.rstrip("/")
    return f"{base_url}/reset-password?token={quote(token, safe='')}"


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    if len(local) <= 1:
        masked_local = "*"
    elif len(local) <= 2:
        masked_local = local[:1] + "*" * max(len(local) - 1, 0)
    else:
        masked_local = local[:2] + "*" * (len(local) - 2)
    return f"{masked_local}@{domain}"


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


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest):
    """Generate a password reset token for local-password accounts and return a generic response."""
    email = payload.email.lower().strip()
    masked_email = _mask_email(email)
    logger.info("Forgot password request email=%s", masked_email)

    reset_url: str | None = None
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id::text, (password_hash IS NOT NULL) AS has_local_password
                    FROM users
                    WHERE email = %s
                      AND is_active = TRUE
                    LIMIT 1;
                    """,
                    (email,),
                )
                row = cur.fetchone()

                if not row:
                    return ForgotPasswordResponse(
                        message=_PASSWORD_RESET_SUCCESS_MESSAGE,
                        preview_reset_url=None,
                    )

                user_id, has_local_password = row
                if not has_local_password:
                    logger.info("Forgot password skipped for oauth-only account email=%s", masked_email)
                    return ForgotPasswordResponse(
                        message=_PASSWORD_RESET_SUCCESS_MESSAGE,
                        preview_reset_url=None,
                    )

                cur.execute(
                    """
                    UPDATE password_reset_tokens
                    SET revoked_at = NOW()
                    WHERE user_id = %s
                      AND used_at IS NULL
                      AND revoked_at IS NULL
                      AND expires_at > NOW();
                    """,
                    (user_id,),
                )

                raw_token = secrets.token_urlsafe(32)
                token_hash = _hash_password_reset_token(raw_token)
                expires_at = datetime.now(timezone.utc) + timedelta(minutes=_PASSWORD_RESET_TTL_MINUTES)
                cur.execute(
                    """
                    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
                    VALUES (%s, %s, %s);
                    """,
                    (user_id, token_hash, expires_at),
                )

                reset_url = _build_password_reset_url(raw_token)
                if EMAIL_ENABLED:
                    send_password_reset_email(
                        to_email=email,
                        reset_url=reset_url,
                        expires_minutes=_PASSWORD_RESET_TTL_MINUTES,
                    )
    except PasswordResetEmailDeliveryError:
        logger.warning("Forgot password email delivery failed email=%s", masked_email)
        return ForgotPasswordResponse(message=_PASSWORD_RESET_SUCCESS_MESSAGE, preview_reset_url=None)

    preview_reset_url = reset_url if APP_ENV == "development" else None
    return ForgotPasswordResponse(message=_PASSWORD_RESET_SUCCESS_MESSAGE, preview_reset_url=preview_reset_url)


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


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest):
    """Reset a user's password using a one-time token."""
    _validate_password_strength(payload.new_password)
    token_hash = _hash_password_reset_token(payload.token)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT prt.id::text, prt.user_id::text
                FROM password_reset_tokens prt
                JOIN users u ON u.id = prt.user_id
                WHERE prt.token_hash = %s
                  AND prt.used_at IS NULL
                  AND prt.revoked_at IS NULL
                  AND prt.expires_at > NOW()
                  AND u.is_active = TRUE
                LIMIT 1;
                """,
                (token_hash,),
            )
            row = cur.fetchone()

            if not row:
                logger.warning("Reset password failed invalid token_hash=%s", token_hash[:12])
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset link is invalid or expired")

            token_id, user_id = row
            password_hash = hash_password(payload.new_password)
            cur.execute(
                """
                UPDATE users
                SET password_hash = %s,
                    updated_at = NOW()
                WHERE id = %s;
                """,
                (password_hash, user_id),
            )
            cur.execute(
                """
                UPDATE password_reset_tokens
                SET used_at = NOW()
                WHERE id = %s;
                """,
                (token_id,),
            )
            cur.execute(
                """
                UPDATE password_reset_tokens
                SET revoked_at = NOW()
                WHERE user_id = %s
                  AND id <> %s
                  AND used_at IS NULL
                  AND revoked_at IS NULL;
                """,
                (user_id, token_id),
            )

    logger.info("Reset password successful user_id=%s", user_id)
    return MessageResponse(message="Password reset successfully.")


@router.post("/change-password", response_model=MessageResponse)
def change_password(payload: ChangePasswordRequest, user_id: str = Depends(get_current_user_id)):
    """Change the authenticated user's password after verifying their current password."""
    _validate_password_strength(payload.new_password)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT password_hash
                FROM users
                WHERE id = %s AND is_active = TRUE
                LIMIT 1;
                """,
                (user_id,),
            )
            row = cur.fetchone()

            if not row:
                logger.warning("Change password failed missing user_id=%s", user_id)
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

            stored_password_hash = row[0]
            if not stored_password_hash:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Password change is not available for this account",
                )

            if not verify_password_with_padding(payload.current_password, stored_password_hash):
                logger.warning("Change password failed bad current password user_id=%s", user_id)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Current password is incorrect",
                )

            if verify_password(payload.new_password, stored_password_hash):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="New password must be different from the current password",
                )

            new_password_hash = hash_password(payload.new_password)
            cur.execute(
                """
                UPDATE users
                SET password_hash = %s,
                    updated_at = NOW()
                WHERE id = %s;
                """,
                (new_password_hash, user_id),
            )
            cur.execute(
                """
                UPDATE password_reset_tokens
                SET revoked_at = NOW()
                WHERE user_id = %s
                  AND used_at IS NULL
                  AND revoked_at IS NULL;
                """,
                (user_id,),
            )

    logger.info("Change password successful user_id=%s", user_id)
    return MessageResponse(message="Password changed successfully.")
