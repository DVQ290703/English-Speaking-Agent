from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.api.schemas import (
    CardCreate, CardOut, CardUpdate,
    DeckCreate, DeckOut, DeckStatsOut, DeckUpdate,
    DueCardOut, MediaOut, ReviewStateOut, ReviewSubmit,
)
from app.core.database import get_connection
from app.core.logger import logger
from app.core.security import get_current_user_id
from app.core.storage import _upload, delete_object, get_presigned_url
from app.services.flashcard_service import calculate_sm2

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fetch_media(cur, card_id: str) -> list[MediaOut]:
    """Fetch all media for a card, generating presigned URLs for MinIO-backed items."""
    cur.execute(
        """
        SELECT id::text, side, media_type, storage_key, public_url, mime_type
        FROM flashcard_media
        WHERE card_id = %s
        ORDER BY created_at
        """,
        (card_id,),
    )
    rows = cur.fetchall()
    logger.debug("_fetch_media card_id=%s found=%d", card_id, len(rows))
    result = []
    for mid, side, mtype, storage_key, public_url, mime_type in rows:
        url = public_url
        if storage_key and not url:
            try:
                url = get_presigned_url(storage_key, expires=timedelta(hours=1))
                logger.debug("_fetch_media presigned url generated key=%s", storage_key)
            except Exception:
                logger.warning("_fetch_media presigned url failed key=%s", storage_key)
                url = None
        result.append(MediaOut(id=mid, side=side, media_type=mtype, public_url=url, mime_type=mime_type))
    return result


# ── Decks ─────────────────────────────────────────────────────────────────────

@router.get("/decks", response_model=list[DeckOut], name="list_decks")
def list_decks(user_id: str = Depends(get_current_user_id)):
    """Return all active decks for the current user with card count and due count."""
    logger.debug("list_decks user_id=%s", user_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    d.id::text,
                    d.name,
                    d.description,
                    COUNT(c.id) FILTER (WHERE c.is_active) AS card_count,
                    COUNT(r.id) FILTER (WHERE r.due_date <= CURRENT_DATE) AS due_count,
                    d.created_at
                FROM flashcard_decks d
                LEFT JOIN flashcards c ON c.deck_id = d.id
                LEFT JOIN flashcard_reviews r ON r.card_id = c.id AND r.user_id = %s
                WHERE d.user_id = %s AND d.is_active = TRUE
                GROUP BY d.id, d.name, d.description, d.created_at
                ORDER BY d.created_at DESC
                """,
                (user_id, user_id),
            )
            rows = cur.fetchall()
    logger.debug("list_decks user_id=%s returned=%d", user_id, len(rows))
    return [
        DeckOut(id=r[0], name=r[1], description=r[2], card_count=r[3] or 0, due_count=r[4] or 0, created_at=r[5])
        for r in rows
    ]


@router.post("/decks", response_model=DeckOut, status_code=status.HTTP_201_CREATED, name="create_deck")
def create_deck(payload: DeckCreate, user_id: str = Depends(get_current_user_id)):
    """Create a new flashcard deck for the current user."""
    logger.debug("create_deck user_id=%s name=%r", user_id, payload.name)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO flashcard_decks (user_id, name, description)
                VALUES (%s, %s, %s)
                RETURNING id::text, name, description, created_at
                """,
                (user_id, payload.name, payload.description),
            )
            row = cur.fetchone()
    logger.info("create_deck done deck_id=%s name=%r user_id=%s", row[0], row[1], user_id)
    return DeckOut(id=row[0], name=row[1], description=row[2], card_count=0, due_count=0, created_at=row[3])


