# Topics & Categories API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a `GET /api/topics/categories` endpoint that returns live category and topic data from the database.

**Architecture:** New backend route reads from the seeded `categories` + `topics` tables with one JOIN query and groups topics under their parent category. No authentication required — topic list is not user-specific.

**Tech Stack:** Python/FastAPI (psycopg2, Pydantic v2), pytest + FastAPI TestClient

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `app/api/schemas.py` | Add `TopicOut`, `CategoryWithTopicsOut` |
| Create | `app/api/topics.py` | `GET /api/topics/categories` route |
| Modify | `app/api/router.py` | Register topics router |
| Create | `tests/test_api/test_topics.py` | Unit tests for the new endpoint |

---

## Task 1: Add Pydantic schemas for topics/categories response

**Files:**
- Modify: `app/api/schemas.py`

- [ ] **Step 1: Add two models at the end of `app/api/schemas.py`**

```python
class TopicOut(BaseModel):
    code: str
    title: str
    description: str | None
    difficulty_level: str | None
    sort_order: int


class CategoryWithTopicsOut(BaseModel):
    code: str
    title: str
    sort_order: int
    topics: list[TopicOut]
```

- [ ] **Step 2: Commit**

```bash
git add app/api/schemas.py
git commit -m "feat: add TopicOut and CategoryWithTopicsOut Pydantic schemas"
```

---

## Task 2: Write the failing test for the new endpoint

**Files:**
- Create: `tests/test_api/test_topics.py`

- [ ] **Step 1: Write the test file**

```python
# tests/test_api/test_topics.py
"""Unit tests for GET /api/topics/categories"""
import os
import sys
import types
from unittest.mock import MagicMock, patch

_minio_stub = types.ModuleType("minio")
_minio_stub.Minio = MagicMock  # type: ignore[attr-defined]
_minio_error_stub = types.ModuleType("minio.error")
_minio_error_stub.S3Error = Exception  # type: ignore[attr-defined]
sys.modules.setdefault("minio", _minio_stub)
sys.modules.setdefault("minio.error", _minio_error_stub)

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only!")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("POSTGRES_DB", "test_db")
os.environ.setdefault("POSTGRES_USER", "test_user")
os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
os.environ.setdefault("MINIO_SECRET_KEY", "minio-test-secret-2026")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key-2026")

from fastapi.testclient import TestClient

with (
    patch("app.core.database.init_db_pool"),
    patch("app.core.storage.init_storage"),
):
    from app.main import app

client = TestClient(app, raise_server_exceptions=True)


def make_mock_conn(rows):
    """Return a mock psycopg2 context-manager connection whose cursor yields `rows`."""
    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = rows
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return mock_conn


def test_get_categories_returns_grouped_structure():
    """Two rows from the same category should be nested under one category object."""
    db_rows = [
        # cat_code, cat_title, cat_sort, topic_code, topic_title, topic_desc, difficulty, topic_sort
        ("ielts", "IELTS Speaking", 1, "ielts_part1", "Part 1", "Intro questions", "beginner", 1),
        ("ielts", "IELTS Speaking", 1, "ielts_part2", "Part 2", "Long turn", "intermediate", 2),
    ]
    mock_conn = make_mock_conn(db_rows)
    with patch("app.core.database.get_connection", return_value=mock_conn):
        resp = client.get("/api/topics/categories")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    cat = data[0]
    assert cat["code"] == "ielts"
    assert cat["title"] == "IELTS Speaking"
    assert cat["sort_order"] == 1
    assert len(cat["topics"]) == 2
    assert cat["topics"][0]["code"] == "ielts_part1"
    assert cat["topics"][1]["code"] == "ielts_part2"


def test_get_categories_two_categories():
    """Rows from two distinct categories produce two top-level objects."""
    db_rows = [
        ("ielts",    "IELTS Speaking", 1, "ielts_part1", "Part 1", None, "beginner",     1),
        ("business", "Business",       2, "business_job_interview", "Job Interview", None, "intermediate", 1),
    ]
    mock_conn = make_mock_conn(db_rows)
    with patch("app.core.database.get_connection", return_value=mock_conn):
        resp = client.get("/api/topics/categories")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["code"] == "ielts"
    assert data[1]["code"] == "business"


def test_get_categories_empty_db():
    """Empty DB returns an empty list (not an error)."""
    mock_conn = make_mock_conn([])
    with patch("app.core.database.get_connection", return_value=mock_conn):
        resp = client.get("/api/topics/categories")

    assert resp.status_code == 200
    assert resp.json() == []


def test_get_categories_no_auth_required():
    """Endpoint must be accessible without an Authorization header."""
    mock_conn = make_mock_conn([])
    with patch("app.core.database.get_connection", return_value=mock_conn):
        resp = client.get("/api/topics/categories")
    assert resp.status_code == 200
```

- [ ] **Step 2: Run the test to verify it fails (route does not exist yet)**

```bash
cd D:/work/projects/English-Speaking-Agent
python -m pytest tests/test_api/test_topics.py -v
```

Expected: 4 failures — `404 Not Found` because `app/api/topics.py` does not exist yet.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/test_api/test_topics.py
git commit -m "test: add failing tests for GET /api/topics/categories"
```

---

## Task 3: Implement the topics route

**Files:**
- Create: `app/api/topics.py`
- Modify: `app/api/router.py`

- [ ] **Step 1: Create `app/api/topics.py`**

```python
from __future__ import annotations

from fastapi import APIRouter

from app.api.schemas import CategoryWithTopicsOut, TopicOut
from app.core.database import get_connection
from app.core.logger import logger

router = APIRouter(prefix="/topics", tags=["topics"])


@router.get("/categories", response_model=list[CategoryWithTopicsOut])
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
```

- [ ] **Step 2: Register the router in `app/api/router.py`**

Replace the entire file with:

```python
from __future__ import annotations

from fastapi import APIRouter

from app.api.assess import router as assess_router
from app.api.audio import router as audio_router
from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.conversations import router as conversations_router
from app.api.topics import router as topics_router

router = APIRouter(prefix="/api")
router.include_router(auth_router)
router.include_router(chat_router)
router.include_router(assess_router)
router.include_router(conversations_router)
router.include_router(audio_router)
router.include_router(topics_router)
```

- [ ] **Step 3: Run the topics tests and verify they pass**

```bash
cd D:/work/projects/English-Speaking-Agent
python -m pytest tests/test_api/test_topics.py -v
```

Expected:
```
PASSED tests/test_api/test_topics.py::test_get_categories_returns_grouped_structure
PASSED tests/test_api/test_topics.py::test_get_categories_two_categories
PASSED tests/test_api/test_topics.py::test_get_categories_empty_db
PASSED tests/test_api/test_topics.py::test_get_categories_no_auth_required
4 passed
```

- [ ] **Step 4: Run the full backend test suite to check for regressions**

```bash
python -m pytest tests/ -v --tb=short
```

Expected: all previously passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/topics.py app/api/router.py
git commit -m "feat: add GET /api/topics/categories endpoint"
```
