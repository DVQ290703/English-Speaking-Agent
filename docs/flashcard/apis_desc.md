# Flashcard API Documentation

Base path: `/flashcards`
All endpoints require a valid JWT (Bearer token). The token is used to scope all data to the authenticated user.

---

## Schemas

### DeckOut
| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Deck identifier |
| `name` | string | Deck name |
| `description` | string \| null | Optional description |
| `card_count` | integer | Number of active cards |
| `due_count` | integer | Cards due for review today |
| `created_at` | datetime | Creation timestamp |

### CardOut
| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Card identifier |
| `deck_id` | string (UUID) | Parent deck |
| `front_text` | string | Front side text |
| `back_text` | string | Back side text |
| `tags` | string[] | Tag list |
| `created_at` | datetime | Creation timestamp |
| `media` | MediaOut[] | Attached media items |

### MediaOut
| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Media identifier |
| `side` | `"front"` \| `"back"` | Card side the media is attached to |
| `media_type` | `"image"` \| `"audio"` | Media category |
| `public_url` | string \| null | Presigned MinIO URL (1-hour expiry) or static public URL |
| `mime_type` | string \| null | MIME type (e.g. `image/jpeg`) |

### DueCardOut
| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Card identifier |
| `front_text` | string | Front side text |
| `back_text` | string | Back side text |
| `deck_name` | string | Name of the parent deck |
| `due_date` | date | Date the card is due |
| `media` | MediaOut[] | Attached media items |

### ReviewStateOut
| Field | Type | Description |
|-------|------|-------------|
| `card_id` | string (UUID) | Card identifier |
| `due_date` | date | Next review date |
| `interval_days` | integer | Days until next review |
| `ease_factor` | float | SM-2 ease factor |
| `repetitions` | integer | Number of successful reviews |

### DeckStatsOut
| Field | Type | Description |
|-------|------|-------------|
| `total_cards` | integer | Total active cards in deck |
| `due_today` | integer | Cards due today |
| `learned` | integer | Cards reviewed at least once |
| `retention_rate` | float | Ratio of good/easy ratings in the last 30 days (0.0–1.0) |

---

## Decks

### List Decks
```
GET /flashcards/decks
```
Returns all active decks for the current user with live card and due counts.

**Response** `200 OK` — `DeckOut[]`

---

### Create Deck
```
POST /flashcards/decks
```
**Request body** (`application/json`)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Deck name |
| `description` | string | no | Optional description |

**Response** `201 Created` — `DeckOut`

---

### Get Deck
```
GET /flashcards/decks/{deck_id}
```
Returns a single deck with live card and due counts.

**Path params**
- `deck_id` — UUID of the deck

**Response** `200 OK` — `DeckOut`
**Response** `404 Not Found` — deck does not exist or belongs to another user

---

### Update Deck
```
PATCH /flashcards/decks/{deck_id}
```
Partial update. Omitted fields are left unchanged.

**Path params**
- `deck_id` — UUID of the deck

**Request body** (`application/json`)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | no | New deck name |
| `description` | string | no | New description |

**Response** `200 OK` — `DeckOut`
**Response** `404 Not Found`

---

### Delete Deck
```
DELETE /flashcards/decks/{deck_id}
```
Soft-deletes the deck. Cards are preserved in the database but excluded from all queries.

**Path params**
- `deck_id` — UUID of the deck

**Response** `204 No Content`
**Response** `404 Not Found`

---

### Get Deck Stats
```
GET /flashcards/decks/{deck_id}/stats
```
Returns aggregate statistics for the deck.

**Path params**
- `deck_id` — UUID of the deck

**Response** `200 OK` — `DeckStatsOut`
**Response** `404 Not Found`

---

## Cards

### List Cards in Deck
```
GET /flashcards/decks/{deck_id}/cards
```
Lists active cards in a deck ordered by creation date (newest first). Includes media with presigned URLs.

**Path params**
- `deck_id` — UUID of the deck

**Query params**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | integer | `50` | Max results to return |
| `offset` | integer | `0` | Pagination offset |

**Response** `200 OK` — `CardOut[]`

---

### Create Card (text only)
```
POST /flashcards/decks/{deck_id}/cards
```
Creates a card with text fields only. Use the with-media endpoint to attach files at creation time.

**Path params**
- `deck_id` — UUID of the deck

**Request body** (`application/json`)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `front_text` | string | yes | Front side text |
| `back_text` | string | yes | Back side text |
| `tags` | string[] | no | Tag list (default `[]`) |

**Response** `201 Created` — `CardOut`
**Response** `404 Not Found` — deck not found

---

### Create Card with Media
```
POST /flashcards/decks/{deck_id}/cards/with-media
```
Creates a card and uploads one or more media files in a single atomic request.

