from __future__ import annotations

import base64
import time as _time
import uuid as _uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.api._audio import (
    _CHAT_AUDIO_CONTENT_TYPES,
    _MAX_AUDIO_BYTES,
    _read_and_close_upload,
    _validate_uploaded_audio,
)
from app.api._validators import _enforce_max_length, _validate_uuid
from app.api.schemas import ChatResponse
from app.core.ai_services import (
    _synthesize_audio_bytes,
    run_langraph_agent,
    transcribe_audio,
)
from app.core.database import get_connection
from app.core.logger import logger
from app.core.security import get_current_user_id
from app.core.storage import _upload, build_object_key, get_presigned_url, store_user_audio
from app.guardrails.audit.logger import AuditLogger
from app.guardrails.exceptions import GuardrailException
from app.guardrails.input import InputGuardrails
from app.guardrails.output import OutputGuardrails

router = APIRouter(prefix="/chat", tags=["chat"])

_MAX_TEXT_CHARS = 4_000
_MAX_HISTORY_CHARS = 50_000
_MAX_TOPIC_CHARS = 80
_MAX_SUB_OPTION_CHARS = 120
_INLINE_AUDIO_LIMIT_BYTES = 512 * 1024

_input_guardrails = InputGuardrails()
_output_guardrails = OutputGuardrails()
_audit_logger = AuditLogger()

_GUARDRAIL_HTTP_STATUS: dict[str, int] = {
    "INPUT_INVALID": status.HTTP_400_BAD_REQUEST,
    "INPUT_TOO_LONG": status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
    "RATE_LIMITED": status.HTTP_429_TOO_MANY_REQUESTS,
    "INJECTION_DETECTED": status.HTTP_400_BAD_REQUEST,
    "TOPIC_BLOCKED": status.HTTP_400_BAD_REQUEST,
}


def _fetch_visible_history(cur, conv_id: str, limit: int = 20) -> list[dict]:
    """
    Return the last `limit` visible (post-cleared_at) user+assistant turns
    for the given conversation, oldest-first, ready for the LLM context.
    Returns empty list if conv_id is None or no messages found.
    """
    if not conv_id:
        return []
    cur.execute(
        """
        SELECT m.role, m.text_content
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.conversation_id = %s
          AND m.role IN ('user', 'assistant')
          AND m.text_content IS NOT NULL
          AND (c.cleared_at IS NULL OR m.created_at > c.cleared_at)
        ORDER BY m.created_at DESC
        LIMIT %s
        """,
        (conv_id, limit),
    )
    rows = cur.fetchall()
    return [{"role": row[0], "content": row[1]} for row in reversed(rows)]


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


@router.post("/respond", response_model=ChatResponse)
def chat_respond(
    text: str | None = Form(default=None),
    topic: str | None = Form(default=None),
    sub_option: str | None = Form(default=None),
    voice_gender: str | None = Form(default=None),
    audio_file: UploadFile | None = File(default=None),
    conversation_id: str | None = Form(default=None),
    user_id: str = Depends(get_current_user_id),
):
    input_mode = "audio" if audio_file else "text"
    logger.info("chat_respond start user_id=%s input_mode=%s conversation_id=%s", user_id, input_mode, conversation_id)

    text = _enforce_max_length(text, field="text", max_chars=_MAX_TEXT_CHARS)
    topic = _enforce_max_length(topic, field="topic", max_chars=_MAX_TOPIC_CHARS)
    sub_option = _enforce_max_length(sub_option, field="sub_option", max_chars=_MAX_SUB_OPTION_CHARS)

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

    # ── Guardrails: Input ──────────────────────────────────────────────────
    _guardrail_start = _time.time()
    _guardrail_decisions: dict = {}
    _all_flags: list[str] = []

    try:
        user_input = _input_guardrails.check(user_input, user_id)
        _guardrail_decisions.update({
            "input_valid": True,
            "rate_limited": False,
            "injection_detected": False,
            "topic_blocked": False,
        })
    except GuardrailException as exc:
        logger.warning(
            "input_guardrail_block code=%s reason=%s user_id=%s",
            exc.code,
            exc.reason,
            user_id,
        )
        http_status = _GUARDRAIL_HTTP_STATUS.get(exc.code, status.HTTP_400_BAD_REQUEST)
        extra_headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
        raise HTTPException(
            status_code=http_status,
            detail=exc.reason,
            headers=extra_headers,
        )
    # ── End Input Guardrails ───────────────────────────────────────────────

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

            # Server-side history — replaces client-owned history field
            conversation_history = _fetch_visible_history(cur, conv_id)

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

    logger.info(
        "Running LLM+TTS pipeline user_input_length=%d history_lines=%d",
        len(user_input),
        len(conversation_history),
    )
    response_text, response_audio_bytes = run_langraph_agent(
        user_input=user_input,
        history=conversation_history,
        voice_gender=voice_gender,
    )

    # ── Guardrails: Output ─────────────────────────────────────────────────
    output_result = _output_guardrails.check(response_text)
    if output_result.text != response_text:
        response_audio_bytes = _synthesize_audio_bytes(output_result.text, voice_gender=voice_gender)
    response_text = output_result.text
    _all_flags.extend(output_result.flags)
    _guardrail_decisions["output_pii_redacted"] = "contains_pii" in _all_flags
    # ── End Output Guardrails ──────────────────────────────────────────────

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

    # ── Audit Logging ──────────────────────────────────────────────────────
    _audit_logger.log(
        user_id=user_id,
        conversation_id=conv_id,
        user_input=user_input,
        response_text=response_text,
        guardrail_decisions=_guardrail_decisions,
        flags=_all_flags,
        start_time=_guardrail_start,
    )
    # ── End Guardrails ─────────────────────────────────────────────────────

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
