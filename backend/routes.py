import base64
import logging
import uuid as _uuid

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
from .storage import (
    build_object_key,
    delete_object,
    _upload,
    get_presigned_url,
    store_assistant_audio,
    store_user_audio,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

_MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _insert_audio_asset(
    cur,
    *,
    message_id: str,
    audio_type: str,
    object_key: str,
    mime_type: str,
    size_bytes: int,
) -> None:
    """Insert one audio_assets row using an already-open cursor."""
    cur.execute(
        """
        INSERT INTO audio_assets
            (message_id, audio_type, storage_provider, storage_key, mime_type, size_bytes)
        VALUES (%s, %s, 'minio', %s, %s, %s)
        """,
        (message_id, audio_type, object_key, mime_type, size_bytes),
    )


def _validate_uuid(value: str, field: str) -> None:
    """Raise HTTP 400 when *value* is not a valid UUID string."""
    try:
        _uuid.UUID(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field}: must be a UUID",
        )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@router.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    logger.info("Login attempt for email=%s", payload.email.lower())

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
        logger.warning("Login failed — no active user found for email=%s", payload.email.lower())
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    user_id, email, password_hash, display_name, english_level = row
    if not verify_password(payload.password, password_hash):
        logger.warning("Login failed — wrong password for user_id=%s", user_id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    access_token, expires_in = create_access_token(user_id=user_id, email=email)
    logger.info("Login successful user_id=%s expires_in=%ds", user_id, expires_in)
    return LoginResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=UserOut(id=user_id, email=email, display_name=display_name, english_level=english_level),
    )


