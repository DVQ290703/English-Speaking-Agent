import psycopg2
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials

from .ai_services import normalize_history, run_langraph_agent, transcribe_audio
from .database import get_connection
from .schemas import ChatResponse, LoginRequest, LoginResponse, RegisterRequest, UserOut
from .security import create_access_token, decode_token, get_current_user_id, hash_password, security, verify_password


router = APIRouter()


@router.get("/health")
def health_check():
    """Simple readiness endpoint for local checks and container health probes."""
    return {"status": "ok"}


@router.post("/api/auth/login", response_model=LoginResponse)
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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password...")

    user_id, email, password_hash, display_name, english_level = row
    if not verify_password(payload.password, password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong Password...")

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


@router.get("/api/auth/me", response_model=UserOut)
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


@router.post("/api/chat/respond", response_model=ChatResponse)
async def chat_respond(
    text: str | None = Form(default=None),
    history: str | None = Form(default=None),
    topic: str | None = Form(default=None),
    audio_file: UploadFile | None = File(default=None),
    user_id: str = Depends(get_current_user_id),
):
    """Handle text or audio chat input and return both text and spoken feedback."""
    _ = user_id

    user_input = (text or "").strip()

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


@router.post("/api/auth/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest):
    """Create a new user account and return an access token for immediate login."""
    email = payload.email.lower().strip()
    password = payload.password.strip()
    display_name = payload.display_name.strip() if payload.display_name else None
    english_level = payload.english_level.strip() if payload.english_level else None

    if not display_name:
        display_name = email.split("@", 1)[0]

    if not email or not password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email and password are required")

    if len(password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must have at least 8 characters")

    password_hash = hash_password(password)

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
                conn.commit()
            except psycopg2.errors.UniqueViolation:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    if not row:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="User registration failed")

    user_id, email, display_name, english_level = row
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
