# ElevenLabs TTS Service

Synthesizes the AI's text response into speech audio in the `tts` node of the LangGraph pipeline.

**Source:** `app/services/elevenlabs_tts.py`
**Model:** `eleven_flash_v3_2_5` (default)
**Provider:** [ElevenLabs](https://elevenlabs.io) via direct HTTP API

---

## Configuration

| Env Var | Required | Default | Description |
|---------|----------|---------|-------------|
| `ELEVENLABS_API_KEY` | Yes | — | ElevenLabs API key. Returns `b""` silently if missing. |
| `ELEVENLABS_MODEL_ID` | No | `eleven_flash_v3_2_5` | TTS model. Flash models are optimized for low latency. |
| `ELEVENLABS_VOICE_ID` | No | — | Default/fallback voice ID |
| `ELEVENLABS_VOICE_ID_male` | No | — | Voice used when `voice_gender="male"` |
| `ELEVENLABS_VOICE_ID_female` | No | — | Voice used when `voice_gender="female"` |

At least one of the voice ID env vars should be set, otherwise synthesis returns `b""`.

---

## How It's Used

The service is initialized as part of `get_voice_agent_pipeline()`:

```python
tts_service = ElevenLabsTTS()
pipeline = VoiceAgentPipeline(llm_service, tts_service)
```

The `tts` node calls `convert_text_to_speech()` with the `voice_gender` from the request. The resulting `audio_bytes` are then uploaded to MinIO and either:
- Returned **inline as base64** if < 512 KB
- Returned as a **streaming URL** (`GET /api/audio/{key}`) if ≥ 512 KB

The `tts` node is **skipped entirely** when the pipeline ran tool calls — tool responses are text-only.

---

## `convert_text_to_speech()`

```python
def convert_text_to_speech(
    text: str,
    voice_gender: str | None = None,
) -> bytes
```

1. **Resolves voice ID** — checks `voice_gender` against `ELEVENLABS_VOICE_ID_male` / `ELEVENLABS_VOICE_ID_female`, falls back to `ELEVENLABS_VOICE_ID`
2. **HTTP POST** to `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`:
   ```json
   { "text": "...", "model_id": "eleven_flash_v3_2_5" }
   ```
   Headers: `xi-api-key`, `Accept: audio/mpeg`, `Content-Type: application/json`
3. **Streams** the response in 64 KB chunks
4. **Validates** `Content-Type` starts with `audio/` and `Content-Length` matches bytes received
5. Returns raw MP3 bytes

---

## Voice Selection

Control the voice via the `voice_gender` and `voice_accent` form fields in `POST /api/chat/respond`:

| `voice_gender` | Env Var Used |
|----------------|-------------|
| `"male"` | `ELEVENLABS_VOICE_ID_male` |
| `"female"` | `ELEVENLABS_VOICE_ID_female` |
| `null` / any other | `ELEVENLABS_VOICE_ID` (default) |

> `voice_accent` is forwarded to the pipeline state but currently does not affect voice selection — it is reserved for future accent-based routing.

Find voice IDs in the [ElevenLabs Voice Library](https://elevenlabs.io/voice-library) or via their API.

---

## Error Handling

All failures return `b""` (empty bytes) — TTS is non-blocking and the API response will have `audio_base64: null` and `assistant_audio_url: null`.

| Scenario | Behaviour |
|----------|-----------|
| `ELEVENLABS_API_KEY` missing | Returns `b""` |
| Voice ID not configured | Returns `b""` |
| `text` is empty | Returns `b""` |
| HTTP status ≠ 200 | Logs status + first 200 chars of response body, returns `b""` |
| Network error (`RequestException`) | Logs error, returns `b""` |
| `Content-Type` not `audio/*` | Logs warning, returns `b""` |
| `Content-Length` mismatch | Logs warning, returns `b""` |

---

## Changing the Model

```bash
ELEVENLABS_MODEL_ID=eleven_flash_v3_2_5   # Default — low latency
ELEVENLABS_MODEL_ID=eleven_multilingual_v2 # Higher quality, supports 29 languages
ELEVENLABS_MODEL_ID=eleven_turbo_v2_5      # Fastest, English-only
```

See [ElevenLabs models](https://elevenlabs.io/docs/speech-synthesis/models) for options and tradeoffs.
