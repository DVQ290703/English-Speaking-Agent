import json
import os
import warnings

from dotenv import load_dotenv

load_dotenv()

APP_ENV = os.getenv("APP_ENV", "development").strip().lower() or "development"


def _is_weak_secret(value: str, *, minimum_length: int, blocked_values: set[str]) -> bool:
    normalized = value.strip()
    return len(normalized) < minimum_length or normalized.lower() in blocked_values


def _warn_or_raise_for_secret(*, name: str, value: str, minimum_length: int, blocked_values: set[str]) -> None:
    if not _is_weak_secret(value, minimum_length=minimum_length, blocked_values=blocked_values):
        return

    message = (
        f"{name} is weak or uses a known default. "
        f"Set a unique secret with at least {minimum_length} characters."
    )
    if APP_ENV in {"production", "staging"}:
        raise RuntimeError(message)
    warnings.warn(message, stacklevel=2)


JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
if not JWT_SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY is not set. Add it to your .env file or environment. "
        "Refusing to start with an empty signing key."
    )
_warn_or_raise_for_secret(
    name="JWT_SECRET_KEY",
    value=JWT_SECRET_KEY,
    minimum_length=32,
    blocked_values={"changeme", "secret", "jwt-secret", "jwt_secret_key", "test", "password"},
)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
DB_NAME = os.getenv("POSTGRES_DB", "voice_agent")
DB_USER = os.getenv("POSTGRES_USER", "voice_user")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "voice_pass")
_warn_or_raise_for_secret(
    name="POSTGRES_PASSWORD",
    value=DB_PASSWORD,
    minimum_length=12,
    blocked_values={"voice_pass", "postgres", "password", "changeme", "test-password"},
)

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", os.getenv("MINIO_ROOT_USER", "minioadmin"))
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", os.getenv("MINIO_ROOT_PASSWORD", "minioadmin"))
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "voice-agent-audio")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() in {"1", "true", "yes", "on"}
# Public endpoint used only for presigned URL generation — must be reachable by browsers.
# In K8s: set to the ingress domain (e.g. vinai-speaking-agent.duckdns.org/storage).
# In local dev: set to localhost:9000 with MinIO port exposed.
_raw_public_endpoint = os.getenv("MINIO_PUBLIC_ENDPOINT", MINIO_ENDPOINT)
# minio-py expects bare host:port — strip any http:// or https:// prefix the user may have set
MINIO_PUBLIC_ENDPOINT = _raw_public_endpoint.removeprefix("https://").removeprefix("http://")
MINIO_PUBLIC_SECURE = os.getenv("MINIO_PUBLIC_SECURE", str(MINIO_SECURE)).lower() in {"1", "true", "yes", "on"}
_warn_or_raise_for_secret(
    name="MINIO_SECRET_KEY",
    value=MINIO_SECRET_KEY,
    minimum_length=12,
    blocked_values={"minioadmin", "password", "changeme", "test-secret"},
)

# ── Azure Cognitive Services ──────────────────────────────────────────────────
# Prefer the explicit AZURE_SPEECH_KEY. Do NOT silently fall back to
# AZURE_SUBSCRIPTION_ID — that can lead to accidental use of legacy keys.
AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY") or os.getenv("AZURE_SUBSCRIPTION_ID") or ""
if not os.getenv("AZURE_SPEECH_KEY") and os.getenv("AZURE_SUBSCRIPTION_ID"):
    warnings.warn(
        "AZURE_SUBSCRIPTION_ID is set but AZURE_SPEECH_KEY is not. Using AZURE_SUBSCRIPTION_ID for backward compatibility — please set AZURE_SPEECH_KEY.",
        stacklevel=2,
    )

# Service region — support either AZURE_SERVICE_REGION (current) or
# AZURE_SPEECH_REGION (legacy) environment variable names.
AZURE_SERVICE_REGION = os.getenv("AZURE_SERVICE_REGION") or os.getenv("AZURE_SPEECH_REGION") or ""
if not AZURE_SERVICE_REGION:
    warnings.warn(
        "AZURE_SERVICE_REGION (or AZURE_SPEECH_REGION) is not set. Azure assessment calls will fail without a region.",
        stacklevel=2,
    )

# Backward-compatible aliases (so older imports still work)
AZURE_SUBSCRIPTION_ID = AZURE_SPEECH_KEY
AZURE_SPEECH_REGION = AZURE_SERVICE_REGION

_cors_env = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
CORS_ORIGINS: list[str] = [origin.strip() for origin in _cors_env.split(",") if origin.strip()]

# ── Guardrails ─────────────────────────────────────────────────────────────────


def _parse_json_list(env_var: str, default: str = "[]") -> list[str]:
    raw = os.getenv(env_var, default)
    try:
        result = json.loads(raw)
        if not isinstance(result, list):
            raise RuntimeError(f"{env_var} must be a JSON array, got: {type(result).__name__}")
        return result
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{env_var} contains invalid JSON: {exc}") from exc


# Redis (rate limiting)
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Rate limiting
RATE_LIMIT_RPM: int = int(os.getenv("RATE_LIMIT_RPM", "10"))

# Input guardrails
MAX_INPUT_CHARS: int = int(os.getenv("MAX_INPUT_CHARS", "2000"))
INJECTION_USE_LLM: bool = os.getenv("INJECTION_USE_LLM", "false").lower() == "true"
TOPIC_BLOCKLIST: list[str] = _parse_json_list("TOPIC_BLOCKLIST")

# Audit
AUDIT_DB_ENABLED: bool = os.getenv("AUDIT_DB_ENABLED", "false").lower() == "true"
