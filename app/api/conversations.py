from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.api._validators import _validate_uuid
from app.api.schemas import (
    ConversationListResponse,
    ConversationMessagesResponse,
    ConversationOut,
    ConversationScoresOut,
    ConversationStatOut,
    ConversationStatsResponse,
    ConversationWithScoresResponse,
    ForTopicConversationOut,
    ForTopicResponse,
    MessageOut,
    MessageScoreOut,
    MessageWithScoreOut,
    PhonemeDetail,
    WordDetail,
)
from app.core.database import get_connection
from app.core.logger import logger
from app.core.security import get_current_user_id
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


@router.get("/for-topic", response_model=ForTopicResponse)
def get_conversations_for_topic(
    topic_code: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return up to 5 non-deleted conversations for a topic, latest-first, with session numbers and limit flag."""
    logger.debug("get_conversations_for_topic user_id=%s topic_code=%s", user_id, topic_code)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id::text, title FROM topics WHERE code = %s LIMIT 1",
                (topic_code.strip().lower(),),
            )
            topic_row = cur.fetchone()
            if not topic_row:
                logger.warning("get_conversations_for_topic unknown topic_code=%s user_id=%s", topic_code, user_id)
                return ForTopicResponse(
                    topic_code=topic_code.strip().lower(),
                    topic_title=topic_code,
                    conversations=[],
                    total=0,
                    limit_reached=False,
                )
            topic_id, topic_title = topic_row

            cur.execute(
                """
                SELECT COUNT(*)
                FROM conversations
                WHERE user_id = %s AND topic_id = %s AND deleted_at IS NULL
                """,
                (user_id, topic_id),
            )
            total = cur.fetchone()[0]

            cur.execute(
                """
                SELECT
                    c.id::text,
                    c.title,
                    c.status,
                    c.started_at,
                    c.updated_at,
                    (
                        SELECT COUNT(*) FROM conversations c2
                        WHERE c2.topic_id = c.topic_id
                          AND c2.user_id = c.user_id
                          AND c2.started_at <= c.started_at
                    ) AS session_number
                FROM conversations c
                WHERE c.user_id = %s
                  AND c.topic_id = %s
                  AND c.deleted_at IS NULL
                ORDER BY c.started_at DESC
                LIMIT 5
                """,
                (user_id, topic_id),
            )
            rows = cur.fetchall()

    conversations = [
        ForTopicConversationOut(
            id=row[0],
            title=row[1],
            status=row[2],
            started_at=row[3],
            updated_at=row[4],
            session_number=row[5],
        )
        for row in rows
    ]
    logger.info(
        "get_conversations_for_topic user_id=%s topic_code=%s returned=%d",
        user_id, topic_code, len(conversations),
    )
    return ForTopicResponse(
        topic_code=topic_code.strip().lower(),
        topic_title=topic_title,
        conversations=conversations,
        total=total,
        limit_reached=total >= 5,
    )


@router.get("/stats", response_model=ConversationStatsResponse)
def get_conversation_stats(user_id: str = Depends(get_current_user_id)):
    """Return per-conversation stats (scores, duration, message count) for the dashboard, latest 200."""
    logger.debug("get_conversation_stats user_id=%s", user_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    c.id::text,
                    COALESCE(c.title, t.title, t.code, 'General') AS topic,
                    t.code AS topic_code,
                    c.started_at,
                    CASE
                        WHEN c.ended_at IS NOT NULL
                        THEN EXTRACT(EPOCH FROM (c.ended_at - c.started_at)) * 1000
                        ELSE NULL
                    END AS duration_ms,
                    AVG(pa.overall_score)
                        FILTER (WHERE m.role = 'user' AND pa.overall_score IS NOT NULL)
                        AS avg_score,
                    AVG(pa.accuracy_score)
                        FILTER (WHERE m.role = 'user' AND pa.accuracy_score IS NOT NULL)
                        AS avg_accuracy,
                    AVG(pa.fluency_score)
                        FILTER (WHERE m.role = 'user' AND pa.fluency_score IS NOT NULL)
                        AS avg_fluency,
                    AVG(pa.prosody_score)
                        FILTER (WHERE m.role = 'user' AND pa.prosody_score IS NOT NULL)
                        AS avg_prosody,
                    COUNT(m.id) FILTER (WHERE m.role = 'user') AS user_message_count
                FROM conversations c
                LEFT JOIN topics t ON t.id = c.topic_id
                LEFT JOIN messages m ON m.conversation_id = c.id
                LEFT JOIN pronunciation_assessments pa ON pa.message_id = m.id
                WHERE c.user_id = %s
                  AND c.deleted_at IS NULL
                  AND c.topic_id IS NOT NULL
                GROUP BY c.id, t.title, t.code, c.started_at, c.ended_at
                ORDER BY c.started_at DESC
                LIMIT 200
                """,
                (user_id,),
            )
            rows = cur.fetchall()

    sessions: list[ConversationStatOut] = []
    for (conv_id, topic, topic_code, started_at, duration_ms,
         avg_score, avg_accuracy, avg_fluency, avg_prosody,
         user_message_count) in rows:

        scores: ConversationScoresOut | None = None
        if avg_score is not None or avg_accuracy is not None or avg_fluency is not None:
            scores = ConversationScoresOut(
                pronunciation=round(avg_prosody, 1) if avg_prosody is not None else None,
                fluency=round(avg_fluency, 1) if avg_fluency is not None else None,
                accuracy=round(avg_accuracy, 1) if avg_accuracy is not None else None,
            )

        sessions.append(ConversationStatOut(
            id=conv_id,
            topic=topic,
            topic_code=topic_code,
            started_at=started_at,
            duration_ms=duration_ms,
            avg_score=round(avg_score, 1) if avg_score is not None else None,
            user_message_count=int(user_message_count or 0),
            scores=scores,
        ))

    logger.info("get_conversation_stats user_id=%s returned=%d", user_id, len(sessions))
    return ConversationStatsResponse(sessions=sessions)


