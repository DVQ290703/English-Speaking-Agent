# LLM Cost & Latency Optimization

**Date:** 2026-05-10
**Status:** Approved
**Scope:** Combine grammar + main LLM into one call using XML-delimited output; compact grammar format; eliminate redundant frontend grammar fetch; fix secondary over-fetching.

---

## Problem Summary

Every user turn currently triggers:

| Call | Where | Issue |
|------|-------|-------|
| Main LLM (Groq) | `pipeline.py:118` | Sequential, ~600ms |
| Grammar LLM (Groq) | `pipeline.py:178` | Sequential after main, ~500ms, separate `json_client` |
| `fetchGrammarFeedback` HTTP | `useSendChatMessage.ts:180` | Redundant — backend already has grammar result |
| `fetchGrammarFeedback` HTTP | `VoiceAgent.tsx:774` | Fires on every message expand click, no cache check |

Additional: LLM character counting for `start_char`/`end_char` is unreliable. Grammar JSON is verbose — ~120 tokens for 2 errors.

---

## Goals

- **1 LLM call per turn** instead of 2 — ~50% LLM cost reduction.
- **~54% output token reduction** on grammar via compact format.
- **Reliable character positions** — backend computes from inline annotations, not LLM.
- **1 HTTP call per turn** from frontend instead of 2.
- Grammar analysis runs on **every** user turn — intentional, unchanged.

---

## Architecture

### Before

```
User input
  └─► pipeline._respond_node()
        ├─ LLM call #1: main response        (~600ms)
        └─ LLM call #2: grammar (json_client) (~500ms, sequential)

chat.py → ChatResponse with GrammarSummary (stripped)

Frontend:
  chatRespond()           → response + stripped grammar_summary
  fetchGrammarFeedback()  → full grammar from DB   ← REDUNDANT
```

### After

```
User input
  └─► pipeline._respond_node()
        └─ LLM call #1 only: response + grammar in one output (~700ms)
             ├─ <response>…</response>   → conversational reply → TTS
             └─ <grammar>…</grammar>     → compact JSON → parse → DB

chat.py → ChatResponse with full grammar_detail inline

Frontend:
  chatRespond()  → response + full grammar_detail   ← single call, done
```

---

## Design: Combined Output Format

### XML Delimiter Tags (Format B)

The LLM is instructed via system prompt to always end its response with a `<grammar>` block:

```
<response>
That's a great attempt! I noticed a couple of things we can work on.
</response>
<grammar>
{"ann":"yesterday, i {go->went} to {cinema->the cinema} with {a->the} friend","err":[{"cat":"vt","sev":2,"msg":"Past simple for completed past actions.","eg":"I went to school yesterday."},{"cat":"art","sev":1,"msg":"'Cinema' needs the definite article in British English."},{"cat":"art","sev":1,"msg":"Definite article when noun is understood from context."}],"score":68}
</grammar>
```

**Why XML tags over JSON schema mode:**
Groq's `response_format: json_schema` conflicts with tool calls (flashcard operations). XML tags are prompt-level — no API constraint, tool calls continue to work unchanged.

**Streaming behaviour:**
- Stream starts → `<response>` section flows to frontend in real time (TTFT preserved)
- `</response>` hit → slice: send `response_text` to TTS pipeline
- `<grammar>` section buffered → JSON parsed after stream ends
- `</grammar>` hit → grammar processing begins

---

## Design: Compact Grammar JSON

### Schema

```json
{
  "ann": "<annotated sentence with inline error markers>",
  "err": [
    {
      "cat": "<category code>",
      "sev": <1|2|3>,
      "msg": "<one concise explanation sentence>",
      "eg":  "<optional example sentence>"
    }
  ],
  "score": <0-100>
}
```

### Field Reference

| Field | Full name | Type | Notes |
|-------|-----------|------|-------|
| `ann` | annotated | string | User's original sentence with `{wrong->correct}` markers |
| `err` | errors | array | Ordered — `err[i]` matches the `i-th` annotation in `ann` |
| `err[].cat` | category | string | Short code (see below) |
| `err[].sev` | severity | int | `1` minor, `2` major, `3` critical |
| `err[].msg` | message | string | One sentence — educational explanation |
| `err[].eg` | example | string | Optional — omit for simple/obvious errors |
| `score` | overall score | int | 0–100 |

### Annotation Syntax in `ann`

