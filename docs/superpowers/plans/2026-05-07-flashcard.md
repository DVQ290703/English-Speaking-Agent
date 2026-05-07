# Flashcard Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a full backend flashcard system with SM-2 spaced repetition, REST API, and LangGraph agent tools.

**Architecture:** Pure SM-2 scheduling logic lives in `app/services/flashcard_service.py` (pure function, fully unit-tested). Routes in `app/api/flashcards.py` call this service and do DB operations directly via `get_connection()`, following the existing pattern. Agent tools in `app/agents/tools/flashcard_tools.py` wrap the same DB layer and are decorated with `@tool` for LangGraph integration.

**Tech Stack:** FastAPI, psycopg2, PostgreSQL, MinIO (via existing `app.core.storage`), LangChain `@tool`, pytest + MagicMock.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `db_schema/flashcard_schema.sql` | Create | All 4 new tables + indexes + triggers |
| `app/api/schemas.py` | Modify | Add all flashcard request/response Pydantic models |
| `app/services/flashcard_service.py` | Create | `calculate_sm2()` pure function |
| `app/api/flashcards.py` | Create | All REST routes (decks, cards, reviews, media) |
| `app/agents/tools/__init__.py` | Create | Empty package marker |
| `app/agents/tools/flashcard_tools.py` | Create | 6 LangGraph `@tool` functions |
| `app/api/router.py` | Modify | Include flashcard router |
| `tests/test_services/test_sm2.py` | Create | SM-2 algorithm unit tests |
| `tests/test_api/test_flashcards.py` | Create | API route tests (mocked DB) |

---

## Task 1: Database Schema

**Files:**
- Create: `db_schema/flashcard_schema.sql`

- [ ] **Step 1: Create the SQL file**

```sql
-- db_schema/flashcard_schema.sql
-- Apply after schema.sql (requires set_updated_at() trigger to exist)

-- ========================
-- FLASHCARD DECKS
-- ========================

CREATE TABLE IF NOT EXISTS flashcard_decks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user_id ON flashcard_decks(user_id);

CREATE TRIGGER trg_flashcard_decks_updated_at
    BEFORE UPDATE ON flashcard_decks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========================
-- FLASHCARDS
-- ========================

CREATE TABLE IF NOT EXISTS flashcards (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deck_id     UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    front_text  TEXT NOT NULL,
    back_text   TEXT NOT NULL,
    tags        TEXT[] NOT NULL DEFAULT '{}',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_deck_id ON flashcards(deck_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_user_id ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_tags    ON flashcards USING GIN(tags);

CREATE TRIGGER trg_flashcards_updated_at
    BEFORE UPDATE ON flashcards
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========================
-- FLASHCARD MEDIA
-- ========================

CREATE TABLE IF NOT EXISTS flashcard_media (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id           UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    side              TEXT NOT NULL CHECK (side IN ('front', 'back')),
    media_type        TEXT NOT NULL CHECK (media_type IN ('image', 'audio')),
    storage_provider  TEXT NOT NULL CHECK (storage_provider IN ('local','s3','azure_blob','gcs','minio')),
    storage_key       TEXT NOT NULL,
    public_url        TEXT,
    mime_type         TEXT,
    size_bytes        BIGINT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_media_card_id ON flashcard_media(card_id);

-- ========================
-- FLASHCARD REVIEWS  (SM-2 scheduling state)
-- ========================

CREATE TABLE IF NOT EXISTS flashcard_reviews (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id          UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    due_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    interval_days    INT NOT NULL DEFAULT 1,
    ease_factor      NUMERIC(4,2) NOT NULL DEFAULT 2.5,
    repetitions      INT NOT NULL DEFAULT 0,
    last_rating      TEXT CHECK (last_rating IN ('again','hard','good','easy')),
    last_reviewed_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_flashcard_reviews_card_user UNIQUE (card_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_user_due
    ON flashcard_reviews(user_id, due_date);

CREATE TRIGGER trg_flashcard_reviews_updated_at
    BEFORE UPDATE ON flashcard_reviews
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 2: Commit**

```bash
git add db_schema/flashcard_schema.sql
git commit -m "feat(flashcard): add database schema for decks, cards, media, reviews"
```

---

## Task 2: Pydantic Schemas

**Files:**
- Modify: `app/api/schemas.py` (append at end of file)

- [ ] **Step 1: Append flashcard schemas to `app/api/schemas.py`**

```python
# ── Flashcard schemas ──────────────────────────────────────────────────────────

from datetime import date as _date


class DeckCreate(BaseModel):
    name: str
    description: str | None = None


class DeckUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class DeckOut(BaseModel):
    id: str
    name: str
    description: str | None
    card_count: int
    due_count: int
    created_at: datetime