@router.get("/decks/{deck_id}", response_model=DeckOut, name="get_deck")
def get_deck(deck_id: str, user_id: str = Depends(get_current_user_id)):
    """Fetch a single deck by ID with live card and due counts."""
    logger.debug("get_deck deck_id=%s user_id=%s", deck_id, user_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    d.id::text, d.name, d.description,
                    COUNT(c.id) FILTER (WHERE c.is_active),
                    COUNT(r.id) FILTER (WHERE r.due_date <= CURRENT_DATE),
                    d.created_at
                FROM flashcard_decks d
                LEFT JOIN flashcards c ON c.deck_id = d.id
                LEFT JOIN flashcard_reviews r ON r.card_id = c.id AND r.user_id = %s
                WHERE d.id = %s AND d.user_id = %s AND d.is_active = TRUE
                GROUP BY d.id, d.name, d.description, d.created_at
                """,
                (user_id, deck_id, user_id),
            )
            row = cur.fetchone()
    if not row:
        logger.debug("get_deck not found deck_id=%s user_id=%s", deck_id, user_id)
        raise HTTPException(status_code=404, detail="Deck not found")
    return DeckOut(id=row[0], name=row[1], description=row[2], card_count=row[3] or 0, due_count=row[4] or 0, created_at=row[5])


@router.patch("/decks/{deck_id}", response_model=DeckOut, name="update_deck")
def update_deck(deck_id: str, payload: DeckUpdate, user_id: str = Depends(get_current_user_id)):
    """Partially update a deck's name or description. Omitted fields are unchanged."""
    logger.debug("update_deck deck_id=%s user_id=%s fields=%s", deck_id, user_id, payload.model_fields_set)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE flashcard_decks
                SET name        = COALESCE(%s, name),
                    description = COALESCE(%s, description)
                WHERE id = %s AND user_id = %s AND is_active = TRUE
                RETURNING id::text, name, description, created_at
                """,
                (payload.name, payload.description, deck_id, user_id),
            )
            row = cur.fetchone()
    if not row:
        logger.debug("update_deck not found deck_id=%s user_id=%s", deck_id, user_id)
        raise HTTPException(status_code=404, detail="Deck not found")
    logger.info("update_deck done deck_id=%s", deck_id)
    return DeckOut(id=row[0], name=row[1], description=row[2], card_count=0, due_count=0, created_at=row[3])


@router.delete("/decks/{deck_id}", status_code=status.HTTP_204_NO_CONTENT, name="delete_deck")
def delete_deck(deck_id: str, user_id: str = Depends(get_current_user_id)):
    """Soft-delete a deck. All its cards are effectively hidden but not purged."""
    logger.debug("delete_deck deck_id=%s user_id=%s", deck_id, user_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE flashcard_decks SET is_active = FALSE
                WHERE id = %s AND user_id = %s AND is_active = TRUE
                """,
                (deck_id, user_id),
            )
            if cur.rowcount == 0:
                logger.debug("delete_deck not found deck_id=%s user_id=%s", deck_id, user_id)
                raise HTTPException(status_code=404, detail="Deck not found")
    logger.info("delete_deck done deck_id=%s user_id=%s", deck_id, user_id)


# ── Cards ─────────────────────────────────────────────────────────────────────
# IMPORTANT: /cards/search is defined BEFORE /cards/{card_id} to avoid route shadowing