| Case | Syntax | Example |
|------|--------|---------|
| Word substitution | `{wrong->correct}` | `{go->went}` |
| Multi-word substitution | `{wrong phrase->correct phrase}` | `{has been go->had gone}` |
| Missing word (insertion) | `{->correct}` | `{->the} cinema` |
| Extra word (deletion) | `{wrong->}` | `I {really->} went` |
| No errors | plain sentence | `I went to school yesterday.` |

### Category Codes

| Code | Meaning |
|------|---------|
| `vt` | verb tense |
| `art` | article (a/an/the) |
| `prep` | preposition |
| `sv` | subject-verb agreement |
| `sp` | spelling |
| `wc` | word choice |
| `punc` | punctuation |
| `wo` | word order |
| `pl` | plural / singular |
| `other` | catch-all |

### Token Comparison

| Format | Tokens (2 errors, ~15-word sentence) |
|--------|--------------------------------------|
| Previous verbose JSON | ~120 tokens |
| Compact format | ~55 tokens |
| Savings | **~54%** |

---

## Backend Parser: `parse_annotated_grammar()`

New function in `app/services/grammar_parser.py`. Replaces the current LLM-JSON-to-GrammarData flow.

### Algorithm

```
Input:  ann (annotated string), err (error list), user_input (original)
Output: list[GrammarErrorDetail]

1. Regex scan `ann` left-to-right:
   pattern = \{([^}]*)->([^}]*)\}
   collect list of (wrong_text, correct_text) tokens in order

2. Derive corrected_sentence:
   replace each {wrong->correct} with correct in ann → plain corrected text

3. cursor = 0
   For each token[i] paired with err[i]:
     a. wrong_text = token.wrong  (empty string = insertion)
     b. correct_text = token.correct  (empty string = deletion)

     c. If wrong_text != "":
          search original user_input for wrong_text (case-insensitive)
          starting at cursor position
          → start_char, end_char
          cursor = end_char

        Else (insertion — {->correct}):
          find insertion point between surrounding words in original
          start_char = end_char = cursor (zero-width span)

     d. Build GrammarErrorDetail:
          original    = wrong_text (or "" for insertion)
          corrected   = correct_text (or "" for deletion)
          start_char  = computed above
          end_char    = computed above
          category    = expand short code (vt → verb_tense, art → article, …)
          severity    = expand int (1 → minor, 2 → major, 3 → critical)
          explanation = err[i].msg
          rule        = "" (no longer generated; absorbed into msg)
          example     = err[i].eg or ""
          id          = i + 1

4. Return list[GrammarErrorDetail], corrected_sentence, overall_score
```

### Edge Cases

| Case | Handling |
|------|----------|
| Same word appears twice as different errors | Cursor advances past first match; second search starts after it — order preserved |
| Case mismatch (`Go` vs `{go->went}`) | Case-insensitive search; original casing preserved in `original` field |
| `len(tokens) != len(err)` | Use `min(len(tokens), len(err))`; log warning |
| `ann` missing or malformed | Fall back to `errors=[]`, `corrected_sentence=user_input`; `score` used if present |
| Unclosed brace in `ann` | Regex only matches complete `{…->…}`; partial tokens ignored |
| No errors | `ann` = plain sentence, `err=[]`, `score=100` |
| Insertion at sentence start | `start_char=0`, `end_char=0` |
| `<grammar>` tag missing from LLM output | `grammar_detail=None` in response; pipeline result unaffected |

---

## Detailed Code Changes

### 1. `pipeline.py` — single combined LLM call

**File:** `app/agents/pipeline.py`

Remove the separate `generate_response_with_grammar()` call (lines 178–183). The `_respond_node` makes one LLM call whose system prompt instructs it to return `<response>…</response><grammar>…</grammar>` format.

After the LLM stream completes:
- Split on `<response>` / `</response>` / `<grammar>` / `</grammar>` tags
- `response_text` = content between `<response>` tags
- `grammar_raw` = content between `<grammar>` tags (JSON string)

Pipeline state carries `grammar_raw` (raw JSON string) instead of the previous `grammar_json`.

Pipeline returns `(response_text, audio_bytes, grammar_raw, tool_steps)`.

**Tool call handling:** When the LLM emits tool calls, the tool loop executes normally. The system prompt instructs the LLM: *"Include the `<grammar>` block only in your final conversational reply. Do not include it when calling tools."* The pipeline only attempts to split and parse `<grammar>` on iterations where `ai_msg.tool_calls` is empty (i.e., the final response). Intermediate tool-call responses are passed through unchanged.

