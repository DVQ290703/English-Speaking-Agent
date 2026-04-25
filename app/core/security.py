from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.logger import logger
from app.core.settings import JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET_KEY


security = HTTPBearer()
_DUMMY_PASSWORD_HASH = bcrypt.hashpw(b"constant-login-timing-padding", bcrypt.gensalt())


def _bcrypt_check(plain_password: str, hashed_password: bytes) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password)


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password using bcrypt and return the encoded string."""
    password_bytes = plain_password.encode("utf-8")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Check a plaintext password against the stored bcrypt hash."""
    try:
        return _bcrypt_check(plain_password, password_hash.encode("utf-8"))
    except ValueError:
        return False


def verify_password_with_padding(plain_password: str, password_hash: str | None) -> bool:
    """Always execute a bcrypt check to reduce user-enumeration timing differences."""
    candidate_hash = _DUMMY_PASSWORD_HASH
    if password_hash:
        try:
            candidate_hash = password_hash.encode("utf-8")
        except UnicodeEncodeError:
            candidate_hash = _DUMMY_PASSWORD_HASH
    try:
        return _bcrypt_check(plain_password, candidate_hash)
    except ValueError:
        _bcrypt_check(plain_password, _DUMMY_PASSWORD_HASH)
        return False


def create_access_token(user_id: str, email: str) -> tuple[str, int]:
    """Generate a signed JWT and return it with its remaining lifetime in seconds."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    logger.debug("Access token created user_id=%s expires_in=%ds", user_id, JWT_EXPIRE_MINUTES * 60)
    return token, int((expires_at - now).total_seconds())


def decode_token(token: str):
    """Validate and decode a JWT payload for authenticated requests."""
    try:
        return jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "email", "iat", "nbf", "exp"]},
        )
    except jwt.InvalidTokenError as exc:
        logger.warning("JWT decode failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract the current user identifier from the bearer token."""
    claims = decode_token(credentials.credentials)
    user_id = claims.get("sub")
    if not user_id:
        logger.warning("JWT missing 'sub' claim")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user_id
