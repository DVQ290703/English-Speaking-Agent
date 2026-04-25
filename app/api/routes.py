import base64
import re
import uuid as _uuid

import psycopg2
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError

from app.api.schemas import (
    AssessmentResponse,
    ChatResponse,
    ConversationListResponse,
    ConversationMessagesResponse,
    ConversationOut,
    LoginRequest,
    LoginResponse,
    MessageOut,
    PhonemeResult,
    RegisterRequest,
    SyllableResult,
    UserOut,
    WordResult,
)
from app.core.ai_services import get_assessment_service, normalize_history, run_langraph_agent, transcribe_audio
from app.core.database import get_connection
from app.core.logger import logger
from app.core.security import (
    create_access_token,
    decode_token,
    get_current_user_id,
    hash_password,
    security,
    verify_password_with_padding,
)
from app.core.storage import _upload, build_object_key, get_presigned_url, store_user_audio

router = APIRouter(prefix="/api")

_MAX_AUDIO_BYTES = 25 * 1024 * 1024
_MAX_TEXT_CHARS = 4_000
_MAX_HISTORY_CHARS = 50_000
_MAX_TOPIC_CHARS = 80
_MAX_REFERENCE_TEXT_CHARS = 500
_INLINE_AUDIO_LIMIT_BYTES = 512 * 1024

_CHAT_AUDIO_CONTENT_TYPES = frozenset({
    "audio/webm",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/pcm",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
})
_SUPPORTED_AUDIO_CONTENT_TYPES = frozenset({
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/pcm",
})
_ALLOWED_LANGUAGE_CODES = frozenset({"en-US", "en-GB"})
_PASSWORD_POLICY_MESSAGE = (
    "Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol."
)


def _insert_audio_asset(
    cur,
    *,
    message_id: str,
    audio_type: str,
    object_key: str,
    mime_type: str,
    size_bytes: int,
) -> None:
    cur.execute(
        """
        INSERT INTO audio_assets
            (message_id, audio_type, storage_provider, storage_key, mime_type, size_bytes)
        VALUES (%s, %s, 'minio', %s, %s, %s)
        """,
        (message_id, audio_type, object_key, mime_type, size_bytes),
    )


def _validate_uuid(value: str, field: str) -> None:
    try:
        _uuid.UUID(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field}: must be a UUID",
        ) from exc


def _enforce_max_length(value: str | None, *, field: str, max_chars: int) -> str | None:
    if value is None:
        return None
    if len(value) > max_chars:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"{field} exceeds {max_chars} characters",
        )
    return value


def _validate_password_strength(password: str) -> None:
    if (
        len(password) < 12
        or not re.search(r"[A-Z]", password)
        or not re.search(r"[a-z]", password)
        or not re.search(r"\d", password)
        or not re.search(r"[^A-Za-z0-9]", password)
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=_PASSWORD_POLICY_MESSAGE)


def _normalize_language(language: str | None) -> str | None:
    if language is None:
        return None
    candidate = language.strip()
    if not candidate:
        return None
    if candidate not in _ALLOWED_LANGUAGE_CODES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported language '{candidate}'. Allowed values: en-US, en-GB.",
        )
    return candidate


def _audio_signature_matches(content_type: str, audio_bytes: bytes) -> bool:
    if not audio_bytes:
        return False
    if content_type in {"audio/wav", "audio/x-wav", "audio/wave"}:
        return len(audio_bytes) >= 12 and audio_bytes[:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE"
    if content_type == "audio/webm":
        return audio_bytes.startswith(b"\x1A\x45\xDF\xA3")
    if content_type == "audio/ogg":
        return audio_bytes.startswith(b"OggS")
    if content_type == "audio/mp4":
        return len(audio_bytes) >= 12 and audio_bytes[4:8] == b"ftyp"
    if content_type == "audio/mpeg":
        return audio_bytes.startswith(b"ID3") or audio_bytes[:2] in {
            b"\xff\xfb",
            b"\xff\xf3",
            b"\xff\xf2",
        }
    if content_type == "audio/pcm":
        return True
    return False


def _validate_uploaded_audio(
    *,
    audio_file: UploadFile,
    audio_bytes: bytes,
    allowed_content_types: frozenset[str],
    endpoint_label: str,
) -> str:
    content_type = (audio_file.content_type or "").lower().split(";", 1)[0].strip()
    if not content_type:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"{endpoint_label} audio must declare a supported Content-Type",
        )
    if content_type not in allowed_content_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported audio format '{content_type}'",
        )
    if not _audio_signature_matches(content_type, audio_bytes):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Uploaded audio does not match the declared format",
        )
    return content_type


