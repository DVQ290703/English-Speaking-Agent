from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel

from app.core import settings
from app.core.database import get_connection

router = APIRouter(prefix="/api/admin/hitl", tags=["hitl-review"])


def _require_admin(x_admin_key: str = Header(...)) -> None:
    if not settings.ADMIN_API_KEY or x_admin_key != settings.ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing admin key",
        )


class ReviewRequest(BaseModel):
    reviewer_notes: str = ""


@router.get("/queue")
def list_queue(
    status_filter: str = "pending",
    _: None = Depends(_require_admin),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, conversation_id::text, message_id::text,
                       user_input, response_text, flags, status, created_at
                FROM hitl_queue
                WHERE status = %s
                ORDER BY created_at DESC
                LIMIT 100
                """,
                (status_filter,),
            )
            rows = cur.fetchall()
    return {
        "items": [
            {
                "id": r[0],
                "conversation_id": r[1],
                "message_id": r[2],
                "user_input": r[3],
                "response_text": r[4],
                "flags": r[5],
                "status": r[6],
                "created_at": r[7].isoformat(),
            }
            for r in rows
        ]
    }


@router.post("/{item_id}/review")
def review_item(
    item_id: str,
    payload: ReviewRequest,
    _: None = Depends(_require_admin),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE hitl_queue
                SET status = 'reviewed', reviewer_notes = %s, reviewed_at = NOW()
                WHERE id = %s AND status = 'pending'
                RETURNING id::text
                """,
                (payload.reviewer_notes, item_id),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found or already reviewed",
        )
    return {"id": row[0], "status": "reviewed"}


@router.post("/{item_id}/dismiss")
def dismiss_item(
    item_id: str,
    _: None = Depends(_require_admin),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE hitl_queue
                SET status = 'dismissed', reviewed_at = NOW()
                WHERE id = %s AND status = 'pending'
                RETURNING id::text
                """,
                (item_id,),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found or already reviewed",
        )
    return {"id": row[0], "status": "dismissed"}
