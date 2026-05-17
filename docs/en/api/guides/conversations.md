# Conversations Guide

A conversation is a practice session between a user and the AI for a specific topic. Conversations hold the message history and track session metadata.

---

## Lifecycle

```
created (via POST /api/chat/respond) → active → completed | abandoned
                                                             ↓
                                                    soft-deleted (deleted_at set)
```

- **Max 5 active conversations per topic per user.** Session numbering counts total ever (including deleted).
- Conversations are soft-deleted — they are filtered out of list responses but remain in the DB.

---

## List Conversations

```bash
curl http://localhost:8000/api/conversations \
  -H "Authorization: Bearer <token>"
```

**Response 200:**
```json
{
  "conversations": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "title": null,
      "status": "active",
      "started_at": "2026-05-16T10:00:00Z",
      "ended_at": null,
      "topic_id": "abc...",
      "topic_code": "hometown",
      "cleared_at": null
    }
  ]
}
```

---

## Get Conversations for a Topic

Returns up to 5 conversations for a topic, with session numbers.

```bash
curl "http://localhost:8000/api/conversations/for-topic?topic_code=hometown" \
  -H "Authorization: Bearer <token>"
```

**Response 200:**
```json
{
  "topic_code": "hometown",
  "topic_title": "Hometown",
  "conversations": [
    {
      "id": "3fa85f64-...",
      "title": null,
      "status": "active",
      "session_number": 3,
      "started_at": "2026-05-16T10:00:00Z",
      "updated_at": "2026-05-16T10:05:00Z"
    }
  ],
  "total": 3,
  "limit_reached": false
}
```

---

## Get Statistics

```bash
curl http://localhost:8000/api/conversations/stats \
  -H "Authorization: Bearer <token>"
```

**Response 200:**
```json
{
  "sessions": [
    {
      "id": "3fa85f64-...",
      "topic": "Hometown",
      "topic_code": "hometown",
      "started_at": "2026-05-16T10:00:00Z",
      "duration_ms": 720000,
      "avg_score": 78.5,
      "user_message_count": 18,
      "scores": {
        "pronunciation": 77.5,
        "fluency": 78.0,
        "accuracy": 85.0
      }
    }
  ]
}
```

---

## Get Messages with Pronunciation Scores

```bash
curl http://localhost:8000/api/conversations/3fa85f64-.../messages-with-scores \
  -H "Authorization: Bearer <token>"
```

**Response 200:**
```json
{
  "conversation_id": "3fa85f64-...",
  "messages": [
    {
      "id": "...",
      "role": "user",
      "input_mode": "audio",
      "text_content": "I grew up in a small coastal town.",
      "created_at": "2026-05-16T10:01:00Z",
      "suggestions": [],
      "audio_url": "/api/audio/user_input/...",
      "assistant_audio_url": null,
      "score": {
        "overall_score": 82.5,
        "accuracy_score": 85.0,
        "fluency_score": 78.0,
        "completeness_score": 90.0,
        "prosody_score": 77.5,
        "words": []
      }
    }
  ]
}
```

---

## Update Conversation

Mark a conversation as finished by setting `ended_at = NOW()`. No request body is required.

```bash
curl -X PATCH http://localhost:8000/api/conversations/3fa85f64-... \
  -H "Authorization: Bearer <token>"
```

**Response 204** (no content). This enables duration calculation for dashboard statistics.

---

## Clear Message History

Clears visible message history from this point forward (sets `cleared_at`). Old messages are not deleted — they just won't appear in future LLM context or message-with-scores responses.

```bash
curl -X POST http://localhost:8000/api/conversations/3fa85f64-.../clear \
  -H "Authorization: Bearer <token>"
```

**Response 204** (no content).

---

## Delete Conversation

Soft-deletes the conversation (sets `deleted_at`). Does not count against the 5-per-topic active limit.

```bash
curl -X DELETE http://localhost:8000/api/conversations/3fa85f64-... \
  -H "Authorization: Bearer <token>"
```

**Response 204** (no content).