def _read_and_close_upload(audio_file: UploadFile) -> bytes:
    try:
        return audio_file.file.read(_MAX_AUDIO_BYTES + 1)
    finally:
        audio_file.file.truncate(0)
        audio_file.file.close()


@router.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest):
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
        logger.warning("GET /auth/me user_id=%s not found or inactive", user_id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    user_id, email, display_name, english_level = row
    return UserOut(id=user_id, email=email, display_name=display_name, english_level=english_level)


@router.post("/auth/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest):
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


@router.post("/chat/respond", response_model=ChatResponse)
def chat_respond(
    text: str | None = Form(default=None),
    history: str | None = Form(default=None),
    topic: str | None = Form(default=None),
    audio_file: UploadFile | None = File(default=None),
    conversation_id: str | None = Form(default=None),
    user_id: str = Depends(get_current_user_id),
):
    input_mode = "audio" if audio_file else "text"
    logger.info("chat_respond start user_id=%s input_mode=%s conversation_id=%s", user_id, input_mode, conversation_id)

    text = _enforce_max_length(text, field="text", max_chars=_MAX_TEXT_CHARS)
    history = _enforce_max_length(history, field="history", max_chars=_MAX_HISTORY_CHARS)
    topic = _enforce_max_length(topic, field="topic", max_chars=_MAX_TOPIC_CHARS)

    user_input = (text or "").strip()
    audio_bytes_received = b""

    if audio_file is not None:
        audio_bytes_received = _read_and_close_upload(audio_file)
        logger.info(
            "Audio received filename=%r content_type=%r size=%d bytes",
            audio_file.filename,
            audio_file.content_type,
            len(audio_bytes_received),
        )
        if len(audio_bytes_received) > _MAX_AUDIO_BYTES:
            logger.warning("Audio upload rejected size=%d exceeds limit", len(audio_bytes_received))
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Audio file exceeds 25 MB limit",
            )

        _validate_uploaded_audio(
            audio_file=audio_file,
            audio_bytes=audio_bytes_received,
            allowed_content_types=_CHAT_AUDIO_CONTENT_TYPES,
            endpoint_label="Chat",
        )

        if not user_input:
            logger.info("No text provided - transcribing audio via STT")
            transcript = transcribe_audio(
                audio_bytes_received,
                filename=audio_file.filename or "recording.webm",
            )
            user_input = transcript.strip() if transcript else "I sent an audio message."
            logger.info("STT completed transcript_length=%d", len(user_input))

    if not user_input:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No input provided")

    if conversation_id:
        _validate_uuid(conversation_id, "conversation_id")

    turn_id = str(_uuid.uuid4())
    user_message_id = str(_uuid.uuid4())
    assistant_message_id = str(_uuid.uuid4())

    logger.debug("Resolving conversation and turn number")
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
            else:
                topic_id = None
                topic_clean = topic.strip() if topic else ""
                if topic_clean:
                    cur.execute(
                        "SELECT id::text FROM topics WHERE code = %s LIMIT 1",
                        (topic_clean.lower(),),
                    )
                    topic_row = cur.fetchone()
                    if topic_row:
                        topic_id = topic_row[0]
                title = f"Chat on {topic_clean}" if topic_clean else "New Conversation"
                cur.execute(
                    "INSERT INTO conversations (user_id, topic_id, title) VALUES (%s, %s, %s) RETURNING id::text",
                    (user_id, topic_id, title),
                )
                conv_id = cur.fetchone()[0]
                logger.info("New conversation created conv_id=%s topic_id=%s", conv_id, topic_id)

            cur.execute(
                "SELECT COALESCE(MAX(turn_number), 0) + 1 FROM turns WHERE conversation_id = %s",
                (conv_id,),
            )
            turn_number = cur.fetchone()[0]

    user_object_key: str | None = None
    user_mime_type = "audio/webm"
    if audio_bytes_received:
        logger.info("Uploading user audio size=%d bytes", len(audio_bytes_received))
        try:
            user_object_key, user_mime_type = store_user_audio(
                conversation_id=conv_id,
                message_id=user_message_id,
                audio_bytes=audio_bytes_received,
                filename=audio_file.filename if audio_file else None,
                content_type=audio_file.content_type if audio_file else None,
            )
        except Exception:
            logger.exception("MinIO upload failed for user audio message_id=%s", user_message_id)

    conversation_history = normalize_history(history_raw=history, topic=topic)
    logger.info(
        "Running LLM+TTS pipeline user_input_length=%d history_lines=%d",
        len(user_input),
        len(conversation_history),
    )
    response_text, response_audio_bytes = run_langraph_agent(user_input=user_input, history=conversation_history)
    logger.info(
        "Pipeline complete response_text_length=%d audio_bytes=%d",
        len(response_text),
        len(response_audio_bytes),
    )

    assistant_object_key: str | None = None
    if response_audio_bytes:
        real_key = build_object_key(
            conversation_id=conv_id,
            message_id=assistant_message_id,
            audio_type="assistant_tts",
            extension="mp3",
        )
        logger.info("Uploading assistant audio key=%s size=%d bytes", real_key, len(response_audio_bytes))
        try:
            _upload(object_key=real_key, content=response_audio_bytes, content_type="audio/mpeg")
            assistant_object_key = real_key
        except Exception:
            logger.exception("MinIO upload failed for assistant audio conversation_id=%s", conv_id)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO turns (id, conversation_id, turn_number) VALUES (%s, %s, %s)",
                (turn_id, conv_id, turn_number),
            )
            cur.execute(
                """
                INSERT INTO messages (id, conversation_id, turn_id, role, input_mode, text_content)
                VALUES (%s, %s, %s, 'user', %s, %s)
                """,
                (user_message_id, conv_id, turn_id, input_mode, user_input),
            )
            cur.execute(
                """
                INSERT INTO messages (id, conversation_id, turn_id, role, input_mode, text_content)
                VALUES (%s, %s, %s, 'assistant', 'text', %s)
                """,
                (assistant_message_id, conv_id, turn_id, response_text),
            )
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

            if assistant_object_key:
                _insert_audio_asset(
                    cur,
                    message_id=assistant_message_id,
                    audio_type="assistant_tts",
                    object_key=assistant_object_key,
                    mime_type="audio/mpeg",
                    size_bytes=len(response_audio_bytes),
                )

    user_audio_url: str | None = None
    if user_object_key:
        try:
            user_audio_url = get_presigned_url(user_object_key)
        except Exception:
            logger.exception("Failed to generate presigned URL for user audio message_id=%s", user_message_id)

    assistant_audio_url: str | None = None
    if assistant_object_key:
        try:
            assistant_audio_url = get_presigned_url(assistant_object_key)
        except Exception:
            logger.exception("Failed to generate presigned URL for assistant audio message_id=%s", assistant_message_id)

    inline_audio = ""
    if response_audio_bytes and len(response_audio_bytes) <= _INLINE_AUDIO_LIMIT_BYTES:
        inline_audio = base64.b64encode(response_audio_bytes).decode("utf-8")
    elif response_audio_bytes:
        logger.info(
            "Assistant audio omitted from inline response size=%d exceeds limit=%d",
            len(response_audio_bytes),
            _INLINE_AUDIO_LIMIT_BYTES,
        )

    logger.info(
        "chat_respond done conv_id=%s user_msg=%s assistant_msg=%s user_audio_url=%s assistant_audio_url=%s",
        conv_id,
        user_message_id,
        assistant_message_id,
        "yes" if user_audio_url else "no",
        "yes" if assistant_audio_url else "no",
    )

    return ChatResponse(
        user_input=user_input,
        response_text=response_text,
        audio_base64=inline_audio,
        audio_mime="audio/mpeg",
        user_audio_url=user_audio_url,
        assistant_audio_url=assistant_audio_url,
        conversation_id=conv_id,
    )


