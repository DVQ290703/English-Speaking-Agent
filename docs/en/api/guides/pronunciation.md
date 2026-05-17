# Pronunciation & Grammar Guide

---

## POST /api/assess — Pronunciation Assessment

Scores pronunciation using **Azure Cognitive Services Speech**. Returns scores at the utterance, word, syllable, and phoneme levels.

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio_file` | file | Yes | Audio to assess (mp3/wav/ogg/webm/m4a, max 25 MB) |
| `reference_text` | string | No | If provided: scripted mode (word/phoneme errors). If omitted: unscripted (free recognition). |
| `language` | string | No | `en-US` (default) or `en-GB` |
| `message_id` | UUID | No | Links the assessment to an existing message in a conversation |

### Scripted mode (with reference_text)

```bash
curl -X POST http://localhost:8000/api/assess \
  -H "Authorization: Bearer <token>" \
  -F "audio_file=@my_recording.wav" \
  -F "reference_text=The weather is nice today." \
  -F "language=en-GB"
```

### Response 200

```json
{
  "assessment_id": "3fa85f64-...",
  "mode": "scripted",
  "recognized_text": "The weather is nice today.",
  "pron_score": 84.5,
  "accuracy_score": 88.0,
  "fluency_score": 79.0,
  "completeness_score": 100.0,
  "prosody_score": 81.5,
  "words": [
    {
      "word": "weather",
      "accuracy_score": 91.0,
      "error_type": "None",
      "syllables": [
        { "syllable": "wea", "accuracy_score": 95.0 },
        { "syllable": "ther", "accuracy_score": 87.0 }
      ],
      "phonemes": [
        { "phoneme": "w", "accuracy_score": 98.0 },
        { "phoneme": "ɛ", "accuracy_score": 89.0 }
      ]
    }
  ]
}
```

### Score Fields

| Field | Description |
|-------|-------------|
| `pron_score` | Composite pronunciation score (0–100) |
| `accuracy_score` | How correctly phonemes are pronounced |
| `fluency_score` | Flow and naturalness of speech |
| `completeness_score` | Ratio of expected words spoken (scripted mode only) |
| `prosody_score` | Rhythm, stress, and intonation |

### Word Error Types

| Error Type | Meaning |
|------------|---------|
| `None` | Correctly pronounced |
| `Omission` | Word was skipped |
| `Insertion` | Extra word spoken not in reference |
| `Mispronunciation` | Word pronounced incorrectly |
| `UnexpectedBreak` | Pause inserted where none expected |
| `MissingBreak` | Expected pause not made |
| `Monotone` | Insufficient pitch variation |

---

## GET /api/grammar/detail_grammar_fb/{message_id} — Grammar Feedback

Returns detailed grammar feedback for a specific user message. Grammar analysis runs automatically during `/api/chat/respond` and is stored per message.

```bash
curl http://localhost:8000/api/grammar/detail_grammar_fb/3fa85f64-... \
  -H "Authorization: Bearer <token>"
```

**Response 200:**
```json
{
  "message_id": "3fa85f64-...",
  "user_input": "Yesterday I go to the market.",
  "corrected_sentence": "Yesterday I went to the market.",
  "overall_score": 72,
  "errors": [
    {
      "id": 1,
      "original": "go",
      "corrected": "went",
      "start_char": 10,
      "end_char": 12,
      "category": "tense",
      "severity": "major",
      "explanation": "Use past simple 'went' instead of present 'go'.",
      "rule": null,
      "example": null
    }
  ]
}
```

**Errors:**
- `404` — message not found, or not owned by the authenticated user