@router.get("/auth/me", response_model=UserOut)
def me(credentials: HTTPAuthorizationCredentials = Depends(security)):
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
        logger.warning("GET /auth/me — user_id=%s not found or inactive", user_id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    user_id, email, display_name, english_level = row
    return UserOut(id=user_id, email=email, display_name=display_name, english_level=english_level)


@router.post("/auth/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest):
    email = payload.email.lower().strip()
    logger.info("Register attempt email=%s", email)

    password = payload.password
    if len(password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")

    display_name = (payload.display_name or "").strip() or email.split("@", 1)[0]
    english_level = (payload.english_level or "").strip() or None

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
            except psycopg2.errors.UniqueViolation:
                logger.warning("Register failed — email already registered: %s", email)
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    if not row:
        logger.error("Register failed — INSERT returned no row for email=%s", email)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="User registration failed")

    user_id, email, display_name, english_level = row
    access_token, expires_in = create_access_token(user_id=user_id, email=email)
    logger.info("Register successful user_id=%s email=%s", user_id, email)
    return LoginResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=UserOut(id=user_id, email=email, display_name=display_name, english_level=english_level),
    )


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

@router.post("/chat/respond", response_model=ChatResponse)
def chat_respond(
    text: str | None = Form(default=None),
    history: str | None = Form(default=None),
    topic: str | None = Form(default=None),
    audio_file: UploadFile | None = File(default=None),
    conversation_id: str | None = Form(default=None),
    user_id: str = Depends(get_current_user_id),
):
    """Handle text or audio input, persist the turn, store audio in MinIO, return the AI response."""
    input_mode = "audio" if audio_file else "text"
    logger.info(
        "chat_respond start — user_id=%s input_mode=%s topic=%r conversation_id=%s",
        user_id, input_mode, topic, conversation_id,
    )

    user_input = (text or "").strip()
    audio_bytes_received = b""

    # ── Read and optionally transcribe the uploaded audio ────────────────────
    if audio_file is not None:
        audio_bytes_received = audio_file.file.read(_MAX_AUDIO_BYTES + 1)
        logger.info(
            "Audio received filename=%r content_type=%r size=%d bytes",
            audio_file.filename, audio_file.content_type, len(audio_bytes_received),
        )
        if len(audio_bytes_received) > _MAX_AUDIO_BYTES:
            logger.warning("Audio upload rejected — size %d exceeds 25 MB limit", len(audio_bytes_received))
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Audio file exceeds 25 MB limit",
            )
        if not user_input:
            logger.info("No text provided — transcribing audio via STT")
            transcript = transcribe_audio(
                audio_bytes_received,
                filename=audio_file.filename or "recording.webm",
            )
            user_input = transcript.strip() if transcript else "I sent an audio message."
            logger.info("STT result: %r (len=%d)", user_input[:120], len(user_input))

    if not user_input:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No input provided")

    if conversation_id:
        _validate_uuid(conversation_id, "conversation_id")

    # ── Block 1: persist conversation / turn / user message ──────────────────
    logger.debug("Block 1 — persisting conversation/turn/user message")
    with get_connection() as conn:
        with conn.cursor() as cur:
            if conversation_id:
                cur.execute(
                    "SELECT id::text FROM conversations WHERE id = %s AND user_id = %s LIMIT 1",
                    (conversation_id, user_id),
                )
                row = cur.fetchone()
                if not row:
                    logger.warning("Conversation not found conversation_id=%s user_id=%s", conversation_id, user_id)
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
                conv_id = row[0]
                logger.debug("Continuing existing conversation conv_id=%s", conv_id)
            else:
                topic_id = None
                topic_clean = topic.strip() if topic else ""
                if topic_clean:
                    cur.execute(
                        "SELECT id::text FROM topics WHERE code = %s LIMIT 1",
                        (topic_clean.lower(),),
                    )
                    t = cur.fetchone()
                    if t:
                        topic_id = t[0]
                        logger.debug("Resolved topic %r → topic_id=%s", topic_clean, topic_id)
                    else:
                        logger.debug("Topic %r not found in DB — proceeding without topic_id", topic_clean)
                title = f"Chat on {topic_clean}" if topic_clean else "New Conversation"
                cur.execute(
                    "INSERT INTO conversations (user_id, topic_id, title) VALUES (%s, %s, %s) RETURNING id::text",
                    (user_id, topic_id, title),
                )
                conv_id = cur.fetchone()[0]
                logger.info("New conversation created conv_id=%s title=%r topic_id=%s", conv_id, title, topic_id)

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
            logger.debug("Turn created turn_id=%s turn_number=%d", turn_id, turn_number)

            cur.execute(
                """
                INSERT INTO messages (conversation_id, turn_id, role, input_mode, text_content)
                VALUES (%s, %s, 'user', %s, %s)
                RETURNING id::text
                """,
                (conv_id, turn_id, input_mode, user_input),
            )
            user_message_id = cur.fetchone()[0]
            logger.info("User message persisted message_id=%s input_mode=%s text=%r", user_message_id, input_mode, user_input[:80])

    # ── Upload user audio to MinIO (outside DB transaction) ──────────────────
    user_object_key: str | None = None
    user_mime_type: str = "audio/webm"
    if audio_bytes_received:
        logger.info("Uploading user audio to MinIO size=%d bytes", len(audio_bytes_received))
        try:
            user_object_key, user_mime_type = store_user_audio(
                conversation_id=conv_id,
                message_id=user_message_id,
                audio_bytes=audio_bytes_received,
                filename=audio_file.filename if audio_file else None,
                content_type=audio_file.content_type if audio_file else None,
            )
            logger.info("User audio uploaded key=%s mime=%s", user_object_key, user_mime_type)
        except Exception:
            logger.exception("MinIO upload failed for user audio (msg %s)", user_message_id)

    # ── LLM + TTS (outside DB, most expensive step) ───────────────────────────
    logger.info("Running LLM+TTS pipeline user_input=%r history_lines=%d", user_input[:80], len(history or ""))
    conversation_history = normalize_history(history_raw=history, topic=topic)
    response_text, response_audio_bytes = run_langraph_agent(
        user_input=user_input, history=conversation_history
    )
    logger.info(
        "Pipeline complete response_text=%r audio_bytes=%d",
        response_text[:80], len(response_audio_bytes),
    )

    # ── Upload assistant audio to MinIO (outside DB transaction) ─────────────
    assistant_object_key: str | None = None
    if response_audio_bytes:
        logger.info("Uploading assistant audio to MinIO size=%d bytes", len(response_audio_bytes))
        try:
            assistant_object_key = store_assistant_audio(
                conversation_id=conv_id,
                message_id="pending",
                audio_bytes=response_audio_bytes,
            )
            logger.info("Assistant audio uploaded (pending) key=%s", assistant_object_key)
        except Exception:
            logger.exception("MinIO upload failed for assistant audio (conv %s)", conv_id)
    else:
        logger.warning("Pipeline returned empty audio — no MinIO upload for assistant turn")

    # ── Block 2: persist assistant message + both audio_asset records ─────────
    logger.debug("Block 2 — persisting assistant message and audio assets")
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
            logger.info("Assistant message persisted message_id=%s", assistant_message_id)

            cur.execute("UPDATE conversations SET updated_at = NOW() WHERE id = %s", (conv_id,))

            if user_object_key:
                _insert_audio_asset(
                    cur,
                    message_id=user_message_id,
                    audio_type="user_input",
                    object_key=user_object_key,
                    mime_type=user_mime_type,
                    size_bytes=len(audio_bytes_received),
                )
                logger.debug("audio_asset row inserted for user_input message_id=%s", user_message_id)

            if assistant_object_key:
                pending_key = assistant_object_key
                real_key = build_object_key(
                    conversation_id=conv_id,
                    message_id=assistant_message_id,
                    audio_type="assistant_tts",
                    extension="mp3",
                )
                logger.info("Re-keying assistant audio: %s → %s", pending_key, real_key)
                try:
                    _upload(object_key=real_key, content=response_audio_bytes, content_type="audio/mpeg")
                    delete_object(pending_key)
                    assistant_object_key = real_key
                    logger.info("Re-key successful, pending key deleted")
                except Exception:
                    logger.exception("Failed to re-key assistant audio to %s", real_key)

                _insert_audio_asset(
                    cur,
                    message_id=assistant_message_id,
                    audio_type="assistant_tts",
                    object_key=assistant_object_key,
                    mime_type="audio/mpeg",
                    size_bytes=len(response_audio_bytes),
                )
                logger.debug("audio_asset row inserted for assistant_tts message_id=%s", assistant_message_id)

    # ── Generate presigned URLs for the response ──────────────────────────────
    user_audio_url: str | None = None
    if user_object_key:
        try:
            user_audio_url = get_presigned_url(user_object_key)
            logger.debug("Presigned URL generated for user audio key=%s", user_object_key)
        except Exception:
            logger.exception("Failed to generate presigned URL for user audio (msg %s)", user_message_id)

    assistant_audio_url: str | None = None
    if assistant_object_key:
        try:
            assistant_audio_url = get_presigned_url(assistant_object_key)
            logger.debug("Presigned URL generated for assistant audio key=%s", assistant_object_key)
        except Exception:
            logger.exception("Failed to generate presigned URL for assistant audio (msg %s)", assistant_message_id)

    logger.info(
        "chat_respond done conv_id=%s user_msg=%s assistant_msg=%s "
        "audio_bytes=%d user_audio_url=%s assistant_audio_url=%s",
        conv_id, user_message_id, assistant_message_id,
        len(response_audio_bytes),
        "yes" if user_audio_url else "no",
        "yes" if assistant_audio_url else "no",
    )

    return ChatResponse(
        user_input=user_input,
        response_text=response_text,
        audio_base64=base64.b64encode(response_audio_bytes).decode("utf-8") if response_audio_bytes else "",
        audio_mime="audio/mpeg",
        user_audio_url=user_audio_url,
        assistant_audio_url=assistant_audio_url,
        conversation_id=conv_id,
    )


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------

