# Flashcard Feature — Design Spec

**Date:** 2026-05-07
**Branch:** feat/flashcard
**Scope:** Backend only (FastAPI + PostgreSQL + LangGraph agent tools)

---

## Overview

A spaced-repetition flashcard system integrated into the English Speaking Agent. Users can manage decks and cards via REST API. The AI agent can interact with the flashcard system on user request — e.g., "add the word 'school' to my flashcard" — including recommending which deck to add to.

---

## 1. Database Schema

All tables use UUID PKs, `created_at`/`updated_at` TIMESTAMPTZ with the existing `set_updated_at()` trigger, and soft deletes via `is_active`.

### `flashcard_decks`

```sql
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
```

### `flashcards`

```sql
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

CREATE INDEX IF NOT EXISTS idx_flashcards_deck_id  ON flashcards(deck_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_user_id  ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_tags     ON flashcards USING GIN(tags);
CREATE TRIGGER trg_flashcards_updated_at
    BEFORE UPDATE ON flashcards
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### `flashcard_media`

Follows the same pattern as `audio_assets`.

```sql
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
```

### `flashcard_reviews`

SM-2 scheduling state — one row per (card, user) pair.

```sql
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

---

## 2. API Specification

All endpoints are under `/api/flashcards`, require JWT authentication, and exclude soft-deleted records.

### Decks

| Method | Path | Function | Description |
|---|---|---|---|
| `GET` | `/api/flashcards/decks` | `list_decks` | List user's active decks with card count + due count |
| `POST` | `/api/flashcards/decks` | `create_deck` | Create a deck |
| `GET` | `/api/flashcards/decks/{deck_id}` | `get_deck` | Get a single deck |
| `PATCH` | `/api/flashcards/decks/{deck_id}` | `update_deck` | Update name/description |
| `DELETE` | `/api/flashcards/decks/{deck_id}` | `delete_deck` | Soft delete a deck |

### Cards

| Method | Path | Function | Description |
|---|---|---|---|
| `GET` | `/api/flashcards/decks/{deck_id}/cards` | `list_cards` | List cards in a deck (paginated) |
| `POST` | `/api/flashcards/decks/{deck_id}/cards` | `create_card` | Create a card (initializes SM-2 schedule) |
| `GET` | `/api/flashcards/cards/{card_id}` | `get_card` | Get a single card with media |
| `PATCH` | `/api/flashcards/cards/{card_id}` | `update_card` | Update front/back/tags |
| `DELETE` | `/api/flashcards/cards/{card_id}` | `delete_card` | Soft delete a card |
| `GET` | `/api/flashcards/cards/search` | `search_cards` | Search by `q` (ILIKE on front/back text) and/or `tag`, optional `deck_id` |

### Media

| Method | Path | Function | Description |
|---|---|---|---|
| `POST` | `/api/flashcards/cards/{card_id}/media` | `upload_card_media` | Upload image or audio (multipart: `side`, `media_type`, `file`) |
| `DELETE` | `/api/flashcards/media/{media_id}` | `delete_card_media` | Delete a media item |

### Reviews

| Method | Path | Function | Description |
|---|---|---|---|
| `GET` | `/api/flashcards/reviews/due` | `get_due_cards` | Get cards due today (optional `deck_id`, `limit`) |
| `POST` | `/api/flashcards/reviews/{card_id}` | `submit_review` | Submit rating: `again`/`hard`/`good`/`easy` |
| `GET` | `/api/flashcards/decks/{deck_id}/stats` | `get_deck_stats` | Total cards, due count, retention rate |

---

## 3. SM-2 Spaced Repetition Algorithm

### Rating → Quality Score

| Rating | Quality (q) |
|---|---|
| `again` | 0 |
| `hard` | 2 |
| `good` | 3 |
| `easy` | 5 |

### Scheduling Logic

```python
def calculate_sm2(rating: str, repetitions: int, ease_factor: float, interval_days: int):
    q = {"again": 0, "hard": 2, "good": 3, "easy": 5}[rating]

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
    due_date = date.today() + timedelta(days=interval_days)

    return repetitions, ease_factor, interval_days, due_date
```

### Initial State (new card)

```
repetitions  = 0
ease_factor  = 2.5
interval_days = 1
due_date     = today
```

`submit_review` is idempotent: re-submitting on the same day overwrites the previous result.

---

## 4. Agent Tool Definitions

Tools registered in the LangGraph agent, callable on user request (e.g. "add 'school' to my flashcard").

```python
def list_decks(user_id: str) -> list[dict]:
    """List all active decks for a user with card count and due count.
    Used by agent to recommend which deck to add a word to."""

def get_due_cards(user_id: str, deck_id: str | None = None, limit: int = 20) -> list[dict]:
    """Retrieve cards due for review today.
    Returns card id, front_text, back_text, deck name, due_date."""

def create_card(user_id: str, deck_id: str, front_text: str, back_text: str, tags: list[str] | None = None) -> dict:
    """Create a new flashcard in a deck. Initializes SM-2 schedule.
    Returns created card id and deck name."""

def update_card(user_id: str, card_id: str, front_text: str | None = None, back_text: str | None = None, tags: list[str] | None = None) -> dict:
    """Update an existing card's content."""

def search_cards(user_id: str, query: str | None = None, tag: str | None = None, deck_id: str | None = None) -> list[dict]:
    """Search cards by keyword (front/back text) or tag.
    Returns matching card id, front_text, deck name, tags."""

def submit_card_review(user_id: str, card_id: str, rating: Literal["again", "hard", "good", "easy"]) -> dict:
    """Submit a review rating. Recalculates SM-2 schedule.
    Returns updated due_date, interval_days, ease_factor.
    Idempotent: re-submitting on same day overwrites previous result."""

def get_deck_stats(user_id: str, deck_id: str) -> dict:
    """Returns total cards, due today, learned cards (repetitions > 0),
    and retention rate (% rated good/easy in last 30 days)."""
```

---

## 5. File Structure

```
app/
  api/
    flashcards.py          # all flashcard routes
  services/
    flashcard_service.py   # SM-2 logic, DB operations
  agents/
    tools/
      flashcard_tools.py   # LangGraph tool definitions
db_schema/
  flashcard_schema.sql     # new tables (applied after schema.sql)
tests/
  test_flashcard_api.py
  test_sm2.py
```

---

## Constraints

- SM-2 correctness is the top priority — all scheduling logic lives in `flashcard_service.py`, not in the API layer
- All endpoints are stateless and JWT-auth-ready
- Agent tools are idempotent where possible (`submit_card_review`)
- Soft deletes only — no hard deletes on decks or cards
- Media storage follows the existing `audio_assets` pattern