# @router.get("/{conversation_id}/messages", response_model=ConversationMessagesResponse)
# def get_conversation_messages(
#     conversation_id: str,
#     user_id: str = Depends(get_current_user_id),
# ):
#     """Return visible messages for a conversation (post-cleared_at only), oldest-first, with audio URLs."""
#     logger.info("get_conversation_messages conversation_id=%s user_id=%s", conversation_id, user_id)
#     _validate_uuid(conversation_id, "conversation_id")

#     with get_connection() as conn:
#         with conn.cursor() as cur:
#             cur.execute(
#                 "SELECT id FROM conversations WHERE id = %s AND user_id = %s LIMIT 1",
#                 (conversation_id, user_id),
#             )
#             if not cur.fetchone():
#                 logger.warning("Conversation not found conversation_id=%s user_id=%s", conversation_id, user_id)
#                 raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

#             cur.execute(
#                 """
#                 SELECT
#                     m.id::text,
#                     m.role,
#                     m.input_mode,
#                     m.text_content,
#                     m.created_at,
#                     aa.storage_key
#                 FROM messages m
#                 JOIN conversations c ON c.id = m.conversation_id
#                 LEFT JOIN audio_assets aa ON aa.message_id = m.id
#                 WHERE m.conversation_id = %s
#                   AND (c.cleared_at IS NULL OR m.created_at > c.cleared_at)
#                 ORDER BY m.created_at ASC
#                 """,
#                 (conversation_id,),
#             )
#             rows = cur.fetchall()

#     messages: list[MessageOut] = []
#     for msg_id, role, input_mode, text_content, created_at, storage_key in rows:
#         audio_url: str | None = None
#         if storage_key:
#             audio_url = f"/api/audio/{storage_key}"

#         messages.append(
#             MessageOut(
#                 id=msg_id,
#                 role=role,
#                 input_mode=input_mode,
#                 text_content=text_content,
#                 created_at=created_at,
#                 audio_url=audio_url,
#             )
#         )

#     return ConversationMessagesResponse(conversation_id=conversation_id, messages=messages)


@router.post("/{conversation_id}/clear", status_code=status.HTTP_204_NO_CONTENT)
def clear_conversation_history(
    conversation_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
):
    """Hide all prior messages by setting cleared_at = NOW(). Data is retained; returns 204."""
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


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
):
    """Soft-delete a conversation (sets deleted_at). Frees up the per-topic session slot; data is retained."""
    conv_id_str = str(conversation_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE conversations
                SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = %s AND user_id = %s AND deleted_at IS NULL
                RETURNING id::text
                """,
                (conv_id_str, user_id),
            )
            if not cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Conversation not found",
                )
    logger.info("delete_conversation conversation_id=%s user_id=%s", conv_id_str, user_id)


@router.patch("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def update_conversation(
    conversation_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
):
    """
    Mark a conversation as finished by setting ended_at = NOW().
    This enables duration calculation for dashboard statistics.
    """
    conv_id_str = str(conversation_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE conversations
                SET ended_at = NOW(), updated_at = NOW()
                WHERE id = %s AND user_id = %s AND ended_at IS NULL
                RETURNING id::text
                """,
                (conv_id_str, user_id),
            )
            # If no row returned, it either doesn't exist or already has ended_at.
            # We don't error out if it already has ended_at (idempotent).
    logger.info("update_conversation (ended_at) conversation_id=%s user_id=%s", conv_id_str, user_id)