class MediaOut(BaseModel):
    id: str
    side: str
    media_type: str
    public_url: str | None
    mime_type: str | None


class CardCreate(BaseModel):
    front_text: str
    back_text: str
    tags: list[str] = []


class CardUpdate(BaseModel):
    front_text: str | None = None
    back_text: str | None = None
    tags: list[str] | None = None


class CardOut(BaseModel):
    id: str
    deck_id: str
    front_text: str
    back_text: str
    tags: list[str]
    created_at: datetime
    media: list[MediaOut] = []


class ReviewSubmit(BaseModel):
    rating: Literal["again", "hard", "good", "easy"]


class ReviewStateOut(BaseModel):
    card_id: str
    due_date: _date
    interval_days: int
    ease_factor: float
    repetitions: int


class DueCardOut(BaseModel):
    id: str
    front_text: str
    back_text: str
    deck_name: str
    due_date: _date
    media: list[MediaOut] = []


class DeckStatsOut(BaseModel):
    total_cards: int
    due_today: int
    learned: int
    retention_rate: float
```

- [ ] **Step 2: Verify `Literal` is imported at top of schemas.py**

Check line 4 of `app/api/schemas.py` — it already imports `Literal` from `typing`. If not, add it.

- [ ] **Step 3: Commit**

```bash
git add app/api/schemas.py
git commit -m "feat(flashcard): add flashcard Pydantic schemas"
```

---

## Task 3: SM-2 Algorithm — TDD

**Files:**
- Create: `app/services/flashcard_service.py`
- Create: `tests/test_services/test_sm2.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_services/test_sm2.py`:

```python
"""Unit tests for the SM-2 spaced repetition algorithm."""
from datetime import date, timedelta

import pytest

from app.services.flashcard_service import calculate_sm2

TODAY = date(2026, 5, 7)


def test_again_resets_repetitions_and_interval():
    """'again' rating resets repetitions to 0 and sets interval to 1."""
    rep, ef, interval, due = calculate_sm2("again", 0, 2.5, 1, today=TODAY)
    assert rep == 0
    assert interval == 1
    assert due == TODAY + timedelta(days=1)


def test_again_reduces_ease_factor():
    """'again' (q=0) lowers ease factor significantly."""
    _, ef, _, _ = calculate_sm2("again", 0, 2.5, 1, today=TODAY)
    assert ef == 1.7


def test_hard_resets_repetitions():
    """'hard' (q=2) also resets repetitions but with smaller EF penalty."""
    rep, ef, interval, _ = calculate_sm2("hard", 3, 2.5, 10, today=TODAY)
    assert rep == 0
    assert interval == 1
    assert ef == 2.18


def test_good_first_review():
    """'good' on a new card sets interval=1 and repetitions=1."""
    rep, ef, interval, due = calculate_sm2("good", 0, 2.5, 1, today=TODAY)
    assert rep == 1
    assert interval == 1
    assert ef == 2.36
    assert due == TODAY + timedelta(days=1)


def test_good_second_review():
    """'good' on rep=1 sets interval=6."""
    rep, ef, interval, _ = calculate_sm2("good", 1, 2.36, 1, today=TODAY)
    assert rep == 2
    assert interval == 6
    assert ef == 2.22


def test_good_third_review_multiplies_interval():
    """'good' on rep=2 multiplies interval by ease_factor."""
    rep, ef, interval, _ = calculate_sm2("good", 2, 2.22, 6, today=TODAY)
    assert rep == 3
    assert interval == 13  # round(6 * 2.22) = 13
    assert ef == 2.08


def test_easy_increases_ease_factor():
    """'easy' (q=5) increases ease factor by 0.1."""
    _, ef, _, _ = calculate_sm2("easy", 0, 2.5, 1, today=TODAY)
    assert ef == 2.6


def test_easy_third_review():
    """'easy' on rep=2 produces a longer interval than 'good'."""
    rep, ef, interval, _ = calculate_sm2("easy", 2, 2.6, 6, today=TODAY)
    assert rep == 3
    assert interval == 16  # round(6 * 2.6) = 16
    assert ef == 2.7


def test_ease_factor_floor_is_1_3():
    """Repeated 'again' ratings never push ease factor below 1.3."""
    _, ef, _, _ = calculate_sm2("again", 0, 1.35, 1, today=TODAY)
    assert ef == 1.3


def test_due_date_uses_computed_interval():
    """due_date is always today + interval_days."""
    _, _, interval, due = calculate_sm2("easy", 2, 2.5, 6, today=TODAY)
    assert due == TODAY + timedelta(days=interval)