@router.get("/cards/search", response_model=list[CardOut], name="search_cards")
def search_cards(
    q: str | None = None,
    tag: str | None = None,
    deck_id: str | None = None,
    user_id: str = Depends(get_current_user_id),
):
    """Search cards by keyword (ILIKE on front/back text) and/or tag. Returns up to 50 results."""
    logger.debug("search_cards user_id=%s q=%r tag=%r deck_id=%s", user_id, q, tag, deck_id)
    conditions = ["c.user_id = %s", "c.is_active = TRUE"]
    params: list = [user_id]

    if q:
        conditions.append("(c.front_text ILIKE %s OR c.back_text ILIKE %s)")
        params += [f"%{q}%", f"%{q}%"]
    if tag:
        conditions.append("%s = ANY(c.tags)")
        params.append(tag)
    if deck_id:
        conditions.append("c.deck_id = %s")
        params.append(deck_id)

    where = " AND ".join(conditions)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT c.id::text, c.deck_id::text, c.front_text, c.back_text, c.tags, c.created_at
                FROM flashcards c
                WHERE {where}
                ORDER BY c.created_at DESC
                LIMIT 50
                """,
                params,
            )
            rows = cur.fetchall()
            logger.debug("search_cards found=%d user_id=%s", len(rows), user_id)
            cards = []
            for row in rows:
                media = _fetch_media(cur, row[0])
                cards.append(CardOut(
                    id=row[0], deck_id=row[1], front_text=row[2],
                    back_text=row[3], tags=row[4] or [], created_at=row[5], media=media,
                ))
    return cards


@router.get("/decks/{deck_id}/cards", response_model=list[CardOut], name="list_cards")
def list_cards(
    deck_id: str,
    limit: int = 50,
    offset: int = 0,
    user_id: str = Depends(get_current_user_id),
):
    """List active cards in a deck, ordered by creation date descending. Supports pagination."""
    logger.debug("list_cards deck_id=%s user_id=%s limit=%d offset=%d", deck_id, user_id, limit, offset)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, deck_id::text, front_text, back_text, tags, created_at
                FROM flashcards
                WHERE deck_id = %s AND user_id = %s AND is_active = TRUE
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (deck_id, user_id, limit, offset),
            )
            rows = cur.fetchall()
            logger.debug("list_cards deck_id=%s returned=%d", deck_id, len(rows))
            cards = []
            for row in rows:
                media = _fetch_media(cur, row[0])
                cards.append(CardOut(
                    id=row[0], deck_id=row[1], front_text=row[2],
                    back_text=row[3], tags=row[4] or [], created_at=row[5], media=media,
                ))
    return cards


@router.post(
    "/decks/{deck_id}/cards/with-media",
    response_model=CardOut,
    status_code=status.HTTP_201_CREATED,
    name="create_card_with_media",
)
async def create_card_with_media(
    deck_id: str,
    front_text: str = Form(...),
    back_text: str = Form(...),
    tags: list[str] = Form(default=[]),
    files: list[UploadFile] = File(default=[]),
    sides: list[str] = Form(default=[]),
    media_types: list[str] = Form(default=[]),
    user_id: str = Depends(get_current_user_id),
):
    """Create a card with optional media attachments in a single multipart request.

    Send as multipart/form-data:
    - front_text, back_text, tags[] — card fields
    - files[], sides[], media_types[] — parallel arrays, one entry per file
      - sides[i]: "front" | "back"
      - media_types[i]: "image" | "audio"

    File bytes are validated and read before the DB transaction opens to avoid
    holding a connection during slow I/O. All inserts (card + media) are atomic.
    """
    logger.debug(
        "create_card_with_media deck_id=%s user_id=%s media_count=%d",
        deck_id, user_id, len(files),
    )
    if len(files) != len(sides) or len(files) != len(media_types):
        raise HTTPException(
            status_code=422,
            detail="files, sides, and media_types must have the same length",
        )
    for i, (side, mtype) in enumerate(zip(sides, media_types)):
        if side not in ("front", "back"):
            raise HTTPException(status_code=422, detail=f"sides[{i}] must be 'front' or 'back'")
        if mtype not in ("image", "audio"):
            raise HTTPException(status_code=422, detail=f"media_types[{i}] must be 'image' or 'audio'")

    # Read all file bytes up front (before opening DB connection)
    file_contents: list[tuple[bytes, str, str]] = []  # (content, mime, filename)
    for i, f in enumerate(files):
        content = await f.read()
        logger.debug("create_card_with_media file[%d] filename=%r size=%d mime=%s", i, f.filename, len(content), f.content_type)
        if len(content) > _MAX_MEDIA_BYTES:
            raise HTTPException(status_code=413, detail=f"files[{i}] exceeds 10 MB limit")
        mime = f.content_type or ""
        allowed = _ALLOWED_IMAGE_TYPES if media_types[i] == "image" else _ALLOWED_AUDIO_TYPES
        if mime not in allowed:
            raise HTTPException(status_code=415, detail=f"files[{i}] unsupported type: {mime}")
        file_contents.append((content, mime, f.filename or ""))

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM flashcard_decks WHERE id = %s AND user_id = %s AND is_active = TRUE",
                (deck_id, user_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Deck not found")

            cur.execute(
                """
                INSERT INTO flashcards (deck_id, user_id, front_text, back_text, tags)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id::text, deck_id::text, front_text, back_text, tags, created_at
                """,
                (deck_id, user_id, front_text, back_text, tags),
            )
            row = cur.fetchone()
            card_id = row[0]
            logger.debug("create_card_with_media card inserted card_id=%s", card_id)

            cur.execute(
                """
                INSERT INTO flashcard_reviews (card_id, user_id)
                VALUES (%s, %s)
                ON CONFLICT (card_id, user_id) DO NOTHING
                """,
                (card_id, user_id),
            )

            media_out: list[MediaOut] = []
            for (content, mime, filename), side, mtype in zip(file_contents, sides, media_types):
                ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
                media_id = str(uuid.uuid4())
                storage_key = f"flashcards/{card_id}/{media_id}.{ext}"
                logger.debug("create_card_with_media uploading key=%s size=%d", storage_key, len(content))
                _upload(object_key=storage_key, content=content, content_type=mime)
                cur.execute(
                    """
                    INSERT INTO flashcard_media
                        (id, card_id, side, media_type, storage_provider, storage_key, mime_type, size_bytes)
                    VALUES (%s, %s, %s, %s, 'minio', %s, %s, %s)
                    RETURNING id::text, side, media_type, public_url, mime_type
                    """,
                    (media_id, card_id, side, mtype, storage_key, mime, len(content)),
                )
                mr = cur.fetchone()
                media_out.append(MediaOut(id=mr[0], side=mr[1], media_type=mr[2], public_url=mr[3], mime_type=mr[4]))

    logger.info("create_card_with_media done card_id=%s media_count=%d", card_id, len(media_out))
    return CardOut(
        id=row[0], deck_id=row[1], front_text=row[2],
        back_text=row[3], tags=row[4] or [], created_at=row[5], media=media_out,
    )


@router.post(
    "/decks/{deck_id}/cards",
    response_model=CardOut,
    status_code=status.HTTP_201_CREATED,
    name="create_card",
)
def create_card(
    deck_id: str,
    payload: CardCreate,
    user_id: str = Depends(get_current_user_id),
):
    """Create a card with text fields only. Use create_card_with_media to attach files."""
    logger.debug("create_card deck_id=%s user_id=%s front=%r", deck_id, user_id, payload.front_text)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM flashcard_decks WHERE id = %s AND user_id = %s AND is_active = TRUE",
                (deck_id, user_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Deck not found")

            cur.execute(
                """
                INSERT INTO flashcards (deck_id, user_id, front_text, back_text, tags)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id::text, deck_id::text, front_text, back_text, tags, created_at
                """,
                (deck_id, user_id, payload.front_text, payload.back_text, payload.tags),
            )
            row = cur.fetchone()
            card_id = row[0]

            cur.execute(
                """
                INSERT INTO flashcard_reviews (card_id, user_id)
                VALUES (%s, %s)
                ON CONFLICT (card_id, user_id) DO NOTHING
                """,
                (card_id, user_id),
            )
    logger.info("create_card done card_id=%s deck_id=%s", card_id, deck_id)
    return CardOut(
        id=row[0], deck_id=row[1], front_text=row[2],
        back_text=row[3], tags=row[4] or [], created_at=row[5], media=[],
    )


@router.get("/cards/{card_id}", response_model=CardOut, name="get_card")
def get_card(card_id: str, user_id: str = Depends(get_current_user_id)):
    """Fetch a single card by ID, including all attached media with presigned URLs."""
    logger.debug("get_card card_id=%s user_id=%s", card_id, user_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, deck_id::text, front_text, back_text, tags, created_at
                FROM flashcards
                WHERE id = %s AND user_id = %s AND is_active = TRUE
                """,
                (card_id, user_id),
            )
            row = cur.fetchone()
            if not row:
                logger.debug("get_card not found card_id=%s user_id=%s", card_id, user_id)
                raise HTTPException(status_code=404, detail="Card not found")
            media = _fetch_media(cur, card_id)
    return CardOut(
        id=row[0], deck_id=row[1], front_text=row[2],
        back_text=row[3], tags=row[4] or [], created_at=row[5], media=media,
    )