**Path params**
- `deck_id` — UUID of the deck

**Request body** (`multipart/form-data`)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `front_text` | string | yes | Front side text |
| `back_text` | string | yes | Back side text |
| `tags[]` | string | no | Tags (repeat field for multiple) |
| `files[]` | file | no | Binary file data (repeat for multiple) |
| `sides[]` | string | no | `"front"` or `"back"` per file |
| `media_types[]` | string | no | `"image"` or `"audio"` per file |

`files`, `sides`, and `media_types` must have equal length.

**Constraints**
- Max file size: 10 MB per file
- Allowed image MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Allowed audio MIME types: `audio/mpeg`, `audio/mp4`, `audio/webm`, `audio/ogg`, `audio/wav`

**Response** `201 Created` — `CardOut`
**Response** `404 Not Found` — deck not found
**Response** `413 Request Entity Too Large` — a file exceeds 10 MB
**Response** `415 Unsupported Media Type` — disallowed MIME type
**Response** `422 Unprocessable Entity` — array length mismatch or invalid `side`/`media_type` value

---

### Search Cards
```
GET /flashcards/cards/search
```
Full-text search across all user cards. Returns up to 50 results ordered by creation date.

**Query params**
| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Keyword to match against `front_text` or `back_text` (case-insensitive) |
| `tag` | string | Filter cards that contain this exact tag |
| `deck_id` | string (UUID) | Restrict search to a specific deck |

All params are optional; omitting all returns the 50 most recent cards.

**Response** `200 OK` — `CardOut[]`

---

### Get Card
```
GET /flashcards/cards/{card_id}
```
Returns a single card with all attached media and presigned URLs.

**Path params**
- `card_id` — UUID of the card

**Response** `200 OK` — `CardOut`
**Response** `404 Not Found`

---

### Update Card
```
PATCH /flashcards/cards/{card_id}
```
Partial update. Omitted fields are left unchanged.

**Path params**
- `card_id` — UUID of the card

**Request body** (`application/json`)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `front_text` | string | no | New front text |
| `back_text` | string | no | New back text |
| `tags` | string[] | no | Replace tag list |

**Response** `200 OK` — `CardOut`
**Response** `404 Not Found`

---

### Delete Card
```
DELETE /flashcards/cards/{card_id}
```
Soft-deletes a card. Review schedule is preserved but the card is excluded from all queries.

**Path params**
- `card_id` — UUID of the card

**Response** `204 No Content`
**Response** `404 Not Found`

---

## Reviews

### Get Due Cards
```
GET /flashcards/reviews/due
```
Returns cards due for review today, ordered by due date ascending.

**Query params**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `deck_id` | string (UUID) | — | Restrict to a specific deck |
| `limit` | integer | `20` | Max cards to return |

**Response** `200 OK` — `DueCardOut[]`

---

### Submit Review
```
POST /flashcards/reviews/{card_id}
```
Rates a card after review. Applies the SM-2 spaced-repetition algorithm and persists the updated schedule.

Idempotent: re-submitting on the same day overwrites the previous rating.

**Path params**
- `card_id` — UUID of the card

**Request body** (`application/json`)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rating` | `"again"` \| `"hard"` \| `"good"` \| `"easy"` | yes | Review quality rating |

**Rating semantics**
| Rating | Meaning |
|--------|---------|
| `again` | Complete blackout — reset interval |
| `hard` | Correct with significant difficulty |
| `good` | Correct with some hesitation |
| `easy` | Perfect recall |

**Response** `200 OK` — `ReviewStateOut`
**Response** `404 Not Found` — card not found or not scheduled for this user

---

## Media

### Upload Card Media
```
POST /flashcards/cards/{card_id}/media
```
Uploads a single image or audio file and attaches it to a card side.

**Path params**
- `card_id` — UUID of the card

**Request body** (`multipart/form-data`)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `side` | string | yes | `"front"` or `"back"` |
| `media_type` | string | yes | `"image"` or `"audio"` |
| `file` | file | yes | Binary file data |

**Constraints**
- Max file size: 10 MB
- Allowed image MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Allowed audio MIME types: `audio/mpeg`, `audio/mp4`, `audio/webm`, `audio/ogg`, `audio/wav`

**Response** `201 Created` — `MediaOut`
**Response** `404 Not Found` — card not found
**Response** `413 Request Entity Too Large`
**Response** `415 Unsupported Media Type`
**Response** `422 Unprocessable Entity` — invalid `side` or `media_type`

---

### Delete Media
```
DELETE /flashcards/media/{media_id}
```
Deletes a media record and removes the file from MinIO storage. Verifies ownership through the parent card.

**Path params**
- `media_id` — UUID of the media item

**Response** `204 No Content`
**Response** `404 Not Found` — media not found or belongs to another user's card