### 2. `groq_llm.py` — update system prompt + remove `json_client`

**File:** `app/services/groq_llm.py`

- Remove `generate_response_with_grammar()` method entirely.
- Remove `json_client` (the separate Groq client configured for JSON mode).
- Update `generate_response()` system prompt to instruct combined output format (see prompt design below).

**Prompt addition to system prompt:**

```
After your conversational reply, always append a grammar analysis block in this exact format:

<response>
[your conversational reply here]
</response>
<grammar>
{"ann":"<user's sentence with {wrong->correct} markers>","err":[{"cat":"<code>","sev":<1|2|3>,"msg":"<explanation>","eg":"<optional example>"}],"score":<0-100>}
</grammar>

Category codes: vt=verb tense, art=article, prep=preposition, sv=subject-verb agreement,
sp=spelling, wc=word choice, punc=punctuation, wo=word order, pl=plural/singular, other=catch-all
Severity: 1=minor, 2=major, 3=critical
If no grammar errors: use ann=<original sentence>, err=[], score=100
```

### 3. `grammar_parser.py` — new `parse_annotated_grammar()`

**File:** `app/services/grammar_parser.py`

Add `parse_annotated_grammar(ann: str, err: list, score: int, user_input: str) -> GrammarData` implementing the algorithm above.

Remove `parse_grammar_response()` — it was only called from `chat.py` at write time. The `GET /grammar/detail_grammar_fb/:id` endpoint reads pre-parsed JSONB directly from the DB and does not use this function. Old DB records are already in expanded format and are unaffected.

### 4. `ai_services.py` — remove grammar call, simplify

**File:** `app/core/ai_services.py`

Remove the standalone grammar call. `run_langraph_agent()` now returns `(response_text, audio_bytes, grammar_raw, tool_steps)` where `grammar_raw` is the raw JSON string extracted from the `<grammar>` tag.

### 5. `chat.py` — parse inline, include full grammar in response

**File:** `app/api/chat.py`

Replace `parse_grammar_response(grammar_json, user_input)` with `parse_annotated_grammar(...)` using the new compact parser.

Add `grammar_detail: GrammarDetailResponse | None` to the `ChatResponse` return — populated from parsed grammar data. No extra DB query needed.

`grammar_summary` field kept for backward compatibility (derived from `grammar_detail`).

### 6. `schemas.py` — extend `ChatResponse`

**File:** `app/api/schemas.py`

```python
class ChatResponse(BaseModel):
    ...
    grammar_summary: GrammarSummary = ...                    # backward compat
    grammar_detail: GrammarDetailResponse | None = None      # new: full inline
    tool_steps: list[ToolCallStep] = ...
```

### 7. `useSendChatMessage.ts` — read inline grammar, remove fetch

**File:** `frontend/src/hooks/useSendChatMessage.ts`

Remove `fetchGrammarFeedback` call (lines 178–237). Read `data.grammar_detail` directly from `chatRespond()` response:

```typescript
if (data.grammar_detail) {
  const items = data.grammar_detail.errors ?? [];
  setGrammarCorrectedSentence(data.grammar_detail.corrected_sentence ?? '');
  const grammarMistakes = items.map((item) => ({
    wrong: item.original || '—',
    correct: item.corrected || '—',
    type: 'Grammar' as const,
    note: item.explanation || undefined,
  }));
  setGrammarErrors(grammarMistakes);
  setMessages((prev) => prev.map((msg) =>
    msg.id !== userId ? msg : {
      ...msg,
      mistakes: [...(msg.mistakes ?? []).filter(m => m.type !== 'Grammar'), ...grammarMistakes],
      grammarChecked: true,
    }
  ));
}
setIsGrammarLoading(false);
```

`fetchGrammarFeedback` import kept — still used by `VoiceAgent.tsx` for historical message expansion.

### 8. `VoiceAgent.tsx` — skip fetch if grammar cached

**File:** `frontend/src/pages/VoiceAgent.tsx`

In the `useEffect` at lines 774–842, check `displayMsg.grammarChecked` before firing network call:

```typescript
useEffect(() => {
  grammarAbortRef.current?.abort();
  if (!displayMsg || displayMsg.role !== 'user') {
    setIsGrammarLoading(false);
    return;
  }
  // Skip fetch if grammar already loaded for this message
  if (displayMsg.grammarChecked) {
    const cached = displayMsg.mistakes?.filter(m => m.type === 'Grammar') ?? [];
    setGrammarErrors(cached);
    setIsGrammarLoading(false);
    return;
  }
  // ... existing fetchGrammarFeedback logic unchanged
}, [displayMsg, setMessages]);
```

