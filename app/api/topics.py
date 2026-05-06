from __future__ import annotations

from fastapi import APIRouter

from app.api.schemas import CategoryWithTopicsOut, TopicOut
from app.core.database import get_connection
from app.core.logger import logger

router = APIRouter(prefix="/topics", tags=["topics"])


@router.get("/get_categories_topics", response_model=list[CategoryWithTopicsOut])
def list_categories():
    """Return all active categories with their active topics, ordered by sort_order."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    c.code        AS cat_code,
                    c.title       AS cat_title,
                    c.sort_order  AS cat_sort,
                    t.code        AS topic_code,
                    t.title       AS topic_title,
                    t.description AS topic_desc,
                    t.difficulty_level,
                    t.sort_order  AS topic_sort
                FROM categories c
                JOIN topics t ON t.category_id = c.id
                WHERE c.is_active = TRUE
                  AND t.is_active = TRUE
                ORDER BY c.sort_order, t.sort_order
                """
            )
            rows = cur.fetchall()

    categories: list[CategoryWithTopicsOut] = []
    cat_index: dict[str, int] = {}

    for cat_code, cat_title, cat_sort, topic_code, topic_title, topic_desc, difficulty, topic_sort in rows:
        if cat_code not in cat_index:
            cat_index[cat_code] = len(categories)
            categories.append(
                CategoryWithTopicsOut(
                    code=cat_code,
                    title=cat_title,
                    sort_order=cat_sort,
                    topics=[],
                )
            )
        categories[cat_index[cat_code]].topics.append(
            TopicOut(
                code=topic_code,
                title=topic_title,
                description=topic_desc,
                difficulty_level=difficulty,
                sort_order=topic_sort,
            )
        )

    logger.info("list_categories returned %d categories", len(categories))
    return categories
