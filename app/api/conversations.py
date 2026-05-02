from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.api._validators import _validate_uuid
from app.api.schemas import (
    ConversationListResponse,
    ConversationMessagesResponse,
    ConversationOut,
    ConversationWithScoresResponse,
    MessageOut,
    MessageScoreOut,
    MessageWithScoreOut,
    WordDetail,
)
from app.core.database import get_connection
from app.core.logger import logger
from app.core.security import get_current_user_id
from app.core.storage import get_presigned_url

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=ConversationListResponse)
def list_conversations(user_id: str = Depends(get_current_user_id)):
    logger.debug("list_conversations user_id=%s", user_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    c.id::text,
                    c.title,
                    c.status,
                    c.started_at,
                    c.ended_at,
                    c.topic_id::text,
                    c.cleared_at,
                    t.code AS topic_code
                FROM conversations c
                LEFT JOIN topics t ON t.id = c.topic_id
                WHERE c.user_id = %s
                  AND c.deleted_at IS NULL
                ORDER BY c.started_at DESC
                LIMIT 100
                """,
                (user_id,),
            )
            rows = cur.fetchall()

    logger.info("list_conversations user_id=%s returned=%d", user_id, len(rows))
    conversations = [
        ConversationOut(
            id=row[0], title=row[1], status=row[2],
            started_at=row[3], ended_at=row[4], topic_id=row[5],
            cleared_at=row[6], topic_code=row[7],
        )
        for row in rows
    ]
    return ConversationListResponse(conversations=conversations)


@router.get("/{conversation_id}/messages", response_model=ConversationMessagesResponse)
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
                JOIN conversations c ON c.id = m.conversation_id
                LEFT JOIN audio_assets aa ON aa.message_id = m.id
                WHERE m.conversation_id = %s
                  AND (c.cleared_at IS NULL OR m.created_at > c.cleared_at)
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


@router.post("/{conversation_id}/clear", status_code=status.HTTP_204_NO_CONTENT)
def clear_conversation_history(
    conversation_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
):
    """Set cleared_at = NOW() — hides prior messages from user but retains data in DB."""
    conv_id_str = str(conversation_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE conversations
                SET cleared_at = NOW(), updated_at = NOW()
                WHERE id = %s AND user_id = %s
                RETURNING id::text
                """,
                (conv_id_str, user_id),
            )
            if not cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Conversation not found",
                )
    logger.info("clear_conversation_history conversation_id=%s user_id=%s", conv_id_str, user_id)


@router.get("/{conversation_id}/messages-with-scores", response_model=ConversationWithScoresResponse)
def get_conversation_messages_with_scores(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return messages with embedded pronunciation scores and word-level details."""
    _validate_uuid(conversation_id, "conversation_id")

    with get_connection() as conn:
        with conn.cursor() as cur:
            # ownership check
            cur.execute(
                "SELECT id FROM conversations WHERE id = %s AND user_id = %s LIMIT 1",
                (conversation_id, user_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

            # messages + scores (single LEFT JOIN query)
            cur.execute(
                """
                SELECT
                    m.id::text,
                    m.role,
                    m.input_mode,
                    m.text_content,
                    m.created_at,
                    aa.storage_key,
                    pa.overall_score,
                    pa.accuracy_score,
                    pa.fluency_score,
                    pa.completeness_score,
                    pa.prosody_score,
                    pa.id::text AS assessment_id
                FROM messages m
                JOIN conversations c ON c.id = m.conversation_id
                LEFT JOIN audio_assets aa
                    ON aa.message_id = m.id AND aa.audio_type = 'user_input'
                LEFT JOIN pronunciation_assessments pa ON pa.message_id = m.id
                WHERE m.conversation_id = %s
                  AND (c.cleared_at IS NULL OR m.created_at > c.cleared_at)
                ORDER BY m.created_at ASC
                """,
                (conversation_id,),
            )
            msg_rows = cur.fetchall()

            # batch-fetch all word details (one query, not N+1)
            assessment_ids = [row[11] for row in msg_rows if row[11] is not None]
            word_map: dict[str, list[WordDetail]] = {}
            if assessment_ids:
                cur.execute(
                    """
                    SELECT assessment_id::text, word_index, word,
                           accuracy_score, error_type, start_ms, duration_ms
                    FROM pronunciation_word_details
                    WHERE assessment_id = ANY(%s)
                    ORDER BY assessment_id, word_index
                    """,
                    (assessment_ids,),
                )
                for a_id, wi, w, acc, err, s_ms, d_ms in cur.fetchall():
                    word_map.setdefault(a_id, []).append(
                        WordDetail(
                            word_index=wi, word=w,
                            accuracy_score=acc, error_type=err,
                            start_ms=s_ms, duration_ms=d_ms,
                        )
                    )

    messages: list[MessageWithScoreOut] = []
    for (msg_id, role, input_mode, text_content, created_at,
         storage_key, overall, accuracy, fluency, completeness,
         prosody, assessment_id) in msg_rows:

        audio_url: str | None = None
        if storage_key:
            try:
                audio_url = get_presigned_url(storage_key)
            except Exception:
                logger.exception("Failed to generate presigned URL for key=%s", storage_key)

        score: MessageScoreOut | None = None
        if assessment_id is not None:
            score = MessageScoreOut(
                overall_score=overall,
                accuracy_score=accuracy,
                fluency_score=fluency,
                completeness_score=completeness,
                prosody_score=prosody,
                words=word_map.get(assessment_id, []),
            )

        messages.append(
            MessageWithScoreOut(
                id=msg_id,
                role=role,
                input_mode=input_mode,
                text_content=text_content,
                created_at=created_at,
                audio_url=audio_url,
                score=score,
            )
        )

    logger.info(
        "get_conversation_messages_with_scores conversation_id=%s messages=%d",
        conversation_id, len(messages),
    )
    return ConversationWithScoresResponse(conversation_id=conversation_id, messages=messages)