@router.get("/{conversation_id}/messages-with-scores", response_model=ConversationWithScoresResponse)
def get_conversation_messages_with_scores(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return visible messages with embedded pronunciation scores and word/phoneme breakdowns."""
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
                    ua.storage_key,
                    aa_tts.storage_key AS assistant_storage_key,
                    pa.overall_score,
                    pa.accuracy_score,
                    pa.fluency_score,
                    pa.completeness_score,
                    pa.prosody_score,
                    pa.id::text AS assessment_id
                FROM messages m
                JOIN conversations c ON c.id = m.conversation_id
                LEFT JOIN audio_assets ua
                    ON ua.message_id = m.id AND ua.audio_type = 'user_input'
                LEFT JOIN audio_assets aa_tts
                    ON aa_tts.message_id = m.id AND aa_tts.audio_type = 'assistant_tts'
                LEFT JOIN pronunciation_assessments pa ON pa.message_id = m.id
                WHERE m.conversation_id = %s
                  AND (c.cleared_at IS NULL OR m.created_at > c.cleared_at)
                ORDER BY m.created_at ASC
                """,
                (conversation_id,),
            )
            msg_rows = cur.fetchall()

            # batch-fetch all word details (one query, not N+1)
            assessment_ids = [row[12] for row in msg_rows if row[12] is not None]
            word_map: dict[str, list[WordDetail]] = {}
            # key: word_detail DB id (uuid text) → list of PhonemeDetail
            phoneme_map: dict[str, list[PhonemeDetail]] = {}
            if assessment_ids:
                cur.execute(
                    """
                    SELECT wd.id::text, wd.assessment_id::text, wd.word_index, wd.word,
                           wd.accuracy_score, wd.error_type,
                           (wd.offset_ticks / 10000)::int   AS start_ms,
                           (wd.duration_ticks / 10000)::int AS duration_ms
                    FROM pronunciation_word_details wd
                    WHERE wd.assessment_id = ANY(%s::uuid[])
                    ORDER BY wd.assessment_id, wd.word_index
                    """,
                    (assessment_ids,),
                )
                word_rows = cur.fetchall()
                word_detail_ids = [r[0] for r in word_rows]

                if word_detail_ids:
                    cur.execute(
                        """
                        SELECT word_detail_id::text, phoneme_index, phoneme, accuracy_score
                        FROM pronunciation_phoneme_details
                        WHERE word_detail_id = ANY(%s::uuid[])
                        ORDER BY word_detail_id, phoneme_index
                        """,
                        (word_detail_ids,),
                    )
                    for wd_id, p_idx, phoneme, p_acc in cur.fetchall():
                        phoneme_map.setdefault(wd_id, []).append(
                            PhonemeDetail(phoneme=phoneme, accuracy_score=p_acc)
                        )

                for wd_id, a_id, wi, w, acc, err, s_ms, d_ms in word_rows:
                    word_map.setdefault(a_id, []).append(
                        WordDetail(
                            word_index=wi, word=w,
                            accuracy_score=acc, error_type=err,
                            start_ms=s_ms, duration_ms=d_ms,
                            phonemes=phoneme_map.get(wd_id, []),
                        )
                    )

    messages: list[MessageWithScoreOut] = []
    for (msg_id, role, input_mode, text_content, created_at,
         storage_key, assistant_storage_key, overall, accuracy, fluency, completeness,
         prosody, assessment_id) in msg_rows:

        audio_url: str | None = None
        if storage_key:
            audio_url = f"/api/audio/{storage_key}"

        assistant_audio_url: str | None = None
        if assistant_storage_key:
            assistant_audio_url = f"/api/audio/{assistant_storage_key}"

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
                assistant_audio_url=assistant_audio_url,
                score=score,
            )
        )

    logger.info(
        "get_conversation_messages_with_scores conversation_id=%s messages=%d",
        conversation_id, len(messages),
    )
    return ConversationWithScoresResponse(conversation_id=conversation_id, messages=messages)