@router.patch("/cards/{card_id}", response_model=CardOut, name="update_card")
def update_card(card_id: str, payload: CardUpdate, user_id: str = Depends(get_current_user_id)):
    """Partially update a card's front text, back text, or tags. Omitted fields are unchanged."""
    logger.debug("update_card card_id=%s user_id=%s fields=%s", card_id, user_id, payload.model_fields_set)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE flashcards
                SET front_text = COALESCE(%s, front_text),
                    back_text  = COALESCE(%s, back_text),
                    tags       = COALESCE(%s, tags)
                WHERE id = %s AND user_id = %s AND is_active = TRUE
                RETURNING id::text, deck_id::text, front_text, back_text, tags, created_at
                """,
                (payload.front_text, payload.back_text, payload.tags, card_id, user_id),
            )
            row = cur.fetchone()
            if not row:
                logger.debug("update_card not found card_id=%s user_id=%s", card_id, user_id)
                raise HTTPException(status_code=404, detail="Card not found")
            media = _fetch_media(cur, card_id)
    logger.info("update_card done card_id=%s", card_id)
    return CardOut(
        id=row[0], deck_id=row[1], front_text=row[2],
        back_text=row[3], tags=row[4] or [], created_at=row[5], media=media,
    )


@router.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT, name="delete_card")
def delete_card(card_id: str, user_id: str = Depends(get_current_user_id)):
    """Soft-delete a card. Its review schedule is preserved but the card is excluded from all queries."""
    logger.debug("delete_card card_id=%s user_id=%s", card_id, user_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE flashcards SET is_active = FALSE
                WHERE id = %s AND user_id = %s AND is_active = TRUE
                """,
                (card_id, user_id),
            )
            if cur.rowcount == 0:
                logger.debug("delete_card not found card_id=%s user_id=%s", card_id, user_id)
                raise HTTPException(status_code=404, detail="Card not found")
    logger.info("delete_card done card_id=%s user_id=%s", card_id, user_id)


