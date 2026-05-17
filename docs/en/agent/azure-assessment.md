# Azure Speech Assessment Service

Scores pronunciation at the utterance, word, syllable, and phoneme levels using Azure Cognitive Services Speech SDK.

**Source:** `app/services/azure_assessment.py`
**Provider:** [Azure Cognitive Services Speech](https://azure.microsoft.com/en-us/products/ai-services/speech-to-text)
**SDK:** `azure-cognitiveservices-speech` (optional import — raises `RuntimeError` if not installed)

---

## Configuration

| Env Var | Required | Default | Description |
|---------|----------|---------|-------------|
| `AZURE_SPEECH_KEY` | Yes* | — | Azure Speech subscription key |
| `AZURE_SUBSCRIPTION_ID` | Yes* | — | Alias for `AZURE_SPEECH_KEY` |
| `AZURE_SPEECH_REGION` | Yes** | — | Azure region e.g. `eastus` |
| `AZURE_SERVICE_REGION` | Yes** | — | Alias for `AZURE_SPEECH_REGION` |
| `AZURE_SPEECH_LANGUAGE` | No | `en-US` | Default recognition language |

\* Either `AZURE_SPEECH_KEY` or `AZURE_SUBSCRIPTION_ID` must be set.
\*\* Either `AZURE_SPEECH_REGION` or `AZURE_SERVICE_REGION` must be set.

---

## How It's Used

The service is initialized lazily via `get_assessment_service()`:

```python
@lru_cache(maxsize=1)
def get_assessment_service() -> AzureAssessmentService:
    return AzureAssessmentService(language=os.getenv("AZURE_SPEECH_LANGUAGE", "en-US"))
```

Called by `POST /api/assess`. Results are stored in `pronunciation_assessments`, `pronunciation_word_details`, `pronunciation_syllable_details`, and `pronunciation_phoneme_details` tables.

---

## `assess()`

```python
def assess(
    audio_bytes: bytes,
    reference_text: str | None = None,
    language: str | None = None,
    granularity: str = "Phoneme",
    enable_prosody: bool = True,
) -> dict
```

### Modes

| Mode | When | What it measures |
|------|------|-----------------|
| **Scripted** | `reference_text` provided | Compares speech against the reference — detects omissions, insertions, mispronunciations |
| **Unscripted** | `reference_text=None` | Freely recognizes speech and scores pronunciation without a target text |

### Granularity

| Value | Detail level |
|-------|-------------|
| `"Phoneme"` | Default — word + syllable + phoneme scores |
| `"Word"` | Word-level only |
| `"FullText"` | Utterance-level only |

### Prosody

Enabled by default for `en-US`. Scores:
- **Break** — unexpected pauses or missing pauses between words
- **Intonation** — pitch variation (detects monotone speech)

Prosody data appears as `break_error_types`, `intonation_error_types`, and confidence scores on each `pronunciation_word_details` row.

---

## Response Structure

Returns the **top NBest result** from Azure with two additional keys added:

```python
{
    # Added by the service wrapper
    "mode": "scripted" | "unscripted",
    "display_text": "The weather is nice today.",

    # Azure NBest fields
    "PronScore": 84.5,          # Composite score (0–100)
    "AccuracyScore": 88.0,
    "FluencyScore": 79.0,
    "CompletenessScore": 100.0,
    "ProsodyScore": 81.5,
    "NBestConfidence": 0.9832,
    "SNR": 35.2,                # Signal-to-noise ratio
    "OffsetInTicks": 100000,    # Utterance start (100-ns ticks)
    "DurationInTicks": 4500000, # Utterance duration (100-ns ticks)
    "Words": [
        {
            "Word": "weather",
            "AccuracyScore": 91.0,
            "ErrorType": "None",
            "OffsetInTicks": 150000,
            "DurationInTicks": 800000,
            "Syllables": [
                { "Syllable": "wea", "AccuracyScore": 95.0, ... },
                { "Syllable": "ther", "AccuracyScore": 87.0, ... }
            ],
            "Phonemes": [
                { "Phoneme": "w", "AccuracyScore": 98.0, ... },
                { "Phoneme": "ɛ", "AccuracyScore": 89.0, ... }
            ]
        }
    ]
}
```

The full Azure payload is also stored as-is in `pronunciation_assessments.raw_result_json` (JSONB).

---

## Score Fields

| Field | Description |
|-------|-------------|
| `PronScore` | Composite pronunciation quality (0–100). Weighted blend of the others. |
| `AccuracyScore` | How correctly phonemes match the reference or expected pronunciation |
| `FluencyScore` | Natural flow — minimal hesitation, correct pace |
| `CompletenessScore` | Ratio of expected words spoken (scripted mode only; always 100 in unscripted) |
| `ProsodyScore` | Rhythm, stress, and intonation quality |

### Word Error Types

| Type | Meaning |
|------|---------|
| `None` | Correctly pronounced |
| `Omission` | Word was skipped |
| `Insertion` | Extra word spoken not in reference |
| `Mispronunciation` | Word sounds wrong |
| `UnexpectedBreak` | Pause inserted where none was expected |
| `MissingBreak` | Expected pause between words not made |
| `Monotone` | Insufficient pitch variation on this word |

---

## Tick Units

Azure returns timing values in **100-nanosecond ticks**:

```python
milliseconds = ticks / 10_000
seconds      = ticks / 10_000_000
```

These are stored as-is in `offset_ticks` / `duration_ticks` columns in the DB.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` missing | `ValueError` at startup |
| `azure-cognitiveservices-speech` not installed | `RuntimeError` at startup |
| `audio_bytes` is empty | `ValueError` raised |
| `RecognizedSpeech` result | Returns assessment dict ✅ |
| `NoMatch` result | `RuntimeError("Speech was not recognized...")` |
| `Canceled` result | Logs cancellation reason + error details, raises `RuntimeError` |

Resources (`recognizer`, `audio_config`, `speech_config`, `stream`) are explicitly deleted after each call to prevent SDK memory leaks.

---

## Supported Languages

| Code | Language |
|------|---------|
| `en-US` | English (United States) — prosody enabled by default |
| `en-GB` | English (United Kingdom) |

Pass `language` to `POST /api/assess` to override the default.
