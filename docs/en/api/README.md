# API Reference

**Base URL:** `http://localhost:8000` (local) · Set via `APP_BASE_URL` env var in production.

**OpenAPI Spec:** [`openapi.yaml`](./openapi.yaml) — import into Postman, Insomnia, or view at `/docs` when running locally.

---

## Authentication

All endpoints except `GET /health` require a Bearer JWT.

**Obtain a token:**
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "YourPassword1!"}'
```

**Response:**
```json
{ "access_token": "<jwt>", "token_type": "bearer" }
```

**Use the token:**
```
Authorization: Bearer <jwt>
```

**Token details:** HS256, 1-hour expiry. Claims: `sub` (user UUID), `email`, `iat`, `nbf`, `exp`.

---

## Password Policy

Passwords must be **at least 12 characters** and include:
- One uppercase letter (A–Z)
- One lowercase letter (a–z)
- One digit (0–9)
- One symbol (e.g. `!@#$%`)

---

## Content Types

| Endpoints | Content-Type |
|-----------|-------------|
| Most endpoints | `application/json` |
| `POST /api/chat/respond` | `multipart/form-data` |
| `POST /api/assess` | `multipart/form-data` |
| `GET /api/audio/{key}` | Binary response (audio stream) |

---

## Standard Error Shape

```json
{ "detail": "Human-readable error message" }
```

Validation errors (HTTP 422):
```json
{
  "detail": [
    { "loc": ["body", "email"], "msg": "field required", "type": "value_error.missing" }
  ]
}
```

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | Success (no content) |
| 400 | Bad request / validation failed |
| 401 | Missing or invalid JWT |
| 403 | Authenticated but not authorized for this resource |
| 404 | Resource not found |
| 413 | Request payload too large |
| 422 | Unprocessable entity (Pydantic validation error) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Rate Limiting

Rate limiting is enforced per-user in the input guardrail middleware. Limits are configured via env vars. Exceeding the limit returns HTTP 429.

---

## Endpoint Groups

| Tag | Path Prefix | Guide |
|-----|-------------|-------|
| Auth | `/api/auth` | [authentication.md](./guides/authentication.md) |
| Chat | `/api/chat` | [chat.md](./guides/chat.md) |
| Conversations | `/api/conversations` | [conversations.md](./guides/conversations.md) |
| Assessment | `/api/assess` | [pronunciation.md](./guides/pronunciation.md) |
| Grammar | `/api/grammar` | [pronunciation.md](./guides/pronunciation.md) |
| Flashcards | `/api/flashcards` | [flashcards.md](./guides/flashcards.md) |
| Topics | `/api/topics` | [topics-audio.md](./guides/topics-audio.md) |
| Audio | `/api/audio` | [topics-audio.md](./guides/topics-audio.md) |
| OAuth | `/api/auth/oauth` | [authentication.md](./guides/authentication.md) |
| Health | `/health` | No auth required |

> **Agent pipeline & services:** See [`docs/agent/`](../agent/README.md) for the LangGraph pipeline, Groq LLM/STT, ElevenLabs TTS, and Azure Speech docs.
