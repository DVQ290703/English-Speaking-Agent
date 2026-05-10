from __future__ import annotations

from datetime import timedelta
from typing import Literal
from uuid import UUID

from langchain_core.tools import tool

from app.core.database import get_connection
from app.core.logger import logger
from app.services.flashcard_service import calculate_sm2


def _is_valid_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except (ValueError, AttributeError):
        return False


@tool
def list_decks(user_id: str) -> list[dict]:
    """List all active flashcard decks for a user.

    Returns each deck's id, name, description, card_count, and due_count.
    ONLY call when the user explicitly asks to see or choose a deck (e.g. "show my decks",
    "which deck should I save to"). Never call proactively at session start.

    Args:
        user_id: The UUID of the authenticated user.
    """
    logger.debug("list_decks enter user_id=%s", user_id)
    if not _is_valid_uuid(user_id):
        logger.warning("list_decks invalid user_id=%r — not a UUID", user_id)
        return []
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    d.id::text, d.name, d.description,
                    COUNT(c.id) FILTER (WHERE c.is_active)                AS card_count,
                    COUNT(r.id) FILTER (WHERE r.due_date <= CURRENT_DATE) AS due_count
                FROM flashcard_decks d
                LEFT JOIN flashcards c ON c.deck_id = d.id
                LEFT JOIN flashcard_reviews r ON r.card_id = c.id AND r.user_id = %s
                WHERE d.user_id = %s AND d.is_active = TRUE
                GROUP BY d.id, d.name, d.description
                ORDER BY d.created_at DESC
                """,
                (user_id, user_id),
            )
            rows = cur.fetchall()
    result = [
        {"id": r[0], "name": r[1], "description": r[2], "card_count": r[3] or 0, "due_count": r[4] or 0}
        for r in rows
    ]
    logger.debug("list_decks return count=%d user_id=%s", len(result), user_id)
    return result


@tool
def create_deck(
    user_id: str,
    name: str,
    description: str | None = None,
) -> dict:
    """Create a new flashcard deck for the user.

    Always ask the user what they would like to name the deck before calling
    this tool. If the user says they don't know or don't mind, infer a
    suitable name from the current conversation topic or category
    (e.g. "IELTS Part 2 Vocabulary") and proceed without further prompting.

    Args:
        user_id: The UUID of the authenticated user.
        name: The deck name chosen by the user or inferred from context.
        description: Optional short description of the deck's purpose.

    Returns:
        dict with deck_id, name, and description on success, or error on failure.
    """
    logger.debug("create_deck enter user_id=%s name=%r", user_id, name)
    if not _is_valid_uuid(user_id):
        logger.warning("create_deck invalid user_id=%r — not a UUID", user_id)
        return {"error": f"user_id '{user_id}' is not a valid UUID."}
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO flashcard_decks (user_id, name, description)
                VALUES (%s, %s, %s)
                RETURNING id::text, name, description
                """,
                (user_id, name, description),
            )
            row = cur.fetchone()
    if row is None:
        logger.warning("create_deck fetchone returned None — INSERT may have failed user_id=%s", user_id)
        return {"error": "Deck creation failed — no row returned."}
    deck_id, deck_name, deck_desc = row
    logger.info("create_deck return deck_id=%s name=%r", deck_id, deck_name)
    logger.log_event(
        "flashcard.deck_created",
        {"user_id": user_id, "deck_id": deck_id, "name": deck_name},
    )
    return {"deck_id": deck_id, "name": deck_name, "description": deck_desc}


@tool
def create_card(
    user_id: str,
    deck_id: str,
    front_text: str,
    back_text: str,
    tags: list[str] | None = None,
) -> dict:
    """Create a new flashcard in a deck and initialize its SM-2 review schedule.

    Args:
        user_id: The UUID of the authenticated user.
        deck_id: The UUID of the target deck (must belong to the user).
        front_text: The word or phrase shown on the front of the card.
        back_text: The definition, example, or translation on the back.
        tags: Optional list of string tags (e.g. ["education", "noun"]).

    Returns:
        dict with card_id, deck_name, front_text.
    """
    logger.debug("create_card enter user_id=%s deck_id=%s front=%r", user_id, deck_id, front_text)
    if not _is_valid_uuid(deck_id):
        logger.warning("create_card invalid deck_id=%r — not a UUID", deck_id)
        return {"error": f"deck_id '{deck_id}' is not a valid UUID. Call list_decks first to get the correct deck UUID."}
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT name FROM flashcard_decks WHERE id = %s AND user_id = %s AND is_active = TRUE",
                (deck_id, user_id),
            )
            deck_row = cur.fetchone()
            if not deck_row:
                logger.warning("create_card deck not found deck_id=%s user_id=%s", deck_id, user_id)
                return {"error": "Deck not found"}

            cur.execute(
                """
                INSERT INTO flashcards (deck_id, user_id, front_text, back_text, tags)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id::text
                """,
                (deck_id, user_id, front_text, back_text, tags or []),
            )
            card_id = cur.fetchone()[0]

            cur.execute(
                """
                INSERT INTO flashcard_reviews (card_id, user_id)
                VALUES (%s, %s)
                ON CONFLICT (card_id, user_id) DO NOTHING
                """,
                (card_id, user_id),
            )

    logger.info("create_card tool: card_id=%s deck=%s front=%r", card_id, deck_row[0], front_text)
    logger.log_event("flashcard.card_created", {"user_id": user_id, "card_id": card_id, "deck_id": deck_id, "front_text": front_text})
    logger.debug("create_card return card_id=%s", card_id)
    return {"card_id": card_id, "deck_name": deck_row[0], "front_text": front_text}