### 9. `VoiceAgent.tsx` — guard topic-switch auto-load cascade

```typescript
useEffect(() => {
  if (convsLoading || hasAutoLoadedRef.current) return;  // guard added
  const latest = conversations[0];
  if (latest) {
    hasAutoLoadedRef.current = true;
    loadConversationInPlace(latest.id, topic);
  }
}, [conversations, topic, convsLoading, loadConversationInPlace]);
```

### 10. `MessageBubble.tsx` — add `grammarChecked` to `Message` type

**File:** `frontend/src/components/voice-agent/MessageBubble.tsx`

```typescript
export interface Message {
  ...
  grammarChecked?: boolean;   // true once grammar has been loaded for this message
}
```

---

## Data Flow — Per Turn (After)

```
1. POST /chat/respond

2. pipeline._respond_node() — single LLM call
   Stream output:
     <response>
     "That's a great attempt! ..."    ← TTFT here, frontend sees text
     </response>
     <grammar>
     {"ann":"i {go->went}...","err":[...],"score":75}
     </grammar>

3. Split on tags:
   response_text → TTS → audio_bytes
   grammar_raw   → parse_annotated_grammar() → GrammarDetailResponse

4. chat.py builds ChatResponse:
   { response_text, audio_base64, grammar_summary, grammar_detail, tool_steps }

5. Frontend receives one response:
   - Renders reply + plays audio
   - Reads grammar_detail directly → no follow-up call
```

---

## Error Handling

| Failure | Behaviour |
|---------|-----------|
| `<grammar>` tag missing | `grammar_detail: null`; pipeline result unaffected |
| Grammar JSON malformed | Parser returns `errors=[]`, `score=null`; logged as warning |
| Main response missing `<response>` tag | Full raw output used as `response_text`; grammar tag still attempted |
| `len(annotations) != len(err)` | Use `min()` of both; log warning |
| Frontend `grammar_detail` is null | `setGrammarErrors([])`, `setIsGrammarLoading(false)` silently |

---

## What Does NOT Change

- Grammar runs every turn — no opt-out flag.
- `GET /grammar/detail_grammar_fb/:id` endpoint kept for historical message viewing.
- Pronunciation assessment flow unchanged.
- Tool call cap (`_TOOL_CALL_CAP = 5`) and tool loop logic unchanged.
- `GrammarSummary` in `ChatResponse` kept for backward compatibility.
- `parse_grammar_response()` removed — was only called at write time in `chat.py`; replaced by `parse_annotated_grammar()`.

---

## Files Touched

| File | Change |
|------|--------|
| `app/agents/pipeline.py` | Single combined LLM call; split `<response>`/`<grammar>` tags; drop separate grammar call |
| `app/services/groq_llm.py` | Remove `generate_response_with_grammar()` and `json_client`; update system prompt |
| `app/services/grammar_parser.py` | Add `parse_annotated_grammar()` for new compact format |
| `app/core/ai_services.py` | Remove standalone grammar call; update return signature |
| `app/api/chat.py` | Use new parser; add `grammar_detail` to `ChatResponse` |
| `app/api/schemas.py` | Add `grammar_detail: GrammarDetailResponse \| None` to `ChatResponse`; make `GrammarErrorDetail.rule` and `.example` optional (`str \| None = None`) since LLM no longer generates `rule` |
| `frontend/src/hooks/useSendChatMessage.ts` | Remove `fetchGrammarFeedback` call; read `data.grammar_detail` |
| `frontend/src/pages/VoiceAgent.tsx` | Cache-check before grammar fetch; guard topic-switch auto-load |
| `frontend/src/components/voice-agent/MessageBubble.tsx` | Add `grammarChecked` to `Message` type |
| `tests/test_ai_services/test_ai_services.py` | Update to new return signature; test tag splitting |

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| LLM calls per turn | 2 | 1 |
| Grammar output tokens (2 errors) | ~120 | ~55 (~54% less) |
| Total LLM cost per turn | baseline | ~50–60% less |
| Turn latency (p50) | ~1.5s | ~800ms |
| HTTP calls per turn (frontend) | 2 | 1 |
| Grammar-on-click fetches | every click | cache miss only |
| Character position accuracy | LLM-counted (unreliable) | backend string search (reliable) |
