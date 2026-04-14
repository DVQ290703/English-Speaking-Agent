import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "claude-sonnet-4-20250514")
DEFAULT_VOICE = os.getenv("DEFAULT_VOICE", "alloy")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

DATA_DIR = Path(os.getenv("DATA_DIR", "data"))
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(DATA_DIR / "speaking_coach_bootstrap.sqlite3")))
UPLOAD_DIR = DATA_DIR / "uploads"
GENERATED_AUDIO_DIR = DATA_DIR / "generated_audio"

APP_SECRET_KEY = os.getenv("APP_SECRET_KEY", "dev-secret-change-me")
SUPPORTED_MODELS = [
    "gpt-4o-mini",
    "gpt-4o",
    "claude-3-5-sonnet",
    "claude-sonnet-4-20250514",
]
SUPPORTED_VOICES = [
    "alloy",
    "echo",
    "fable",
    "onyx",
    "nova",
    "shimmer",
]
