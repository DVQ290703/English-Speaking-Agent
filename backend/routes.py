import base64
import logging

import psycopg2
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials

from .ai_services import normalize_history, run_langraph_agent, transcribe_audio
from .database import get_connection
from .schemas import (
    ChatResponse,
    ConversationListResponse,
    ConversationMessagesResponse,
    ConversationOut,
    LoginRequest,
    LoginResponse,
    MessageOut,
    RegisterRequest,
    UserOut,
)
from .security import create_access_token, decode_token, get_current_user_id, hash_password, security, verify_password
from .storage import get_presigned_url, store_assistant_audio, store_user_audio

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _persist_audio_asset(
    *,
    message_id: str,
    audio_type: str,
    object_key: str,
    mime_type: str,
    size_bytes: int,
) -> None:
    """Insert an audio_assets row. Separate connection so it can be called after MinIO upload."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO audio_assets
                    (message_id, audio_type, storage_provider, storage_key, mime_type, size_bytes)
                VALUES (%s, %s, 'minio', %s, %s, %s)
                """,
                (message_id, audio_type, object_key, mime_type, size_bytes),
            )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

@router.post("/api/chat/respond", response_model=ChatResponse)
async def chat_respond(
    text: str | None = Form(default=None),
    history: str | None = Form(default=None),
    topic: str | None = Form(default=None),
    audio_file: UploadFile | None = File(default=None),
    conversation_id: str | None = Form(default=None),
    user_id: str = Depends(get_current_user_id),
):
    """Handle text or audio input, persist the turn, store audio in MinIO, and return the AI response."""
    user_input = (text or "").strip()
    input_mode = "audio" if audio_file else "text"
    audio_bytes_received = b""

    # ── Read and transcribe uploaded audio ───────────────────────────────────
    if audio_file is not None:
        audio_bytes_received = await audio_file.read()
        if not user_input:
            transcript = transcribe_audio(audio_bytes_received, filename=audio_file.filename or "recording.webm")
            user_input = transcript.strip() if transcript else "I sent an audio message."

    if not user_input:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No input provided")

    # ── Persist user message ─────────────────────────────────────────────────
    with get_connection() as conn:
        with conn.cursor() as cur:
            if conversation_id:
                cur.execute(
                    "SELECT id::text FROM conversations WHERE id = %s AND user_id = %s LIMIT 1",
                    (conversation_id, user_id),
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
                conv_id = row[0]
            else:
                topic_id = None
                if topic and topic.strip():
                    cur.execute(
                        "SELECT id::text FROM topics WHERE code = %s LIMIT 1",
                        (topic.strip().lower(),),
                    )
                    t = cur.fetchone()
                    if t:
                        topic_id = t[0]
                title = f"Chat on {topic.strip()}" if topic and topic.strip() else "New Conversation"
                cur.execute(
                    """
                    INSERT INTO conversations (user_id, topic_id, title)
                    VALUES (%s, %s, %s)
                    RETURNING id::text
                    """,
                    (user_id, topic_id, title),
                )
                conv_id = cur.fetchone()[0]

            cur.execute(
                "SELECT COALESCE(MAX(turn_number), 0) + 1 FROM turns WHERE conversation_id = %s",
                (conv_id,),
            )
            turn_number = cur.fetchone()[0]

            cur.execute(
                "INSERT INTO turns (conversation_id, turn_number) VALUES (%s, %s) RETURNING id::text",
                (conv_id, turn_number),
            )
            turn_id = cur.fetchone()[0]

            cur.execute(
                """
                INSERT INTO messages (conversation_id, turn_id, role, input_mode, text_content)
                VALUES (%s, %s, 'user', %s, %s)
                RETURNING id::text
                """,
                (conv_id, turn_id, input_mode, user_input),
            )
            user_message_id = cur.fetchone()[0]

    # ── Store user audio → record in audio_assets ────────────────────────────
    user_audio_url: str | None = None
    if audio_bytes_received:
        try:
            object_key, user_audio_url, mime_type = store_user_audio(
                conversation_id=conv_id,
                message_id=user_message_id,
                audio_bytes=audio_bytes_received,
                filename=audio_file.filename if audio_file else None,
                content_type=audio_file.content_type if audio_file else None,
            )
            _persist_audio_asset(
                message_id=user_message_id,
                audio_type="user_input",
                object_key=object_key,
                mime_type=mime_type,
                size_bytes=len(audio_bytes_received),
            )
        except Exception:
            logger.exception(
                "Failed to store user audio for message %s (conv %s)",
                user_message_id,
                conv_id,
            )

    # ── Call the agent (outside any DB connection) ────────────────────────────
    conversation_history = normalize_history(history_raw=history, topic=topic)
    response_text, response_audio_bytes = run_langraph_agent(
        user_input=user_input, history=conversation_history
    )

    # ── Persist assistant message ─────────────────────────────────────────────
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO messages (conversation_id, turn_id, role, input_mode, text_content)
                VALUES (%s, %s, 'assistant', 'text', %s)
                RETURNING id::text
                """,
                (conv_id, turn_id, response_text),
            )
            assistant_message_id = cur.fetchone()[0]
            cur.execute(
                "UPDATE conversations SET updated_at = NOW() WHERE id = %s",
                (conv_id,),
            )

    # ── Store assistant audio → record in audio_assets ───────────────────────
    if response_audio_bytes:
        try:
            object_key, _ = store_assistant_audio(
                conversation_id=conv_id,
                message_id=assistant_message_id,
                audio_bytes=response_audio_bytes,
            )
            _persist_audio_asset(
                message_id=assistant_message_id,
                audio_type="assistant_tts",
                object_key=object_key,
                mime_type="audio/mpeg",
                size_bytes=len(response_audio_bytes),
            )
        except Exception:
            logger.exception(
                "Failed to store assistant audio for message %s (conv %s)",
                assistant_message_id,
                conv_id,
            )

    return ChatResponse(
        user_input=user_input,
        response_text=response_text,
        # audio_base64 is the correct delivery mechanism for real-time playback.
        # MinIO presigned URLs are signed against the internal Docker hostname
        # (minio:9000) and are unreachable from the browser — returning them
        # causes audio.onerror to fire and the browser falls back to Web Speech.
        audio_base64=base64.b64encode(response_audio_bytes).decode("utf-8") if response_audio_bytes else "",
        audio_mime="audio/mpeg",
        user_audio_url=None,        # local blob URL already held by frontend is used for replay
        assistant_audio_url=None,   # presigned URLs served via conversation history endpoint only
        conversation_id=conv_id,
    )


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------

@router.get("/api/conversations", response_model=ConversationListResponse)
def list_conversations(user_id: str = Depends(get_current_user_id)):
    """Return all conversations for the authenticated user, newest first."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, title, status, started_at, ended_at, topic_id::text
                FROM conversations
                WHERE user_id = %s
                ORDER BY started_at DESC
                LIMIT 100
                """,
                (user_id,),
            )
            rows = cur.fetchall()

    conversations = [
        ConversationOut(
            id=r[0],
            title=r[1],
            status=r[2],
            started_at=r[3],
            ended_at=r[4],
            topic_id=r[5],
        )
        for r in rows
    ]
    return ConversationListResponse(conversations=conversations)


@router.get("/api/conversations/{conversation_id}/messages", response_model=ConversationMessagesResponse)
def get_conversation_messages(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return all messages in a conversation with fresh presigned audio URLs."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM conversations WHERE id = %s AND user_id = %s LIMIT 1",
                (conversation_id, user_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

            cur.execute(
                """
                SELECT
                    m.id::text,
                    m.role,
                    m.input_mode,
                    m.text_content,
                    m.created_at,
                    aa.storage_key
                FROM messages m
                LEFT JOIN audio_assets aa ON aa.message_id = m.id
                WHERE m.conversation_id = %s
                ORDER BY m.created_at ASC
                """,
                (conversation_id,),
            )
            rows = cur.fetchall()

    messages: list[MessageOut] = []
    for msg_id, role, input_mode, text_content, created_at, storage_key in rows:
        audio_url: str | None = None
        if storage_key:
            try:
                audio_url = get_presigned_url(storage_key)
            except Exception:
                logger.exception("Failed to generate presigned URL for key %s", storage_key)

        messages.append(
            MessageOut(
                id=msg_id,
                role=role,
                input_mode=input_mode,
                text_content=text_content,
                created_at=created_at,
                audio_url=audio_url,
            )
        )

    return ConversationMessagesResponse(conversation_id=conversation_id, messages=messages)
