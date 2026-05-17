# Flashcards Guide

The flashcard system uses the **SM-2 spaced-repetition algorithm** to schedule reviews. Cards are organized into decks. Media (images, audio) can be attached to card fronts or backs.

---

## Data Model

```
flashcard_decks (owned by user)
  └── flashcards (front_text, back_text, tags[])
        ├── flashcard_media (image/audio per side)
        └── flashcard_reviews (SM-2 state: due_date, interval, ease_factor)
```

---

## Decks

### Create a deck

```bash
curl -X POST http://localhost:8000/api/flashcards/decks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "IELTS Vocabulary", "description": "Key words for Part 2"}'
```

**Response 201:**
```json
{
  "id": "3fa85f64-...",
  "name": "IELTS Vocabulary",
  "description": "Key words for Part 2",
  "card_count": 0,
  "due_count": 0,
  "created_at": "2026-05-16T10:00:00Z"
}
```

### List decks

```bash
curl http://localhost:8000/api/flashcards/decks \
  -H "Authorization: Bearer <token>"
```

Returns all active decks with `card_count` (total active cards) and `due_count` (cards due today).

### Update / Delete deck

```bash
# Update
curl -X PATCH http://localhost:8000/api/flashcards/decks/3fa85f64-... \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Advanced Vocabulary"}'

# Soft-delete (returns 204)
curl -X DELETE http://localhost:8000/api/flashcards/decks/3fa85f64-... \
  -H "Authorization: Bearer <token>"
```

---

## Cards

### Add a card to a deck

```bash
curl -X POST http://localhost:8000/api/flashcards/decks/3fa85f64-.../cards \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "front_text": "eloquent",
    "back_text": "able to speak or write fluently and persuasively",
    "tags": ["vocabulary", "adjective"]
  }'
```

**Response 201:** Card object with SM-2 initial state (`due_date` = today, `interval_days` = 1, `ease_factor` = 2.5).

### List / Get / Update / Delete cards

```bash
# List cards in deck
curl http://localhost:8000/api/flashcards/decks/3fa85f64-.../cards \
  -H "Authorization: Bearer <token>"

# Get single card
curl http://localhost:8000/api/flashcards/cards/card-uuid \
  -H "Authorization: Bearer <token>"

# Update
curl -X PATCH http://localhost:8000/api/flashcards/cards/card-uuid \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"back_text": "Updated definition", "tags": ["vocabulary"]}'

# Soft-delete (returns 204)
curl -X DELETE http://localhost:8000/api/flashcards/cards/card-uuid \
  -H "Authorization: Bearer <token>"
```

### Search cards

```bash
curl "http://localhost:8000/api/flashcards/cards/search?q=eloquent&tag=vocabulary" \
  -H "Authorization: Bearer <token>"
```

Returns up to 50 results matching the keyword (ILIKE on front/back text) and/or tag. Optionally filter by `deck_id`.

---

## Reviews (SM-2 Spaced Repetition)

### Get due cards

Returns all cards where `due_date <= today` for the current user.

```bash
curl http://localhost:8000/api/flashcards/reviews/due \
  -H "Authorization: Bearer <token>"
```

### Submit a review

After reviewing a card, submit a rating. The SM-2 algorithm updates `due_date`, `interval_days`, and `ease_factor`.

```bash
curl -X POST http://localhost:8000/api/flashcards/reviews/card-uuid \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"rating": "good"}'
```

**Rating values:**

| Rating | Meaning | Effect |
|--------|---------|--------|
| `again` | Completely forgot | Resets interval to 1 day |
| `hard` | Remembered with difficulty | Short interval increase, ease_factor decreases |
| `good` | Remembered correctly | Normal interval increase |
| `easy` | Too easy | Large interval increase, ease_factor increases |

**Response 200:** Updated `ReviewStateOut` with new `due_date`, `interval_days`, `ease_factor`, `repetitions`.

> **Note:** Re-submitting a review on the same day overwrites the previous rating (idempotent).

---

## Deck Stats

```bash
curl http://localhost:8000/api/flashcards/decks/3fa85f64-.../stats \
  -H "Authorization: Bearer <token>"
```

**Response 200:**
```json
{
  "total_cards": 45,
  "due_today": 8,
  "learned": 32,
  "retention_rate": 0.87
}
```

---

## Media Attachments

Attach an image or audio clip to a card's front or back side.

```bash
# Upload media
curl -X POST http://localhost:8000/api/flashcards/cards/card-uuid/media \
  -H "Authorization: Bearer <token>" \
  -F "side=front" \
  -F "media_type=image" \
  -F "file=@word_image.png"

# Delete media (returns 204)
curl -X DELETE http://localhost:8000/api/flashcards/media/media-uuid \
  -H "Authorization: Bearer <token>"
```

Media is stored in MinIO. The `public_url` in responses is a **1-hour presigned URL**.