@router.get("/conversations", response_model=ConversationListResponse)
def list_conversations(user_id: str = Depends(get_current_user_id)):
    logger.debug("list_conversations user_id=%s", user_id)
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

    logger.info("list_conversations user_id=%s returned %d conversations", user_id, len(rows))
    conversations = [
        ConversationOut(id=r[0], title=r[1], status=r[2], started_at=r[3], ended_at=r[4], topic_id=r[5])
        for r in rows
    ]
    return ConversationListResponse(conversations=conversations)


@router.get("/conversations/{conversation_id}/messages", response_model=ConversationMessagesResponse)
def get_conversation_messages(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
):
    logger.info("get_conversation_messages conversation_id=%s user_id=%s", conversation_id, user_id)
    _validate_uuid(conversation_id, "conversation_id")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM conversations WHERE id = %s AND user_id = %s LIMIT 1",
                (conversation_id, user_id),
            )
            if not cur.fetchone():
                logger.warning("Conversation not found or unauthorized conversation_id=%s user_id=%s", conversation_id, user_id)
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

    logger.info("get_conversation_messages conversation_id=%s returned %d rows", conversation_id, len(rows))

    messages: list[MessageOut] = []
    presign_ok = 0
    presign_fail = 0
    for msg_id, role, input_mode, text_content, created_at, storage_key in rows:
        audio_url: str | None = None
        if storage_key:
            try:
                audio_url = get_presigned_url(storage_key)
                presign_ok += 1
            except Exception:
                logger.exception("Failed to generate presigned URL for key %s", storage_key)
                presign_fail += 1

        messages.append(MessageOut(
            id=msg_id,
            role=role,
            input_mode=input_mode,
            text_content=text_content,
            created_at=created_at,
            audio_url=audio_url,
        ))

    if presign_fail:
        logger.warning("Presigned URL generation: %d ok, %d failed for conversation_id=%s", presign_ok, presign_fail, conversation_id)
    else:
        logger.debug("Presigned URL generation: %d ok for conversation_id=%s", presign_ok, conversation_id)

    return ConversationMessagesResponse(conversation_id=conversation_id, messages=messages)