# ── Reviews ───────────────────────────────────────────────────────────────────

@router.get("/reviews/due", response_model=list[DueCardOut], name="get_due_cards")
def get_due_cards(
    deck_id: str | None = None,
    limit: int = 20,
    user_id: str = Depends(get_current_user_id),
):
    """Return cards due for review today, ordered by due date ascending. Optionally filtered by deck."""
    logger.debug("get_due_cards user_id=%s deck_id=%s limit=%d", user_id, deck_id, limit)
    conditions = ["r.user_id = %s", "r.due_date <= CURRENT_DATE", "c.is_active = TRUE"]
    params: list = [user_id]

    if deck_id:
        conditions.append("c.deck_id = %s")
        params.append(deck_id)

    params.append(limit)
    where = " AND ".join(conditions)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT c.id::text, c.front_text, c.back_text, d.name, r.due_date
                FROM flashcard_reviews r
                JOIN flashcards c ON c.id = r.card_id
                JOIN flashcard_decks d ON d.id = c.deck_id
                WHERE {where}
                ORDER BY r.due_date ASC
                LIMIT %s
                """,
                params,
            )
            rows = cur.fetchall()
            logger.debug("get_due_cards user_id=%s found=%d", user_id, len(rows))
            cards = []
            for row in rows:
                media = _fetch_media(cur, row[0])
                cards.append(DueCardOut(
                    id=row[0], front_text=row[1], back_text=row[2],
                    deck_name=row[3], due_date=row[4], media=media,
                ))
    return cards


@router.post("/reviews/{card_id}", response_model=ReviewStateOut, name="submit_review")
def submit_review(
    card_id: str,
    payload: ReviewSubmit,
    user_id: str = Depends(get_current_user_id),
):
    """Submit a review rating for a card. Applies the SM-2 algorithm and persists the new schedule.

    Idempotent: re-submitting on the same day overwrites the previous rating.
    """
    logger.debug("submit_review card_id=%s user_id=%s rating=%s", card_id, user_id, payload.rating)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.card_id::text, r.user_id::text, r.repetitions, r.ease_factor, r.interval_days
                FROM flashcard_reviews r
                JOIN flashcards c ON c.id = r.card_id
                WHERE r.card_id = %s AND r.user_id = %s AND c.is_active = TRUE
                """,
                (card_id, user_id),
            )
            row = cur.fetchone()
            if not row:
                logger.debug("submit_review card not found card_id=%s user_id=%s", card_id, user_id)
                raise HTTPException(status_code=404, detail="Card not found or not scheduled")

            prev_rep, prev_ef, prev_interval = int(row[2]), float(row[3]), int(row[4])
            logger.debug(
                "submit_review prev state card_id=%s rep=%d ef=%.2f interval=%d",
                card_id, prev_rep, prev_ef, prev_interval,
            )

            new_rep, new_ef, new_interval, due_date = calculate_sm2(
                payload.rating, prev_rep, prev_ef, prev_interval
            )
            logger.debug(
                "submit_review new state card_id=%s rep=%d ef=%.2f interval=%d due=%s",
                card_id, new_rep, new_ef, new_interval, due_date,
            )

            cur.execute(
                """
                UPDATE flashcard_reviews
                SET repetitions      = %s,
                    ease_factor      = %s,
                    interval_days    = %s,
                    due_date         = %s,
                    last_rating      = %s,
                    last_reviewed_at = NOW()
                WHERE card_id = %s AND user_id = %s
                """,
                (new_rep, new_ef, new_interval, due_date, payload.rating, card_id, user_id),
            )

    logger.info("submit_review done card_id=%s rating=%s new_interval=%d due=%s", card_id, payload.rating, new_interval, due_date)
    return ReviewStateOut(
        card_id=card_id,
        due_date=due_date,
        interval_days=new_interval,
        ease_factor=new_ef,
        repetitions=new_rep,
    )