@tool
def update_card(
    user_id: str,
    card_id: str,
    front_text: str | None = None,
    back_text: str | None = None,
    tags: list[str] | None = None,
) -> dict:
    """Update an existing flashcard's content.

    Args:
        user_id: The UUID of the authenticated user.
        card_id: The UUID of the card to update.
        front_text: New front text (optional — omit to keep existing).
        back_text: New back text (optional — omit to keep existing).
        tags: New tags list (optional — omit to keep existing).

    Returns:
        dict with card_id and updated fields, or error.
    """
    logger.debug("update_card enter user_id=%s card_id=%s", user_id, card_id)
    if not _is_valid_uuid(card_id):
        logger.warning("update_card invalid card_id=%r — not a UUID", card_id)
        return {"error": f"card_id '{card_id}' is not a valid UUID. Call search_cards first to get the correct card UUID."}
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE flashcards
                SET front_text = COALESCE(%s, front_text),
                    back_text  = COALESCE(%s, back_text),
                    tags       = COALESCE(%s, tags)
                WHERE id = %s AND user_id = %s AND is_active = TRUE
                RETURNING id::text, front_text, back_text
                """,
                (front_text, back_text, tags, card_id, user_id),
            )
            row = cur.fetchone()
    if not row:
        logger.warning("update_card card not found card_id=%s user_id=%s", card_id, user_id)
        return {"error": "Card not found"}
    logger.log_event("flashcard.card_updated", {"user_id": user_id, "card_id": row[0]})
    logger.debug("update_card return card_id=%s", row[0])
    return {"card_id": row[0], "front_text": row[1], "back_text": row[2]}


@tool
def search_cards(
    user_id: str,
    query: str | None = None,
    tag: str | None = None,
    deck_id: str | None = None,
) -> list[dict]:
    """Search a user's flashcards by keyword or tag.

    Keyword search uses ILIKE on front_text and back_text.
    ONLY call when the user explicitly asks to find or look up a card
    (e.g. "search my cards for X", "do I have a card for Y").

    Args:
        user_id: The UUID of the authenticated user.
        query: Keyword to search in front/back text (optional).
        tag: Exact tag to filter by (optional).
        deck_id: Restrict search to a specific deck (optional).

    Returns:
        List of dicts with card_id, front_text, deck_name, tags.
    """
    conditions = ["c.user_id = %s", "c.is_active = TRUE"]
    params: list = [user_id]

    if query:
        conditions.append("(c.front_text ILIKE %s OR c.back_text ILIKE %s)")
        params += [f"%{query}%", f"%{query}%"]
    if tag:
        conditions.append("%s = ANY(c.tags)")
        params.append(tag)
    if deck_id:
        conditions.append("c.deck_id = %s")
        params.append(deck_id)

    where = " AND ".join(conditions)

    logger.debug("search_cards enter user_id=%s query=%r tag=%r deck_id=%s", user_id, query, tag, deck_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT c.id::text, c.front_text, d.name, c.tags
                FROM flashcards c
                JOIN flashcard_decks d ON d.id = c.deck_id
                WHERE {where}
                ORDER BY c.created_at DESC
                LIMIT 20
                """,
                params,
            )
            rows = cur.fetchall()
    result = [{"card_id": r[0], "front_text": r[1], "deck_name": r[2], "tags": r[3] or []} for r in rows]
    logger.debug("search_cards return count=%d user_id=%s", len(result), user_id)
    return result


