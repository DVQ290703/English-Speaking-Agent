import os
import json
import base64
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

import bcrypt
import jwt # PyJWT library for JWT handling (json web tokens)
import psycopg2
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr


load_dotenv()


# Security and database settings are loaded from the environment so the
# same code can run locally, in Docker, or in production.
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change_me_in_production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
DB_NAME = os.getenv("POSTGRES_DB", "voice_agent")
DB_USER = os.getenv("POSTGRES_USER", "voice_user")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "voice_pass")

security = HTTPBearer()

app = FastAPI(title="Voice Agent Auth API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    english_level: str | None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class ChatResponse(BaseModel):
    user_input: str
    response_text: str
    audio_base64: str = ""
    audio_mime: str = "audio/mpeg"


def get_connection():
    """Create a PostgreSQL connection using the configured environment values."""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )


def create_access_token(user_id: str, email: str):
    """Generate a signed JWT and return it with its remaining lifetime in seconds."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return token, int((expires_at - now).total_seconds())


def decode_token(token: str):
    """Validate and decode a JWT payload for authenticated requests."""
    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract the current user identifier from the bearer token."""
    claims = decode_token(credentials.credentials)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user_id


@lru_cache(maxsize=1)
def get_voice_agent_pipeline():
    """Lazily initialize and cache the expensive voice agent pipeline."""
    from src.agents.pipeline import VoiceAgentPipeline
    from src.services.elevenlabs_tts import ElevenLabsTTS
    from src.services.groq_llm import GroqLLMService

    llm_model = os.getenv("GROQ_LLM_MODEL", "llama-3.3-70b-versatile")
    return VoiceAgentPipeline(
        llm_service=GroqLLMService(model_name=llm_model),
        tts_service=ElevenLabsTTS(output_dir="outputs"),
    )


@lru_cache(maxsize=1)
def get_stt_service():
    """Lazily initialize and cache the speech-to-text service."""
    from src.services.groq_stt import GroqSTTService

    stt_model = os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo")
    return GroqSTTService(model_name=stt_model)


def normalize_history(history_raw: str | None, topic: str | None) -> list[str]:
    """Convert raw UI history into a compact list of prompt-ready conversation lines."""
    history_lines: list[str] = []

    if topic and topic.strip():
        history_lines.append(f"Topic: {topic.strip()}")

    if not history_raw:
        return history_lines
    
    try:
        parsed = json.loads(history_raw)
    except json.JSONDecodeError:
        return history_lines
    
    if not isinstance(parsed, list):
        return history_lines
    
    for item in parsed[-10:]:
        if isinstance(item, dict):
            role = str(item.get("role", "user")).strip().title()
            text = str(item.get("text", "")).strip()
            if text:
                history_lines.append(f"{role}: {text}")
        elif isinstance(item, str) and item.strip():
            history_lines.append(item.strip())
    
    return history_lines


def transcribe_audio(audio_bytes: bytes, filename: str) -> str:
    """Transcribe uploaded audio and fall back safely on provider errors."""
    try:
        stt_service = get_stt_service()
        return stt_service.transcribe(audio_bytes, filename=filename)
    except Exception:
        return ""


def synthesize_audio_base64(response_text: str) -> str:
    """Convert response text to base64-encoded audio for direct frontend playback."""
    try:
        from src.services.elevenlabs_tts import ElevenLabsTTS

        tts_service = ElevenLabsTTS(output_dir="outputs")
        audio_path = tts_service.convert_text_to_speech(response_text)

        if not audio_path:
            return ""

        audio_file = Path(audio_path)
        if not audio_file.exists():
            return ""

        return base64.b64encode(audio_file.read_bytes()).decode("utf-8")
    except Exception:
        return ""


def run_langraph_agent(user_input: str, history: list[str] | None = None) -> tuple[str, str]:
    """Run the main conversation pipeline and always return a text response."""
    try:
        pipeline = get_voice_agent_pipeline()
        result = pipeline.run(user_input=user_input, history=history or [])
        response_text = str(result.get("response_text", "")).strip()
        audio_path = str(result.get("audio_path", "")).strip()

        # If the pipeline already generated audio, reuse it instead of making
        # another text-to-speech call.
        audio_base64 = ""
        if audio_path:
            audio_file = Path(audio_path)
            if audio_file.exists():
                audio_base64 = base64.b64encode(audio_file.read_bytes()).decode("utf-8")

        if response_text:
            return response_text, audio_base64

    except Exception:
        pass

    # Keep the UX resilient even when one of the AI services is temporarily down.
    fallback_text = "Sorry, I couldn't process your request right now."
    return fallback_text, synthesize_audio_base64(fallback_text)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Check a plaintext password against the stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False
    

@app.get("/health")
def health_check():
    """Simple readiness endpoint for local checks and container health probes."""
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    """Authenticate a user and return a signed access token plus profile data."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, email::text, password_hash, display_name, english_level
                FROM users
                WHERE email = %s AND is_active = TRUE
                LIMIT 1;
                """,
                (payload.email.lower(),),
            )

            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    
    user_id, email, password_hash, display_name, english_level = row
    if not verify_password(payload.password, password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    
    access_token, expires_in = create_access_token(user_id=user_id, email=email)

    return LoginResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=UserOut(
            id=user_id,
            email=email,
            display_name=display_name,
            english_level=english_level,
        ),
    )


@app.get("/api/auth/me", response_model=UserOut)
def me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Return the currently authenticated user's public profile."""
    claims = decode_token(credentials.credentials)
    user_id = claims.get("sub")

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    
    user_id, email, display_name, english_level = row
    return UserOut(
        id=user_id,
        email=email,
        display_name=display_name,
        english_level=english_level,
    )


@app.post("/api/chat/respond", response_model=ChatResponse)
async def chat_respond(
    text: str | None = Form(default=None),
    history: str | None = Form(default=None),
    topic: str | None = Form(default=None),
    audio_file: UploadFile | None = File(default=None),
    user_id: str = Depends(get_current_user_id)
):
    """Handle text or audio chat input and return both text and spoken feedback."""
    _ = user_id

    user_input = (text or "").strip()

    # Support hybrid input: typed text is preferred, otherwise we transcribe audio.
    if not user_input and audio_file is not None:
        audio_bytes = await audio_file.read()
        transcript = transcribe_audio(audio_bytes, filename=audio_file.filename or "recording.webm")
        user_input = transcript.strip() if transcript else "I sent an audio message."

    if not user_input:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No input provided")

    conversation_history = normalize_history(history_raw=history, topic=topic)
    response_text, audio_base64 = run_langraph_agent(user_input=user_input, history=conversation_history)

    return ChatResponse(
        user_input=user_input,
        response_text=response_text,
        audio_base64=audio_base64,
        audio_mime="audio/mpeg",
    )