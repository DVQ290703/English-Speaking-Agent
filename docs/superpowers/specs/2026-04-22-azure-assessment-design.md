# Azure Pronunciation Assessment Service — Design Spec

**Date:** 2026-04-22  
**Branch:** us-scoring  
**Status:** Approved

---

## Overview

Add a standalone Azure pronunciation assessment service and a dedicated `POST /api/assess` endpoint. The service evaluates how well a user pronounces English speech by sending audio to the Azure Cognitive Services Speech SDK. It supports both **scripted** (user reads a known reference sentence) and **unscripted** (free speech) assessment modes, selected automatically based on whether a reference text is provided.

---

## Architecture

### New / Modified Files

| File | Change |
|---|---|
| `app/services/azure_assessment.py` | New — service class |
| `app/api/schemas.py` | Extended — `WordResult`, `AssessmentResponse` |
| `app/api/routes.py` | Extended — `POST /api/assess` route |

### Environment Variables Required

| Variable | Description |
|---|---|
| `AZURE_SPEECH_KEY` | Azure Cognitive Services subscription key |
| `AZURE_SPEECH_REGION` | Azure region (e.g. `eastus`) |

Both are validated at service init. Missing either raises `ValueError` (consistent with `GroqSTTService` and `GroqLLMService`).

---

## Service: `AzureAssessmentService`

### Constructor

```python
AzureAssessmentService(language: str = "en-US")
```

- Reads `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` from environment
- Raises `ValueError` if either is missing
- Stores a `SpeechConfig` instance for reuse
- Logs readiness with `language`

### Primary Method

```python
def assess(
    audio_bytes: bytes,
    reference_text: str | None = None,
    language: str | None = None,
    granularity: str = "Phoneme",   # "Phoneme" | "Word" | "FullText"
    enable_prosody: bool = True,
) -> dict
```

**Mode selection:**
- `reference_text` provided → **scripted** mode (`enable_miscue=True`)
- `reference_text` absent or empty → **unscripted** mode (`enable_miscue=False`, `reference_text=""`)

**Prosody:** Enabled by default, but only applied when `language` resolves to `en-US`. Silently skipped for other locales (e.g. `en-GB`).

**Returns:** Raw `NBest[0]` dict from Azure JSON response — full word, syllable, and phoneme breakdown. The route is responsible for shaping this into the API response schema.

---

## Data Flow

```
POST /api/assess
│
├─ Validate auth (get_current_user_id)
├─ Read audio bytes (UploadFile), enforce 25 MB cap
├─ AzureAssessmentService.assess(audio_bytes, reference_text, language)
│   │
│   ├─ Wrap bytes → PushAudioInputStream → AudioConfig
│   ├─ Build PronunciationAssessmentConfig
│   │   ├─ scripted:   reference_text=<text>, enable_miscue=True
│   │   └─ unscripted: reference_text="",    enable_miscue=False
│   ├─ Enable prosody if language == "en-US"
│   ├─ SpeechRecognizer.recognize_once()
│   └─ Parse and return NBest[0] JSON dict
│
└─ Route maps dict → AssessmentResponse and returns
```

---

## API Endpoint

**`POST /api/assess`** (authenticated)

| Field | Type | Required | Description |
|---|---|---|---|
| `audio_file` | UploadFile | Yes | User audio (WAV, WebM, MP3 — any format Azure accepts) |
| `reference_text` | Form string | No | Target sentence for scripted mode |
| `language` | Form string | No | Locale override (default: `en-US`, supported: `en-GB`) |

---

## Response Schema

```python
class WordResult(BaseModel):
    word: str
    accuracy_score: float
    error_type: str          # "None" | "Mispronunciation" | "Omission" | "Insertion" | ...
    syllables: list[dict]    # raw Azure syllables (en-US only)
    phonemes: list[dict]     # raw Azure phonemes

class AssessmentResponse(BaseModel):
    mode: str                          # "scripted" | "unscripted"
    recognized_text: str
    pron_score: float
    accuracy_score: float
    fluency_score: float
    completeness_score: float | None   # scripted only
    prosody_score: float | None        # en-US only
    words: list[WordResult]
```

---

## Error Handling

| Situation | Response |
|---|---|
| Missing `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | `ValueError` at init (service won't start) |
| Empty audio bytes | HTTP 400 |
| Audio > 25 MB | HTTP 413 |
| Azure returns `NoMatch` | HTTP 502 with reason detail |
| Azure returns `Cancelled` | HTTP 502 with cancellation reason |
| Empty `NBest` in result | HTTP 502 |

No retries — Azure pronunciation assessment is synchronous and deterministic. A retry on bad audio won't help; the caller should re-record.

---

## Granularity Configurability

The `granularity` parameter on `assess()` allows developers to reduce response detail:

| Value | Returns |
|---|---|
| `"Phoneme"` (default) | Full text + word + syllable + phoneme scores |
| `"Word"` | Full text + word scores only |
| `"FullText"` | Full text scores only |

The route always calls with `granularity="Phoneme"` (full detail). Developers calling the service directly can pass a different value.

---

## Locale Support

| Locale | Prosody | Syllables | Phoneme names |
|---|---|---|---|
| `en-US` (default) | Yes | Yes | IPA + SAPI |
| `en-GB` | No (silently skipped) | No | Score only |

---

## Scoring Formula Reference

**Scripted (reading):**
- With prosody: `PronScore = 0.4·s0 + 0.2·s1 + 0.2·s2 + 0.2·s3`
- Without prosody: `PronScore = 0.6·s0 + 0.2·s1 + 0.2·s2`

**Unscripted (speaking):**
- With prosody: `PronScore = 0.6·s0 + 0.2·s1 + 0.2·s2`
- Without prosody: `PronScore = 0.6·s0 + 0.4·s1`

Where s0–s3 are the available component scores sorted lowest to highest.