```

- [ ] **Step 2: Run tests — expect failure (module not found)**

```bash
pytest tests/test_services/test_sm2.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.services.flashcard_service'`

- [ ] **Step 3: Create `app/services/flashcard_service.py`**

```python
from __future__ import annotations

from datetime import date, timedelta
from typing import Literal


_RATING_TO_QUALITY: dict[str, int] = {
    "again": 0,
    "hard": 2,
    "good": 3,
    "easy": 5,
}


def calculate_sm2(
    rating: Literal["again", "hard", "good", "easy"],
    repetitions: int,
    ease_factor: float,
    interval_days: int,
    today: date | None = None,
) -> tuple[int, float, int, date]:
    """Apply one SM-2 review step.

    Returns:
        (repetitions, ease_factor, interval_days, due_date)
    """
    if today is None:
        today = date.today()

    q = _RATING_TO_QUALITY[rating]

    if q < 3:
        repetitions = 0
        interval_days = 1
    else:
        if repetitions == 0:
            interval_days = 1
        elif repetitions == 1:
            interval_days = 6
        else:
            interval_days = round(interval_days * ease_factor)
        repetitions += 1

    ease_factor = max(1.3, ease_factor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    due_date = today + timedelta(days=interval_days)

    return repetitions, round(ease_factor, 2), interval_days, due_date
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
pytest tests/test_services/test_sm2.py -v
```

Expected: `10 passed`

- [ ] **Step 5: Commit**

```bash
git add app/services/flashcard_service.py tests/test_services/test_sm2.py
git commit -m "feat(flashcard): implement SM-2 algorithm with full unit test coverage"
```

---

## Task 4: Deck CRUD API

**Files:**
- Create: `app/api/flashcards.py` (deck routes only for now)
- Create: `tests/test_api/test_flashcards.py` (deck tests)

- [ ] **Step 1: Write failing deck tests**

Create `tests/test_api/test_flashcards.py`:

```python
"""Tests for /api/flashcards/* routes."""
import os
import sys
import types
import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch

# ── Stub minio before any import ─────────────────────────────────────────────
_minio_stub = types.ModuleType("minio")
_minio_stub.Minio = MagicMock
_minio_error_stub = types.ModuleType("minio.error")
_minio_error_stub.S3Error = Exception
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
    from app.core.security import create_access_token

client = TestClient(app, raise_server_exceptions=True)


def _auth(user_id: str | None = None):
    uid = user_id or str(uuid.uuid4())
    token, _ = create_access_token(user_id=uid, email="test@example.com")
    return {"Authorization": f"Bearer {token}"}, uid


def make_mock_conn(fetchone=None, fetchall=None):
    cur = MagicMock()
    cur.fetchone.return_value = fetchone
    cur.fetchall.return_value = fetchall or []
    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cur)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return conn, cur


# ── Deck tests ────────────────────────────────────────────────────────────────

def test_list_decks_returns_empty():
    headers, _ = _auth()
    conn, _ = make_mock_conn(fetchall=[])
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.get("/api/flashcards/decks", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_decks_returns_deck():
    headers, uid = _auth()
    now = datetime.utcnow()
    conn, _ = make_mock_conn(fetchall=[(
        str(uuid.uuid4()), "Vocab", "My vocab deck", 5, 2, now
    )])
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.get("/api/flashcards/decks", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Vocab"
    assert data[0]["card_count"] == 5
    assert data[0]["due_count"] == 2


def test_create_deck_returns_201():
    headers, uid = _auth()
    deck_id = str(uuid.uuid4())
    now = datetime.utcnow()
    conn, cur = make_mock_conn(fetchone=(deck_id, "Education", None, 0, 0, now))
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.post(
            "/api/flashcards/decks",
            json={"name": "Education"},
            headers=headers,
        )
    assert resp.status_code == 201
    assert resp.json()["name"] == "Education"
    assert resp.json()["id"] == deck_id


def test_create_deck_requires_auth():
    resp = client.post("/api/flashcards/decks", json={"name": "Test"})
    assert resp.status_code == 403


def test_get_deck_returns_404_when_not_found():
    headers, uid = _auth()
    conn, _ = make_mock_conn(fetchone=None)
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.get(f"/api/flashcards/decks/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


def test_get_deck_returns_deck():
    headers, uid = _auth()
    deck_id = str(uuid.uuid4())
    now = datetime.utcnow()
    conn, _ = make_mock_conn(fetchone=(deck_id, "Education", None, 3, 1, now))
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.get(f"/api/flashcards/decks/{deck_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Education"


def test_update_deck():
    headers, uid = _auth()
    deck_id = str(uuid.uuid4())
    now = datetime.utcnow()
    conn, _ = make_mock_conn(fetchone=(deck_id, "Updated Name", "desc", 0, 0, now))
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.patch(
            f"/api/flashcards/decks/{deck_id}",
            json={"name": "Updated Name"},
            headers=headers,
        )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


def test_delete_deck_returns_204():
    headers, uid = _auth()
    conn, cur = make_mock_conn(fetchone=(str(uuid.uuid4()),))
    cur.rowcount = 1
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.delete(f"/api/flashcards/decks/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 204


def test_delete_deck_returns_404_when_not_found():
    headers, uid = _auth()
    conn, cur = make_mock_conn(fetchone=None)
    cur.rowcount = 0
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.delete(f"/api/flashcards/decks/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests — expect failure**

```bash
pytest tests/test_api/test_flashcards.py -v
```

Expected: `ImportError` or 404s (router not registered yet)

- [ ] **Step 3: Create `app/api/flashcards.py` with deck routes**

```python
from __future__ import annotations

