"""GET /api/grammar/{message_id} — retrieve full grammar feedback for a user message."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user_id
from app.api.schemas import GrammarDetailResponse, GrammarErrorDetail
from app.core.database import get_connection
from app.core.logger import logger

router = APIRouter(prefix="/grammar", tags=["grammar"])


@router.get("/detail_grammar_fb/{message_id}", response_model=GrammarDetailResponse)
def get_grammar_detail(
    message_id: str,
    user_id: str = Depends(get_current_user_id),
) -> GrammarDetailResponse:
    """Return grammar errors, corrections, and overall score for a user message. Raises 404 if not found or not owned."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT gf.user_input, gf.errors, gf.corrected_sentence, gf.overall_score
                FROM grammar_feedback gf
                JOIN messages m ON m.id = gf.message_id
                JOIN conversations c ON c.id = m.conversation_id
                WHERE gf.message_id = %s AND c.user_id = %s
                """,
                (message_id, user_id),
            )
            row = cur.fetchone()

    if row is None:
        logger.info("get_grammar_detail not found message_id=%s user_id=%s", message_id, user_id)
        raise HTTPException(status_code=404, detail="Grammar feedback not found")

    user_input, errors_raw, corrected_sentence, overall_score = row
    errors = [
        GrammarErrorDetail(id=i + 1, **e)
        for i, e in enumerate(errors_raw or [])
    ]
    return GrammarDetailResponse(
        message_id=message_id,
        user_input=user_input,
        errors=errors,
        corrected_sentence=corrected_sentence,
        overall_score=overall_score if overall_score is not None else 100,
    )
