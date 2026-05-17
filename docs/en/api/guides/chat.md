# Chat Guide

The chat endpoint is the core of the application. It accepts text or audio from the user, runs the LangGraph agent pipeline, and returns the AI's response with optional TTS audio.

---

## POST /api/chat/respond

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | No* | User's text input (max 4,000 chars) |
| `audio_file` | file | No* | User's audio (mp3/wav/ogg/webm/m4a, max 25 MB) |
| `category` | string | No | Category code for the topic (max 80 chars) |
| `topic` | string | No | Topic code (max 120 chars) |
| `voice_gender` | string | No | TTS voice gender: `male` or `female` |
| `voice_accent` | string | No | TTS voice accent: `british` or `american` |
| `conversation_id` | string | No | UUID of an existing conversation to continue |

\* Either `text` or `audio_file` must be provided, not both.

**Conversation limit:** A user can have at most **5 active conversations per topic**. Attempting to create a 6th returns HTTP 400.

### Example — Text input

```bash
curl -X POST http://localhost:8000/api/chat/respond \
  -H "Authorization: Bearer <token>" \
  -F "text=Tell me about your hometown." \
  -F "topic=hometown" \
  -F "voice_gender=female" \
  -F "voice_accent=british"
```

### Example — Audio input

```bash
curl -X POST http://localhost:8000/api/chat/respond \
  -H "Authorization: Bearer <token>" \
  -F "audio_file=@recording.webm" \
  -F "topic=hometown" \
  -F "conversation_id=3fa85f64-5717-4562-b3fc-2c963f66afa6"
```

### Response 200

```json
{
  "user_input": "I grew up in a small coastal town.",
  "response_text": "That's interesting! Tell me more about the local food there.",
  "audio_base64": "",
  "audio_mime": "audio/mime",
  "user_audio_url": null,
  "assistant_audio_url": "http://localhost:8000/api/audio/tts/abc123.mp3",
  "conversation_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "user_message_id": "7ab12c34-...",
  "grammar_summary": {
    "error_count": 0,
    "has_errors": false,
    "flagged_spans": []
  },
  "grammar_detail": null,
  "tool_steps": [],
  "suggestions": ["Tell me about the weather there.", "What do you miss most?"]
}
```

**Audio delivery:** If the TTS audio is less than 512 KB, it is returned inline as `audio_base64` (base64-encoded) and `assistant_audio_url` will be `null`. Otherwise, `assistant_audio_url` contains a path to stream it via `GET /api/audio/{key}` and `audio_base64` will be an empty string.

### LangGraph Pipeline

Each call to `/respond` runs through these nodes in order:

1. **Preflight** — Single LLM call: safety check + intent detection (does the user want a flashcard action?)
2. **Respond** — Main LLM call with tool bindings (flashcard tools, grammar tools)
3. **Tools** (optional) — Executes tool calls (create deck, review card, etc.) if the LLM requested them
4. **TTS** — Synthesizes the response text via ElevenLabs

The pipeline has a maximum of 5 tool-call iterations to prevent infinite loops.

### Guardrails

- **Input:** Injection detection, rate limiting per user, input validation, max length enforcement
- **Output:** PII redaction via regex (phone numbers, emails, SSNs, credit card numbers)
- Guardrail violations return HTTP 400 (invalid input / injection detected) or HTTP 429 (rate limited)

---

## POST /api/chat/transcribe

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio_file` | file | Yes | Audio to transcribe (mp3/wav/ogg/webm/m4a, max 25 MB) |

```bash
curl -X POST http://localhost:8000/api/chat/transcribe \
  -H "Authorization: Bearer <token>" \
  -F "audio_file=@recording.webm"
```

**Response 200:**
```json
{ "text": "I grew up in a small coastal town." }
```