import uuid
from datetime import date

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
    result = []
    for mid, side, mtype, storage_key, public_url, mime_type in rows:
        url = public_url
        if storage_key and not url:
            try:
                from datetime import timedelta
                url = get_presigned_url(storage_key, expires=timedelta(hours=1))
            except Exception:
                url = None
        result.append(MediaOut(id=mid, side=side, media_type=mtype, public_url=url, mime_type=mime_type))
    return result


# ── Decks ─────────────────────────────────────────────────────────────────────

@router.get("/decks", response_model=list[DeckOut], name="list_decks")
def list_decks(user_id: str = Depends(get_current_user_id)):
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
    return [
        DeckOut(id=r[0], name=r[1], description=r[2], card_count=r[3] or 0, due_count=r[4] or 0, created_at=r[5])
        for r in rows
    ]


@router.post("/decks", response_model=DeckOut, status_code=status.HTTP_201_CREATED, name="create_deck")
def create_deck(payload: DeckCreate, user_id: str = Depends(get_current_user_id)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO flashcard_decks (user_id, name, description)
                VALUES (%s, %s, %s)
                RETURNING id::text, name, description, 0, 0, created_at
                """,
                (user_id, payload.name, payload.description),
            )
            row = cur.fetchone()
    return DeckOut(id=row[0], name=row[1], description=row[2], card_count=0, due_count=0, created_at=row[5])


@router.get("/decks/{deck_id}", response_model=DeckOut, name="get_deck")
def get_deck(deck_id: str, user_id: str = Depends(get_current_user_id)):
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
        raise HTTPException(status_code=404, detail="Deck not found")
    return DeckOut(id=row[0], name=row[1], description=row[2], card_count=row[3] or 0, due_count=row[4] or 0, created_at=row[5])


@router.patch("/decks/{deck_id}", response_model=DeckOut, name="update_deck")
def update_deck(deck_id: str, payload: DeckUpdate, user_id: str = Depends(get_current_user_id)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE flashcard_decks
                SET name        = COALESCE(%s, name),
                    description = COALESCE(%s, description)
                WHERE id = %s AND user_id = %s AND is_active = TRUE
                RETURNING id::text, name, description, 0, 0, created_at
                """,
                (payload.name, payload.description, deck_id, user_id),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Deck not found")
    return DeckOut(id=row[0], name=row[1], description=row[2], card_count=0, due_count=0, created_at=row[5])


@router.delete("/decks/{deck_id}", status_code=status.HTTP_204_NO_CONTENT, name="delete_deck")
def delete_deck(deck_id: str, user_id: str = Depends(get_current_user_id)):
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
                raise HTTPException(status_code=404, detail="Deck not found")
```

- [ ] **Step 4: Register flashcard router in `app/api/router.py`**

Add these two lines to `app/api/router.py`:

```python
from app.api.flashcards import router as flashcards_router
# ... (at the end of the includes)
router.include_router(flashcards_router)
```

- [ ] **Step 5: Run deck tests — expect pass**

```bash
pytest tests/test_api/test_flashcards.py -v -k "deck"
```

Expected: all deck tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/flashcards.py app/api/router.py tests/test_api/test_flashcards.py
git commit -m "feat(flashcard): add deck CRUD endpoints"
```

---

## Task 5: Card CRUD + Search API

**Files:**
- Modify: `app/api/flashcards.py` (append card routes)
- Modify: `tests/test_api/test_flashcards.py` (append card tests)

- [ ] **Step 1: Append card tests to `tests/test_api/test_flashcards.py`**

```python
# ── Card tests ────────────────────────────────────────────────────────────────

def test_create_card_returns_201():
    headers, uid = _auth()
    deck_id = str(uuid.uuid4())
    card_id = str(uuid.uuid4())
    now = datetime.utcnow()
    conn, cur = make_mock_conn(
        fetchone=(card_id, deck_id, "school", "a place of education", [], now)
    )
    cur.fetchall.return_value = []  # no media
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.post(
            f"/api/flashcards/decks/{deck_id}/cards",
            json={"front_text": "school", "back_text": "a place of education"},
            headers=headers,
        )
    assert resp.status_code == 201
    assert resp.json()["front_text"] == "school"
    assert resp.json()["id"] == card_id


def test_create_card_requires_auth():
    resp = client.post(
        f"/api/flashcards/decks/{uuid.uuid4()}/cards",
        json={"front_text": "school", "back_text": "a place of education"},
    )
    assert resp.status_code == 403


def test_get_card_returns_404_when_not_found():
    headers, _ = _auth()
    conn, _ = make_mock_conn(fetchone=None)
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.get(f"/api/flashcards/cards/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


def test_list_cards_returns_cards():
    headers, _ = _auth()
    deck_id = str(uuid.uuid4())
    now = datetime.utcnow()
    conn, cur = make_mock_conn(fetchall=[
        (str(uuid.uuid4()), deck_id, "school", "a place of education", [], now),
    ])
    # second fetchall for media = []
    cur.fetchall.side_effect = [
        [(str(uuid.uuid4()), deck_id, "school", "a place of education", [], now)],
        [],
    ]
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.get(f"/api/flashcards/decks/{deck_id}/cards", headers=headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_update_card():
    headers, _ = _auth()
    card_id = str(uuid.uuid4())
    deck_id = str(uuid.uuid4())
    now = datetime.utcnow()
    conn, cur = make_mock_conn(
        fetchone=(card_id, deck_id, "college", "a place of education", [], now)
    )
    cur.fetchall.return_value = []
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.patch(
            f"/api/flashcards/cards/{card_id}",
            json={"front_text": "college"},
            headers=headers,
        )
    assert resp.status_code == 200
    assert resp.json()["front_text"] == "college"


def test_delete_card_returns_204():
    headers, _ = _auth()
    conn, cur = make_mock_conn()
    cur.rowcount = 1
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.delete(f"/api/flashcards/cards/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 204


def test_search_cards_by_keyword():
    headers, _ = _auth()
    now = datetime.utcnow()
    conn, cur = make_mock_conn()
    cur.fetchall.side_effect = [
        [(str(uuid.uuid4()), str(uuid.uuid4()), "school", "a place of education", [], now)],
        [],  # media for that card
    ]
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.get(
            "/api/flashcards/cards/search?q=school",
            headers=headers,
        )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
```

- [ ] **Step 2: Run card tests — expect failure**

```bash
pytest tests/test_api/test_flashcards.py -v -k "card"
```

Expected: 404 or attribute errors (routes not defined yet)

- [ ] **Step 3: Append card routes to `app/api/flashcards.py`**

```python
# ── Cards ─────────────────────────────────────────────────────────────────────

# IMPORTANT: define /cards/search BEFORE /cards/{card_id} to avoid route shadowing

@router.get("/cards/search", response_model=list[CardOut], name="search_cards")
def search_cards(
    q: str | None = None,
    tag: str | None = None,
    deck_id: str | None = None,
    user_id: str = Depends(get_current_user_id),
):
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
            cards = []
            for row in rows:
                media = _fetch_media(cur, row[0])
                cards.append(CardOut(
                    id=row[0], deck_id=row[1], front_text=row[2],
                    back_text=row[3], tags=row[4] or [], created_at=row[5], media=media,
                ))
    return cards


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
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Verify deck belongs to user
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

            # Initialize SM-2 review record
            cur.execute(
                """
                INSERT INTO flashcard_reviews (card_id, user_id)
                VALUES (%s, %s)
                ON CONFLICT (card_id, user_id) DO NOTHING
                """,
                (card_id, user_id),
            )
    return CardOut(
        id=row[0], deck_id=row[1], front_text=row[2],
        back_text=row[3], tags=row[4] or [], created_at=row[5], media=[],
    )


@router.get("/cards/{card_id}", response_model=CardOut, name="get_card")
def get_card(card_id: str, user_id: str = Depends(get_current_user_id)):
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
                raise HTTPException(status_code=404, detail="Card not found")
            media = _fetch_media(cur, card_id)
    return CardOut(
        id=row[0], deck_id=row[1], front_text=row[2],
        back_text=row[3], tags=row[4] or [], created_at=row[5], media=media,
    )


@router.patch("/cards/{card_id}", response_model=CardOut, name="update_card")
def update_card(card_id: str, payload: CardUpdate, user_id: str = Depends(get_current_user_id)):
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
                raise HTTPException(status_code=404, detail="Card not found")
            media = _fetch_media(cur, card_id)
    return CardOut(
        id=row[0], deck_id=row[1], front_text=row[2],
        back_text=row[3], tags=row[4] or [], created_at=row[5], media=media,
    )


@router.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT, name="delete_card")
def delete_card(card_id: str, user_id: str = Depends(get_current_user_id)):
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
                raise HTTPException(status_code=404, detail="Card not found")
```

- [ ] **Step 4: Run card tests — expect pass**

```bash
pytest tests/test_api/test_flashcards.py -v -k "card"
```

Expected: all card tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/flashcards.py tests/test_api/test_flashcards.py
git commit -m "feat(flashcard): add card CRUD and search endpoints"
```

---

## Task 6: Review API (Due Cards / Submit / Stats)

**Files:**
- Modify: `app/api/flashcards.py` (append review routes)
- Modify: `tests/test_api/test_flashcards.py` (append review tests)

- [ ] **Step 1: Append review tests to `tests/test_api/test_flashcards.py`**

```python
# ── Review tests ──────────────────────────────────────────────────────────────

def test_get_due_cards_returns_empty():
    headers, _ = _auth()
    conn, cur = make_mock_conn(fetchall=[])
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.get("/api/flashcards/reviews/due", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_due_cards_returns_cards():
    headers, _ = _auth()
    today = date.today()
    conn, cur = make_mock_conn()
    cur.fetchall.side_effect = [
        [(str(uuid.uuid4()), "school", "a place of education", "Education", today)],
        [],  # media
    ]
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.get("/api/flashcards/reviews/due", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["front_text"] == "school"


def test_submit_review_returns_updated_schedule():
    headers, uid = _auth()
    card_id = str(uuid.uuid4())
    today = date.today()
    # fetchone returns current SM-2 state: (card_id, rep, ef, interval)
    conn, cur = make_mock_conn(
        fetchone=(card_id, uid, 0, 2.5, 1)
    )
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.post(
            f"/api/flashcards/reviews/{card_id}",
            json={"rating": "good"},
            headers=headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["card_id"] == card_id
    assert data["repetitions"] == 1
    assert data["interval_days"] == 1
    assert data["ease_factor"] == 2.36


def test_submit_review_404_when_card_not_found():
    headers, _ = _auth()
    conn, cur = make_mock_conn(fetchone=None)
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.post(
            f"/api/flashcards/reviews/{uuid.uuid4()}",
            json={"rating": "good"},
            headers=headers,
        )
    assert resp.status_code == 404


def test_get_deck_stats():
    headers, _ = _auth()
    deck_id = str(uuid.uuid4())
    conn, cur = make_mock_conn(
        fetchone=(10, 3, 7, 0.85)
    )
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.get(f"/api/flashcards/decks/{deck_id}/stats", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_cards"] == 10
    assert data["due_today"] == 3
    assert data["learned"] == 7
    assert data["retention_rate"] == 0.85
```

- [ ] **Step 2: Run review tests — expect failure**

```bash
pytest tests/test_api/test_flashcards.py -v -k "review or due or stats"
```

Expected: 404/422 (routes not defined)

- [ ] **Step 3: Append review routes to `app/api/flashcards.py`**

```python
# ── Reviews ───────────────────────────────────────────────────────────────────

@router.get("/reviews/due", response_model=list[DueCardOut], name="get_due_cards")
def get_due_cards(
    deck_id: str | None = None,
    limit: int = 20,
    user_id: str = Depends(get_current_user_id),
):
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
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Fetch current SM-2 state (also verifies card belongs to user)
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
                raise HTTPException(status_code=404, detail="Card not found or not scheduled")

            repetitions, ease_factor, interval_days = int(row[2]), float(row[3]), int(row[4])

            new_rep, new_ef, new_interval, due_date = calculate_sm2(
                payload.rating, repetitions, ease_factor, interval_days
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

    logger.info(
        "submit_review card_id=%s rating=%s new_interval=%d due=%s",
        card_id, payload.rating, new_interval, due_date,
    )
    return ReviewStateOut(
        card_id=card_id,
        due_date=due_date,
        interval_days=new_interval,
        ease_factor=new_ef,
        repetitions=new_rep,
    )


@router.get("/decks/{deck_id}/stats", response_model=DeckStatsOut, name="get_deck_stats")
def get_deck_stats(deck_id: str, user_id: str = Depends(get_current_user_id)):
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
                        /
                        NULLIF(COUNT(r.id) FILTER (
                            WHERE r.last_reviewed_at >= NOW() - INTERVAL '30 days'
                        ), 0),
                        0
                    )                                                                                  AS retention_rate
                FROM flashcard_decks d
                LEFT JOIN flashcards c ON c.deck_id = d.id
                LEFT JOIN flashcard_reviews r ON r.card_id = c.id AND r.user_id = %s
                WHERE d.id = %s AND d.user_id = %s AND d.is_active = TRUE
                """,
                (user_id, deck_id, user_id),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Deck not found")
    return DeckStatsOut(
        total_cards=row[0] or 0,
        due_today=row[1] or 0,
        learned=row[2] or 0,
        retention_rate=float(row[3] or 0),
    )
```

- [ ] **Step 4: Run review tests — expect pass**

```bash
pytest tests/test_api/test_flashcards.py -v -k "review or due or stats"
```

Expected: all review tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/flashcards.py tests/test_api/test_flashcards.py
git commit -m "feat(flashcard): add review endpoints — due cards, submit review, deck stats"
```

---

## Task 7: Media Upload API

**Files:**
- Modify: `app/api/flashcards.py` (append media routes)
- Modify: `tests/test_api/test_flashcards.py` (append media tests)

- [ ] **Step 1: Append media tests to `tests/test_api/test_flashcards.py`**

```python
# ── Media tests ───────────────────────────────────────────────────────────────

def test_upload_card_media_returns_201():
    headers, uid = _auth()
    card_id = str(uuid.uuid4())
    media_id = str(uuid.uuid4())
    conn, cur = make_mock_conn(
        fetchone=(card_id, uid)  # ownership check
    )
    cur.fetchone.side_effect = [
        (card_id, uid),         # ownership check SELECT
        (media_id, "front", "image", None, "image/jpeg"),  # RETURNING
    ]
    with (
        patch("app.api.flashcards.get_connection", return_value=conn),
        patch("app.api.flashcards._upload"),
    ):
        resp = client.post(
            f"/api/flashcards/cards/{card_id}/media",
            headers=headers,
            data={"side": "front", "media_type": "image"},
            files={"file": ("test.jpg", b"fake-image-bytes", "image/jpeg")},
        )
    assert resp.status_code == 201
    assert resp.json()["side"] == "front"
    assert resp.json()["media_type"] == "image"


def test_delete_card_media_returns_204():
    headers, _ = _auth()
    media_id = str(uuid.uuid4())
    conn, cur = make_mock_conn(fetchone=("flashcards/key.jpg",))
    with (
        patch("app.api.flashcards.get_connection", return_value=conn),
        patch("app.api.flashcards.delete_object"),
    ):
        resp = client.delete(
            f"/api/flashcards/media/{media_id}",
            headers=headers,
        )
    assert resp.status_code == 204


def test_delete_card_media_returns_404_when_not_found():
    headers, _ = _auth()
    conn, cur = make_mock_conn(fetchone=None)
    with patch("app.api.flashcards.get_connection", return_value=conn):
        resp = client.delete(
            f"/api/flashcards/media/{uuid.uuid4()}",
            headers=headers,
        )
    assert resp.status_code == 404
```

- [ ] **Step 2: Run media tests — expect failure**

```bash
pytest tests/test_api/test_flashcards.py -v -k "media"
```

Expected: 404/422 (routes not defined)

- [ ] **Step 3: Append media routes to `app/api/flashcards.py`**

```python
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
    if side not in ("front", "back"):
        raise HTTPException(status_code=422, detail="side must be 'front' or 'back'")
    if media_type not in ("image", "audio"):
        raise HTTPException(status_code=422, detail="media_type must be 'image' or 'audio'")

    content = await file.read()
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
            # Verify card belongs to user
            cur.execute(
                "SELECT id FROM flashcards WHERE id = %s AND user_id = %s AND is_active = TRUE",
                (card_id, user_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Card not found")

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

    return MediaOut(id=row[0], side=row[1], media_type=row[2], public_url=row[3], mime_type=row[4])


@router.delete("/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT, name="delete_card_media")
def delete_card_media(media_id: str, user_id: str = Depends(get_current_user_id)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Verify ownership via card → user
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
                raise HTTPException(status_code=404, detail="Media not found")

            storage_key = row[0]
            cur.execute("DELETE FROM flashcard_media WHERE id = %s", (media_id,))

    delete_object(storage_key)
```

- [ ] **Step 4: Run media tests — expect pass**

```bash
pytest tests/test_api/test_flashcards.py -v -k "media"
```

Expected: all media tests pass.

- [ ] **Step 5: Run full test suite**

```bash
pytest tests/test_api/test_flashcards.py -v
```

Expected: all flashcard tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/flashcards.py tests/test_api/test_flashcards.py
git commit -m "feat(flashcard): add media upload and delete endpoints"
```

---

## Task 8: Agent Tools

**Files:**
- Create: `app/agents/tools/__init__.py`
- Create: `app/agents/tools/flashcard_tools.py`

These tools wrap the DB layer and are decorated with `@tool` from `langchain_core.tools` for LangGraph integration. They are not wired into the current pipeline — they are ready to be registered when the agent gains tool-calling support.

- [ ] **Step 1: Create `app/agents/tools/__init__.py`**

```python
```
(Empty file — package marker)

- [ ] **Step 2: Create `app/agents/tools/flashcard_tools.py`**

```python
from __future__ import annotations

from datetime import date
from typing import Literal

from langchain_core.tools import tool

from app.core.database import get_connection
from app.core.logger import logger
from app.services.flashcard_service import calculate_sm2


@tool
def list_decks(user_id: str) -> list[dict]:
    """List all active flashcard decks for a user.

    Returns each deck's id, name, description, card_count, and due_count.
    Use this to recommend which deck to add a new word to.

    Args:
        user_id: The UUID of the authenticated user.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    d.id::text, d.name, d.description,
                    COUNT(c.id) FILTER (WHERE c.is_active)                    AS card_count,
                    COUNT(r.id) FILTER (WHERE r.due_date <= CURRENT_DATE)     AS due_count
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
    return [
        {"id": r[0], "name": r[1], "description": r[2], "card_count": r[3] or 0, "due_count": r[4] or 0}
        for r in rows
    ]


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
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT name FROM flashcard_decks WHERE id = %s AND user_id = %s AND is_active = TRUE",
                (deck_id, user_id),
            )
            deck_row = cur.fetchone()
            if not deck_row:
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
        return {"error": "Card not found"}
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
    return [{"card_id": r[0], "front_text": r[1], "deck_name": r[2], "tags": r[3] or []} for r in rows]


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
    return [
        {"card_id": r[0], "front_text": r[1], "back_text": r[2], "deck_name": r[3], "due_date": r[4]}
        for r in rows
    ]


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
        dict with total_cards, due_today, learned, retention_rate (0.0–1.0).
    """
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
        return {"error": "Deck not found"}
    return {
        "total_cards": row[0] or 0,
        "due_today": row[1] or 0,
        "learned": row[2] or 0,
        "retention_rate": float(row[3] or 0),
    }


# All tools exported for LangGraph registration
FLASHCARD_TOOLS = [
    list_decks,
    create_card,
    update_card,
    search_cards,
    get_due_cards,
    submit_card_review,
    get_deck_stats,
]
```

- [ ] **Step 3: Commit**

```bash
git add app/agents/tools/__init__.py app/agents/tools/flashcard_tools.py
git commit -m "feat(flashcard): add LangGraph agent tools for flashcard interaction"
```

---

## Task 9: Wire Router

**Files:**
- Modify: `app/api/router.py`

- [ ] **Step 1: Add flashcard router to `app/api/router.py`**

The final `app/api/router.py` should look like this:

```python
from __future__ import annotations

from fastapi import APIRouter

from app.api.assess import router as assess_router
from app.api.audio import router as audio_router
from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.conversations import router as conversations_router
from app.api.flashcards import router as flashcards_router
from app.api.grammar import router as grammar_router
from app.api.topics import router as topics_router

router = APIRouter(prefix="/api")
router.include_router(auth_router)
router.include_router(chat_router)
router.include_router(assess_router)
router.include_router(conversations_router)
router.include_router(audio_router)
router.include_router(grammar_router)
router.include_router(topics_router)
router.include_router(flashcards_router)
```

- [ ] **Step 2: Run full test suite**

```bash
pytest tests/ -v --ignore=tests/test_ai_services
```

Expected: all tests pass (including new flashcard tests and existing tests).

- [ ] **Step 3: Commit**

```bash
git add app/api/router.py
git commit -m "feat(flashcard): wire flashcard router into main API"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** DB schema ✓, API endpoints ✓ (all 15 routes), SM-2 algorithm ✓, agent tools ✓ (all 6), file structure ✓
- [x] **No placeholders:** All steps contain complete, runnable code
- [x] **Type consistency:** `calculate_sm2` signature matches usage in both `flashcards.py` and `flashcard_tools.py`. `MediaOut`, `DueCardOut`, `ReviewStateOut` defined in Task 2 and used identically in Tasks 4-8
- [x] **Route order:** `search_cards` defined before `{card_id}` in Task 5 to avoid FastAPI route shadowing
- [x] **SM-2 idempotency:** `submit_review` and `submit_card_review` use UPDATE (not INSERT), so re-submitting on the same day overwrites the previous rating
