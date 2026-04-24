import os
import warnings

from dotenv import load_dotenv

load_dotenv()

# ── JWT ──────────────────────────────────────────────────────────────────────
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
if not JWT_SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY is not set. Add it to your .env file or environment. "
        "Refusing to start with an empty signing key."
    )
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

# ── PostgreSQL ────────────────────────────────────────────────────────────────
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
DB_NAME = os.getenv("POSTGRES_DB", "voice_agent")
DB_USER = os.getenv("POSTGRES_USER", "voice_user")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "voice_pass")
if not os.getenv("POSTGRES_PASSWORD"):
    warnings.warn(
        "POSTGRES_PASSWORD is not set — using insecure default 'voice_pass'",
        stacklevel=2,
    )

# ── MinIO ─────────────────────────────────────────────────────────────────────
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", os.getenv("MINIO_ROOT_USER", "minioadmin"))
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", os.getenv("MINIO_ROOT_PASSWORD", "minioadmin"))
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "voice-agent-audio")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() in {"1", "true", "yes", "on"}
if not os.getenv("MINIO_SECRET_KEY") and not os.getenv("MINIO_ROOT_PASSWORD"):
    warnings.warn(
        "MINIO_SECRET_KEY is not set — using insecure default 'minioadmin'",
        stacklevel=2,
    )

# ── Azure Cognitive Services ──────────────────────────────────────────────────
AZURE_SUBSCRIPTION_ID = os.getenv("AZURE_SUBSCRIPTION_ID", "")
AZURE_SERVICE_REGION = os.getenv("AZURE_SERVICE_REGION", "")

# ── CORS ──────────────────────────────────────────────────────────────────────
_cors_env = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
CORS_ORIGINS: list[str] = [o.strip() for o in _cors_env.split(",") if o.strip()]