@router.post("/assess", response_model=AssessmentResponse)
def assess_pronunciation(
    audio_file: UploadFile = File(...),
    reference_text: str | None = Form(default=None),
    language: str | None = Form(default=None),
    user_id: str = Depends(get_current_user_id),
):
    language = _normalize_language(_enforce_max_length(language, field="language", max_chars=10))
    reference_text = _enforce_max_length(
        reference_text,
        field="reference_text",
        max_chars=_MAX_REFERENCE_TEXT_CHARS,
    )
    logger.info(
        "assess_pronunciation start user_id=%s mode=%s language=%s",
        user_id,
        "scripted" if reference_text else "unscripted",
        language,
    )

    audio_bytes = _read_and_close_upload(audio_file)

    if not audio_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Audio file is empty")
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio file exceeds 25 MB limit",
        )

    content_type = _validate_uploaded_audio(
        audio_file=audio_file,
        audio_bytes=audio_bytes,
        allowed_content_types=_SUPPORTED_AUDIO_CONTENT_TYPES,
        endpoint_label="Assessment",
    )
    logger.info("Assessment audio accepted content_type=%s size=%d", content_type, len(audio_bytes))

    try:
        service = get_assessment_service()
    except ValueError as exc:
        logger.error("AzureAssessmentService misconfigured: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pronunciation assessment service is not available",
        ) from exc

    try:
        result = service.assess(
            audio_bytes=audio_bytes,
            reference_text=reference_text,
            language=language,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("AzureAssessment failed user_id=%s error=%s", user_id, exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    pron = result.get("PronunciationAssessment", {})
    try:
        words = [
            WordResult(
                word=w.get("Word", ""),
                accuracy_score=w.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0),
                error_type=w.get("PronunciationAssessment", {}).get("ErrorType", "None"),
                syllables=[
                    SyllableResult(
                        syllable=s.get("Syllable", ""),
                        accuracy_score=s.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0),
                    )
                    for s in (w.get("Syllables") or [])
                ],
                phonemes=[
                    PhonemeResult(
                        phoneme=p.get("Phoneme", ""),
                        accuracy_score=p.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0),
                    )
                    for p in (w.get("Phonemes") or [])
                ],
            )
            for w in result.get("Words", [])
        ]

        logger.info(
            "assess_pronunciation done user_id=%s mode=%s pron_score=%s recognized_length=%d",
            user_id,
            result.get("mode"),
            pron.get("PronScore"),
            len(result.get("display_text", "")),
        )

        return AssessmentResponse(
            mode=result.get("mode", "unscripted"),
            recognized_text=result.get("display_text", ""),
            pron_score=pron.get("PronScore", 0.0),
            accuracy_score=pron.get("AccuracyScore", 0.0),
            fluency_score=pron.get("FluencyScore", 0.0),
            completeness_score=pron.get("CompletenessScore"),
            prosody_score=pron.get("ProsodyScore"),
            words=words,
        )
    except ValidationError as exc:
        logger.error("AzureAssessment schema validation failed user_id=%s error=%s", user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Azure returned an unrecognised response format",
        ) from exc


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

    logger.info("list_conversations user_id=%s returned=%d", user_id, len(rows))
    conversations = [
        ConversationOut(id=row[0], title=row[1], status=row[2], started_at=row[3], ended_at=row[4], topic_id=row[5])
        for row in rows
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
                logger.warning("Conversation not found conversation_id=%s user_id=%s", conversation_id, user_id)
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
    presign_ok = 0
    presign_fail = 0
    for msg_id, role, input_mode, text_content, created_at, storage_key in rows:
        audio_url: str | None = None
        if storage_key:
            try:
                audio_url = get_presigned_url(storage_key)
                presign_ok += 1
            except Exception:
                logger.exception("Failed to generate presigned URL for key=%s", storage_key)
                presign_fail += 1

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

    if presign_fail:
        logger.warning("Presigned URL generation ok=%d failed=%d conversation_id=%s", presign_ok, presign_fail, conversation_id)

    return ConversationMessagesResponse(conversation_id=conversation_id, messages=messages)
