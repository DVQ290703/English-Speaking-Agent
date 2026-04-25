# API Documentation

Tai lieu nay mo ta API backend hien tai trong `app/main.py` va `app/api/routes.py`.

## Base URLs

- API: `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/docs`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`

## Authentication

Tat ca endpoint trong `/api/*` tru `POST /api/auth/register` va `POST /api/auth/login` deu can Bearer token.

Header:

```http
Authorization: Bearer <access_token>
```

JWT hien tai:

- signed with `HS256`
- contains `sub`, `email`, `iat`, `nbf`, `exp`
- invalid or missing required claims returns `401`

## Runtime and Storage

Backend hien tai dung:

- FastAPI
- PostgreSQL
- MinIO for audio objects
- Groq STT + LLM
- ElevenLabs TTS
- Azure Speech for pronunciation assessment

Audio khong luu tren local disk theo flow chinh. User audio va assistant audio duoc upload vao MinIO, sau do API tra ve presigned URL ngan han.
Trong local Docker, URL nay co the khong browser-reachable neu endpoint MinIO dang dung hostname noi bo.

## Current Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | No | Basic health check |
| `POST` | `/api/auth/register` | No | Create user and return access token |
| `POST` | `/api/auth/login` | No | Login and return access token |
| `GET` | `/api/auth/me` | Yes | Get current user profile |
| `POST` | `/api/chat/respond` | Yes | Send text or audio and get assistant reply |
| `POST` | `/api/assess` | Yes | Run pronunciation assessment on WAV/PCM audio |
| `GET` | `/api/conversations` | Yes | List current user's conversations |
| `GET` | `/api/conversations/{conversation_id}/messages` | Yes | Get messages for one conversation |

## 1. `GET /health`

Response:

```json
{
  "status": "ok"
}
```

The app also attaches security headers such as:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Cache-Control: no-store`

## 2. `POST /api/auth/register`

Creates a new active user and immediately returns an access token.

Request:

```json
{
  "email": "newuser@example.com",
  "password": "StrongPass123!",
  "display_name": "New User",
  "english_level": "B1"
}
```

Rules:

- `email` must be a valid email address
- `password` must be at least 12 characters and include:
  - uppercase
  - lowercase
  - a digit
  - a symbol
- `display_name` is optional
- `english_level` is optional

Response:

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "uuid",
    "email": "newuser@example.com",
    "display_name": "New User",
    "english_level": "B1"
  }
}
```

Common errors:

- `400`: weak password
- `400`: email already registered
- `422`: malformed request body

## 3. `POST /api/auth/login`

Request:

```json
{
  "email": "alice@example.com",
  "password": "Password123!"
}
```

Response shape is the same as register.

Common errors:

- `401`: invalid email or password

## 4. `GET /api/auth/me`

Returns the active user resolved from the bearer token.

Response:

```json
{
  "id": "uuid",
  "email": "alice@example.com",
  "display_name": "Alice Nguyen",
  "english_level": "B1"
}
```

Common errors:

- `401`: token invalid
- `401`: user not found or inactive

## 5. `POST /api/chat/respond`

Consumes `multipart/form-data`.

Fields:

- `text`: optional string
- `history`: optional JSON-encoded array of prior messages
- `topic`: optional topic label/code, max 80 chars
- `audio_file`: optional uploaded audio
- `conversation_id`: optional UUID to continue an existing conversation

At least one of `text` or `audio_file` must produce non-empty user input.

Supported chat audio content types:

- `audio/webm`
- `audio/wav`
- `audio/x-wav`
- `audio/wave`
- `audio/pcm`
- `audio/mp4`
- `audio/mpeg`
- `audio/ogg`

Limits and validation:

- max upload size: `25 MB`
- `text` max length: `4000`
- `history` max length: `50000`
- declared audio format must match file signature
- invalid `conversation_id` returns `400`
- a conversation owned by another user returns `404`

Example with text:

```bash
curl -X POST "http://127.0.0.1:8000/api/chat/respond" \
  -H "Authorization: Bearer <token>" \
  -F "text=Tell me about IELTS speaking" \
  -F "topic=ielts1"
```

Example with audio:

```bash
curl -X POST "http://127.0.0.1:8000/api/chat/respond" \
  -H "Authorization: Bearer <token>" \
  -F "topic=daily_conversation" \
  -F "audio_file=@recording.webm;type=audio/webm"
```

Response:

```json
{
  "user_input": "Tell me about IELTS speaking",
  "response_text": "Sure. IELTS speaking is scored on fluency, vocabulary, grammar, and pronunciation.",
  "audio_base64": "",
  "audio_mime": "audio/mpeg",
  "user_audio_url": "https://minio-presigned-url-for-user-audio",
  "assistant_audio_url": "https://minio-presigned-url-for-assistant-audio",
  "conversation_id": "uuid"
}
```

Notes:

- `audio_base64` is only included when the generated assistant audio is small enough to inline
- if assistant audio upload succeeds, the backend also returns `assistant_audio_url`
- `assistant_audio_url` browser reachability depends on your MinIO endpoint/network setup
- user audio may be transcribed through STT if no `text` is provided

Common errors:

- `400`: no input provided
- `400`: invalid `conversation_id`
- `404`: conversation not found
- `413`: text/history/topic/audio exceeds limit
- `415`: unsupported audio type or mismatched file signature

## 6. `POST /api/assess`

Consumes `multipart/form-data`.

Fields:

- `audio_file`: required
- `reference_text`: optional, max 500 chars
- `language`: optional, only `en-US` or `en-GB`

Supported formats:

- `audio/wav`
- `audio/x-wav`
- `audio/wave`
- `audio/pcm`

Limits:

- max upload size: `25 MB`

If `reference_text` is omitted, the service runs in unscripted mode.

Example:

```bash
curl -X POST "http://127.0.0.1:8000/api/assess" \
  -H "Authorization: Bearer <token>" \
  -F "language=en-US" \
  -F "audio_file=@sample.wav;type=audio/wav"
```

Response:

```json
{
  "mode": "unscripted",
  "recognized_text": "Hello, my name is Alice.",
  "pron_score": 91.5,
  "accuracy_score": 95.0,
  "fluency_score": 90.0,
  "completeness_score": null,
  "prosody_score": 85.0,
  "words": [
    {
      "word": "hello",
      "accuracy_score": 95.0,
      "error_type": "None",
      "syllables": [],
      "phonemes": []
    }
  ]
}
```

Common errors:

- `400`: empty audio
- `400`: unsupported language
- `413`: audio too large
- `415`: unsupported or mismatched audio format
- `502`: Azure runtime failure
- `503`: Azure service not configured

## 7. `GET /api/conversations`

Lists up to 100 conversations for the current user.

Response:

```json
{
  "conversations": [
    {
      "id": "uuid",
      "title": "Chat on daily_conversation",
      "status": "active",
      "started_at": "2026-04-24T12:00:00Z",
      "ended_at": null,
      "topic_id": "uuid"
    }
  ]
}
```

## 8. `GET /api/conversations/{conversation_id}/messages`

Returns messages in ascending `created_at` order.

Response:

```json
{
  "conversation_id": "uuid",
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "input_mode": "audio",
      "text_content": "Hello",
      "created_at": "2026-04-24T12:00:00Z",
      "audio_url": "https://minio-presigned-url"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "input_mode": "text",
      "text_content": "Hi, how can I help you today?",
      "created_at": "2026-04-24T12:00:02Z",
      "audio_url": "https://minio-presigned-url"
    }
  ]
}
```

Common errors:

- `400`: invalid UUID
- `404`: conversation not found or not owned by current user

## 9. Database Shape

The current schema is conversation-oriented, not practice-session oriented.

Main tables:

- `users`
- `topics`
- `conversations`
- `turns`
- `messages`
- `audio_assets`
- `pronunciation_assessments`
- `pronunciation_word_details`
- `agent_feedback`
- `daily_progress`

See:

- `db_schema/schema.sql`
- `db_schema/seed.sql`

## 10. Notes for Frontend Integration

- The frontend currently calls `/api/chat/respond` and `/api/assess`
- `assistant_audio_url` is a presigned object URL; browser reachability depends on your MinIO/network setup
- `audio_base64` should be treated as optional
- for local Docker setups, frontend playback may prefer inline `audio_base64` or local blob URLs over MinIO URLs
- registration rules are stricter than the seeded local demo users in `seed.sql`
