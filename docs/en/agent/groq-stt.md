# Groq STT Service (Whisper)

Transcribes user audio to text before it enters the LangGraph pipeline.

**Source:** `app/services/groq_stt.py`  
**Model:** `whisper-large-v3-turbo` (default)  
**Provider:** [Groq](https://console.groq.com) via the `groq` Python SDK

---

## Configuration

| Env Var | Required | Default | Description |
|---------|----------|---------|-------------|
| `GROQ_API_KEY` | Yes | — | Shared with the LLM service. Raises `ValueError` on startup if missing. |
| `GROQ_STT_MODEL` | No | `whisper-large-v3-turbo` | Whisper model variant to use. |

---

## How It's Used

The service is initialized lazily via `get_stt_service()` in `app/core/ai_services.py`:

```python
@lru_cache(maxsize=1)
def get_stt_service() -> GroqSTTService:
    return GroqSTTService(model_name=os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo"))
```

It is called by `transcribe_audio()` which wraps it with error handling and is used in two places:

| Caller | When |
|--------|------|
| `POST /api/chat/respond` | When `audio_file` is uploaded instead of `text` |
| `POST /api/chat/transcribe` | Lightweight STT-only endpoint |

---

## `transcribe()`

```python
def transcribe(
    audio_bytes: bytes,
    filename: str = "recording.wav",
) -> str
```

1. Wraps `audio_bytes` in an `io.BytesIO` buffer with the given filename (used by the Groq API to detect format)
2. Calls `client.audio.transcriptions.create()` with:
   - `response_format="verbose_json"` — returns detailed metadata alongside transcript
   - `temperature=0.0` — deterministic output
3. Extracts the `.text` attribute (handles both object and dict response shapes)
4. Returns the trimmed transcript string

---

## Supported Audio Formats

The chat endpoint accepts: `mp3`, `wav`, `ogg`, `webm`, `m4a`  
Max file size: **25 MB**

The filename passed to `transcribe()` informs the Groq API of the audio format. If the format is ambiguous, pass an explicit filename extension:

```python
stt.transcribe(audio_bytes, filename="recording.webm")
```

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `GROQ_API_KEY` missing | `ValueError` raised at startup |
| `audio_bytes` is empty | Returns `""` immediately |
| Transcription API error | Exception caught in `transcribe_audio()` wrapper → returns `""` |

When transcription returns `""`, the chat endpoint falls back to whatever `text` field was provided. If both are empty the request is rejected with HTTP 400.

---

## Changing the Model

```bash
GROQ_STT_MODEL=whisper-large-v3          # Higher accuracy, slower
GROQ_STT_MODEL=whisper-large-v3-turbo    # Default — fast + accurate
```

See [Groq audio models](https://console.groq.com/docs/speech-text) for available options.
