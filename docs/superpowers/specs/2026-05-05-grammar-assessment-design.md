# Grammar Assessment Workflow — Design Spec

**Date:** 2026-05-05  
**Status:** Approved  

---

## 1. Overview

Add per-turn grammar assessment to the AI English Speaking Coach. After each user message, the system returns an inline grammar summary (error count + highlighted spans) alongside the chat response, and stores full grammar detail for on-demand retrieval.

**Scope:** Backend only — API design, JSON schema, LLM prompt, DB schema. UI implementation handled separately.

---

## 2. Goals

- Flag grammar errors in real-time without adding a second LLM call
- Return lightweight grammar summary in every chat response for inline highlighting
- Provide full per-error detail (correction, category, explanation, severity, rule, example) on demand
- Never let grammar analysis failure break the chat response

---

## 3. Architecture

### Flow

```
POST /api/chat/respond
  │
  ├─ build_system_prompt() (existing)
  ├─ inject grammar_analysis_instruction into system prompt
  ├─ Groq LLM call (JSON mode) → structured JSON output
  │     { response_text, grammar_errors, corrected_sentence, overall_score }
  ├─ parse_grammar_response() → split chat reply from grammar data
  ├─ save message to DB (existing)
  ├─ save grammar detail to grammar_feedback table (new)
  └─ return: existing fields + grammar_summary (lightweight)

GET /api/grammar/{message_id}
  └─ read grammar_feedback row → return full error breakdown
```

### Key constraint

One LLM call returns both the chat response and grammar analysis. Grammar parsing failure must fall back gracefully — user always receives their chat reply.

---

## 4. API Design

### `POST /api/chat/respond` — updated response

All existing fields unchanged. Two fields added:

```json
{
  "user_input": "I go to the store yesterday",
  "response_text": "That sounds fun! What did you buy?",
  "audio_base64": null,
  "user_audio_url": null,
  "assistant_audio_url": "...",
  "conversation_id": "uuid",

  "grammar_summary": {
    "error_count": 1,
    "has_errors": true,
    "flagged_spans": [
      {
        "original": "go",
        "corrected": "went",
        "start_char": 2,
        "end_char": 4
      }
    ]
  }
}
```

`grammar_summary` is always present. When there are no errors: `{ "error_count": 0, "has_errors": false, "flagged_spans": [] }`.

---

### `GET /api/grammar/{message_id}` — full detail

```json
{
  "message_id": "uuid",
  "user_input": "I go to the store yesterday",
  "errors": [
    {
      "id": 1,
      "original": "go",
      "corrected": "went",
      "start_char": 2,
      "end_char": 4,
      "category": "verb_tense",
      "severity": "major",
      "explanation": "Use the simple past tense 'went' because 'yesterday' indicates a completed past action.",
      "rule": "Simple Past Tense: use V2 form for completed actions at a specific past time.",
      "example": "I went to the store yesterday. / She called me last night."
    }
  ],
  "corrected_sentence": "I went to the store yesterday.",
  "overall_score": 80
}
```

**Error categories:** `verb_tense`, `subject_verb_agreement`, `article`, `preposition`, `word_order`, `spelling`, `punctuation`, `other`

**Severity levels:** `minor`, `moderate`, `major`

**`overall_score`:** Integer 0–100, computed as `max(0, 100 - (major_count×15 + moderate_count×8 + minor_count×3))`.

Returns `404` if no grammar record exists for the message (e.g., message predates this feature or was audio-only with no transcription).

---

## 5. LLM Prompt Design

Appended to the end of the assembled system prompt (after base → topic → sub_option layers):

```
---
RESPONSE FORMAT (strict JSON, no markdown, no code fences):
{
  "response_text": "<your conversational reply>",
  "grammar_errors": [
    {
      "original": "<exact substring from user input>",
      "corrected": "<corrected form>",
      "start_char": <integer, 0-indexed>,
      "end_char": <integer, exclusive>,
      "category": "<verb_tense|subject_verb_agreement|article|preposition|word_order|spelling|punctuation|other>",
      "severity": "<minor|moderate|major>",
      "explanation": "<one sentence explaining the error>",
      "rule": "<grammar rule name or principle>",
      "example": "<example of correct usage>"
    }
  ],
  "corrected_sentence": "<full corrected version of the user's latest message>",
  "overall_score": <integer 0-100>
}

Rules:
- Assess ONLY the latest user message, not conversation history.
- If there are no grammar errors, return grammar_errors as [] and overall_score as 100.
- corrected_sentence must be the full user message with all errors fixed.
- start_char and end_char refer to character positions in the original user input string.
```

Groq JSON mode (`response_format={"type": "json_object"}`) is enabled on this call.

---

## 6. Parsing & Fallback Logic

`parse_grammar_response(raw: str, user_input: str) -> tuple[str, GrammarResult | None]`

```
1. Attempt json.loads(raw)
2. On success:
   a. Extract response_text → chat reply
   b. Extract grammar_errors, corrected_sentence, overall_score → GrammarResult
   c. Build grammar_summary from grammar_errors (error_count, flagged_spans)
3. On json.JSONDecodeError or missing response_text:
   a. Use raw as response_text (strip JSON artifacts if possible)
   b. Return GrammarResult as None → grammar_summary will be empty
4. On any other exception: same fallback as step 3, log the error
```

Grammar failure must never raise an exception that reaches the route handler.

---

## 7. Database Schema

```sql
CREATE TABLE grammar_feedback (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id         UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_input         TEXT        NOT NULL,
  errors             JSONB       NOT NULL DEFAULT '[]',
  corrected_sentence TEXT,
  overall_score      INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX grammar_feedback_message_id_idx ON grammar_feedback(message_id);
```

One row per user message. `errors` stores the full array as JSONB. `corrected_sentence` and `overall_score` are nullable to handle the fallback case where grammar parsing failed.

---

## 8. Error Handling

| Scenario | Behavior |
|---|---|
| LLM returns malformed JSON | Fall back: use raw text as chat reply, `grammar_summary` is empty, no DB write |
| `message_id` not found in `GET /api/grammar/{id}` | Return `404` |
| Grammar DB write fails | Log and continue — chat response still returns successfully |
| User input is empty string | Skip grammar analysis, return empty `grammar_summary` |
| Audio input (no transcription) | Apply grammar analysis to STT-transcribed text if available, otherwise skip |

---

## 9. Out of Scope

- Frontend/UI rendering of grammar feedback
- Grammar assessment for assistant responses (only user messages are assessed)
- Aggregated grammar reports across multiple conversations
- Grammar scoring history or progress tracking over time (can be added later)