@router.get("/decks/{deck_id}/stats", response_model=DeckStatsOut, name="get_deck_stats")
def get_deck_stats(deck_id: str, user_id: str = Depends(get_current_user_id)):
    """Return aggregate stats for a deck: total cards, due today, learned, and 30-day retention rate."""
    logger.debug("get_deck_stats deck_id=%s user_id=%s", deck_id, user_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COUNT(c.id) FILTER (WHERE c.is_active)                                           AS total_cards,
                    COUNT(r.id) FILTER (WHERE r.due_date <= CURRENT_DATE)                            AS due_today,
                    COUNT(r.id) FILTER (WHERE r.repetitions > 0)                                     AS learned,
                    COALESCE(
                        COUNT(r.id) FILTER (
                            WHERE r.last_rating IN ('good','easy')
                            AND r.last_reviewed_at >= NOW() - INTERVAL '30 days'
                        )::float
                        / NULLIF(COUNT(r.id) FILTER (
                            WHERE r.last_reviewed_at >= NOW() - INTERVAL '30 days'
                        ), 0),
                        0
                    ) AS retention_rate
                FROM flashcard_decks d
                LEFT JOIN flashcards c ON c.deck_id = d.id
                LEFT JOIN flashcard_reviews r ON r.card_id = c.id AND r.user_id = %s
                WHERE d.id = %s AND d.user_id = %s AND d.is_active = TRUE
                """,
                (user_id, deck_id, user_id),
            )
            row = cur.fetchone()
    if not row or row[0] is None:
        logger.debug("get_deck_stats deck not found deck_id=%s user_id=%s", deck_id, user_id)
        raise HTTPException(status_code=404, detail="Deck not found")
    logger.debug(
        "get_deck_stats deck_id=%s total=%d due=%d learned=%d retention=%.2f",
        deck_id, row[0] or 0, row[1] or 0, row[2] or 0, row[3] or 0,
    )
    return DeckStatsOut(
        total_cards=row[0] or 0,
        due_today=row[1] or 0,
        learned=row[2] or 0,
        retention_rate=float(row[3] or 0),
    )


# ── Media ─────────────────────────────────────────────────────────────────────

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_ALLOWED_AUDIO_TYPES = {"audio/mpeg", "audio/mp4", "audio/webm", "audio/ogg", "audio/wav"}
_MAX_MEDIA_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post(
    "/cards/{card_id}/media",
    response_model=MediaOut,
    status_code=status.HTTP_201_CREATED,
    name="upload_card_media",
)
async def upload_card_media(
    card_id: str,
    side: str = Form(...),
    media_type: str = Form(...),
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Upload a single image or audio file and attach it to a card side (front or back)."""
    logger.debug("upload_card_media card_id=%s user_id=%s side=%s type=%s", card_id, user_id, side, media_type)
    if side not in ("front", "back"):
        raise HTTPException(status_code=422, detail="side must be 'front' or 'back'")
    if media_type not in ("image", "audio"):
        raise HTTPException(status_code=422, detail="media_type must be 'image' or 'audio'")

    content = await file.read()
    logger.debug("upload_card_media file read filename=%r size=%d mime=%s", file.filename, len(content), file.content_type)
    if len(content) > _MAX_MEDIA_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    mime = file.content_type or ""
    allowed = _ALLOWED_IMAGE_TYPES if media_type == "image" else _ALLOWED_AUDIO_TYPES
    if mime not in allowed:
        raise HTTPException(status_code=415, detail=f"Unsupported media type: {mime}")

    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename and "." in (file.filename or "") else "bin"
    media_id = str(uuid.uuid4())
    storage_key = f"flashcards/{card_id}/{media_id}.{ext}"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM flashcards WHERE id = %s AND user_id = %s AND is_active = TRUE",
                (card_id, user_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Card not found")

            logger.debug("upload_card_media uploading key=%s", storage_key)
            _upload(object_key=storage_key, content=content, content_type=mime)

            cur.execute(
                """
                INSERT INTO flashcard_media
                    (id, card_id, side, media_type, storage_provider, storage_key, mime_type, size_bytes)
                VALUES (%s, %s, %s, %s, 'minio', %s, %s, %s)
                RETURNING id::text, side, media_type, public_url, mime_type
                """,
                (media_id, card_id, side, media_type, storage_key, mime, len(content)),
            )
            row = cur.fetchone()

    logger.info("upload_card_media done media_id=%s card_id=%s key=%s", media_id, card_id, storage_key)
    return MediaOut(id=row[0], side=row[1], media_type=row[2], public_url=row[3], mime_type=row[4])


@router.delete("/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT, name="delete_card_media")
def delete_card_media(media_id: str, user_id: str = Depends(get_current_user_id)):
    """Delete a media item and remove its file from storage. Verifies ownership via the parent card."""
    logger.debug("delete_card_media media_id=%s user_id=%s", media_id, user_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT m.storage_key
                FROM flashcard_media m
                JOIN flashcards c ON c.id = m.card_id
                WHERE m.id = %s AND c.user_id = %s
                """,
                (media_id, user_id),
            )
            row = cur.fetchone()
            if not row:
                logger.debug("delete_card_media not found media_id=%s user_id=%s", media_id, user_id)
                raise HTTPException(status_code=404, detail="Media not found")

            storage_key = row[0]
            cur.execute("DELETE FROM flashcard_media WHERE id = %s", (media_id,))

    logger.debug("delete_card_media removing from storage key=%s", storage_key)
    delete_object(storage_key)
    logger.info("delete_card_media done media_id=%s key=%s", media_id, storage_key)
