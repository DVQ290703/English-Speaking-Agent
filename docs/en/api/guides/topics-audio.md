# Topics & Audio Guide

---

## GET /api/topics/get_categories_topics

Returns all active categories with their active topics, ordered by `sort_order`.

No authentication required.

```bash
curl http://localhost:8000/api/topics/get_categories_topics
```

**Response 200:**
```json
[
  {
    "code": "daily_life",
    "title": "Daily Life",
    "sort_order": 1,
    "topics": [
      {
        "code": "hometown",
        "title": "Hometown",
        "description": "Talk about where you grew up.",
        "difficulty_level": "beginner",
        "sort_order": 1
      },
      {
        "code": "daily_routine",
        "title": "Daily Routine",
        "description": "Describe your typical day.",
        "difficulty_level": "beginner",
        "sort_order": 2
      }
    ]
  }
]
```

**Difficulty levels:** `beginner`, `intermediate`, `advanced`

Use the `topic.code` value as the `topic` field when calling `POST /api/chat/respond`.

---

## GET /api/audio/{storage_key}

Streams a stored audio file from MinIO. Used to play back TTS-generated assistant responses.

**Requires authentication.** The `storage_key` comes from the `assistant_audio_url` field in a `/api/chat/respond` response (strip the `/api/audio/` prefix).

```bash
curl http://localhost:8000/api/audio/tts/conv-id/msg-id.mp3 \
  -H "Authorization: Bearer <token>" \
  --output response_audio.mp3
```

**Response:** Binary audio stream with `Content-Type: audio/mpeg` (or actual MIME type from MinIO).

**Cache:** Responses include `Cache-Control: private, max-age=3600` (1 hour). The browser will not re-fetch the same audio within that window.

**Errors:**
- `404` — audio file not found in MinIO (may have been deleted or the key is incorrect)
- `401` — missing or invalid JWT
