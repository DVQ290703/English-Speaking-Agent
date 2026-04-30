from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api._validators import _validate_uuid
from app.api.schemas import (
    ConversationListResponse,
    ConversationMessagesResponse,
    ConversationOut,
    MessageOut,
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