@tool
def get_due_cards(
    user_id: str,
    deck_id: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """Retrieve cards due for review today for a user.

    Args:
        user_id: The UUID of the authenticated user.
        deck_id: Restrict to a specific deck (optional).
        limit: Maximum number of cards to return (default 20).

    Returns:
        List of dicts with card_id, front_text, back_text, deck_name, due_date.
    """
    conditions = ["r.user_id = %s", "r.due_date <= CURRENT_DATE", "c.is_active = TRUE"]
    params: list = [user_id]

    if deck_id:
        conditions.append("c.deck_id = %s")
        params.append(deck_id)

    params.append(limit)
    where = " AND ".join(conditions)

    logger.debug("get_due_cards enter user_id=%s deck_id=%s limit=%d", user_id, deck_id, limit)
    if deck_id is not None and not _is_valid_uuid(deck_id):
        logger.warning("get_due_cards invalid deck_id=%r — not a UUID", deck_id)
        return []
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT c.id::text, c.front_text, c.back_text, d.name, r.due_date::text
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
    result = [
        {"card_id": r[0], "front_text": r[1], "back_text": r[2], "deck_name": r[3], "due_date": r[4]}
        for r in rows
    ]
    logger.debug("get_due_cards return count=%d user_id=%s", len(result), user_id)
    return result


@tool
def submit_card_review(
    user_id: str,
    card_id: str,
    rating: Literal["again", "hard", "good", "easy"],
) -> dict:
    """Submit a review rating for a flashcard and update its SM-2 schedule.

    Idempotent: re-submitting on the same day overwrites the previous rating.

    Args:
        user_id: The UUID of the authenticated user.
        card_id: The UUID of the card being reviewed.
        rating: Recall difficulty — 'again' (failed), 'hard', 'good', or 'easy'.

    Returns:
        dict with card_id, new due_date, interval_days, ease_factor, repetitions.
    """
    logger.debug("submit_card_review enter user_id=%s card_id=%s rating=%s", user_id, card_id, rating)
    if not _is_valid_uuid(card_id):
        logger.warning("submit_card_review invalid card_id=%r — not a UUID", card_id)
        return {"error": f"card_id '{card_id}' is not a valid UUID. Call get_due_cards or search_cards first to get the correct card UUID."}
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT r.repetitions, r.ease_factor, r.interval_days
                FROM flashcard_reviews r
                JOIN flashcards c ON c.id = r.card_id
                WHERE r.card_id = %s AND r.user_id = %s AND c.is_active = TRUE
                """,
                (card_id, user_id),
            )
            row = cur.fetchone()
            if not row:
                logger.warning("submit_card_review card not found card_id=%s user_id=%s", card_id, user_id)
                return {"error": "Card not found or not scheduled"}

            new_rep, new_ef, new_interval, due_date = calculate_sm2(
                rating, int(row[0]), float(row[1]), int(row[2])
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
                (new_rep, new_ef, new_interval, due_date, rating, card_id, user_id),
            )

    logger.info("submit_card_review tool: card_id=%s rating=%s due=%s", card_id, rating, due_date)
    logger.log_event("flashcard.review_submitted", {"user_id": user_id, "card_id": card_id, "rating": rating, "due_date": str(due_date), "interval_days": new_interval})
    logger.debug("submit_card_review return card_id=%s due=%s interval=%d", card_id, due_date, new_interval)
    return {
        "card_id": card_id,
        "due_date": str(due_date),
        "interval_days": new_interval,
        "ease_factor": new_ef,
        "repetitions": new_rep,
    }


@tool
def get_deck_stats(user_id: str, deck_id: str) -> dict:
    """Get statistics for a flashcard deck.

    Args:
        user_id: The UUID of the authenticated user.
        deck_id: The UUID of the deck.

    Returns:
        dict with total_cards, due_today, learned, retention_rate (0.0-1.0).
    """
    logger.debug("get_deck_stats enter user_id=%s deck_id=%s", user_id, deck_id)
    if not _is_valid_uuid(deck_id):
        logger.warning("get_deck_stats invalid deck_id=%r — not a UUID", deck_id)
        return {"error": f"deck_id '{deck_id}' is not a valid UUID. Call list_decks first to get the correct deck UUID."}
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COUNT(c.id) FILTER (WHERE c.is_active)                       AS total_cards,
                    COUNT(r.id) FILTER (WHERE r.due_date <= CURRENT_DATE)        AS due_today,
                    COUNT(r.id) FILTER (WHERE r.repetitions > 0)                 AS learned,
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
        logger.warning("get_deck_stats deck not found deck_id=%s user_id=%s", deck_id, user_id)
        return {"error": "Deck not found"}
    result = {
        "total_cards": row[0] or 0,
        "due_today": row[1] or 0,
        "learned": row[2] or 0,
        "retention_rate": float(row[3] or 0),
    }
    logger.debug("get_deck_stats return deck_id=%s total=%d due=%d retention=%.2f", deck_id, result["total_cards"], result["due_today"], result["retention_rate"])
    return result


# All tools exported for LangGraph registration
FLASHCARD_TOOLS = [
    list_decks,
    create_deck,
    create_card,
    update_card,
    search_cards,
    get_due_cards,
    submit_card_review,
    get_deck_stats,
]
