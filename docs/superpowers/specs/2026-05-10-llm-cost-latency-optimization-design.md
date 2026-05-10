# LLM Cost & Latency Optimization

**Date:** 2026-05-10  
**Status:** Approved  
**Scope:** Parallelize backend grammar + main LLM calls; eliminate redundant frontend grammar fetch; fix secondary over-fetching patterns.

---

## Problem Summary

Every user turn currently triggers:

| Call | Where | Cost | Notes |
|------|-------|------|-------|
| Main LLM (Groq) | `pipeline.py:118` | ~600ms | Conversational response + tool loop |
| Grammar LLM (Groq) | `pipeline.py:178` | ~500ms | Sequential, after main call |
| `fetchGrammarFeedback` HTTP | `useSendChatMessage.ts:180` | ~100ms | Redundant — backend already returned grammar |
| `fetchGrammarFeedback` HTTP | `VoiceAgent.tsx:774` | ~100ms | Fires on every message expand click |

The two backend LLM calls are sequential despite being independent (grammar only needs `user_input`, not the AI's reply). The frontend fires a separate grammar fetch even though the backend already computed and could return the full grammar inline.

---

## Goals

- Reduce per-turn latency by parallelizing the two LLM calls.
- Eliminate the redundant `fetchGrammarFeedback` call after every `chatRespond`.
- Fix secondary over-fetching: grammar-on-click and topic-switch cascade.
- Grammar analysis runs on **every** user turn — this is intentional and unchanged.

---

## Architecture

### Before

```
User input
  │
  └─► pipeline._respond_node()
        ├─ LLM call #1: main response        (~600ms)
        │    └─ [tool loop if needed]
        └─ LLM call #2: grammar analysis     (~500ms, sequential)
             └─ grammar_json → saved to DB

chat.py builds ChatResponse with GrammarSummary (stripped: error_count, spans only)

Frontend useSendChatMessage:
  chatRespond()           → response + stripped grammar_summary
  fetchGrammarFeedback()  → full grammar from DB   ← REDUNDANT ROUND TRIP
```

### After

```
User input
  │
  ├─► pipeline._respond_node()      ─────────────────────────────┐
  │     ├─ LLM call #1: main response        (~600ms)            │  asyncio.gather
  │     └─ [tool loop if needed + TTS]                           │
  │                                                              │
  └─► llm_service.generate_response_with_grammar()  (~500ms)    │
        └─ grammar_json                              ────────────┘

chat.py merges results, builds ChatResponse with full GrammarDetailResponse inline

Frontend useSendChatMessage:
  chatRespond()  → response + full grammar_detail   ← single call, no follow-up
```

---

## Detailed Changes

### 1. Extract grammar from `pipeline.py`

**File:** `app/agents/pipeline.py`

Remove the `generate_response_with_grammar()` call from `_respond_node` (currently lines 178–183). The pipeline state no longer carries `grammar_json`. The pipeline's return value from `run_langraph_agent` drops the grammar output — it returns `(response_text, audio_bytes, tool_steps)`.

The `_TOOL_CALL_CAP` loop, TTS node, and all tool handling remain unchanged.

### 2. New async runner in `ai_services.py`

**File:** `app/core/ai_services.py`

Add `run_langraph_agent_async()` — an async wrapper that fires both tasks concurrently:

```python
async def run_langraph_agent_async(
    user_input: str,
    history: list[str],
    voice_gender: str | None,
    category: str | None,
    topic: str | None,
    user_id: str,
) -> tuple[str, bytes, dict | None, list]:
    loop = asyncio.get_event_loop()

    pipeline_task = loop.run_in_executor(
        None,
        lambda: _run_pipeline(user_input, history, voice_gender, category, topic, user_id),
    )
    grammar_task = loop.run_in_executor(
        None,
        lambda: llm_service.generate_response_with_grammar(
            user_input=user_input,
            history=history,
            category=category,
            topic=topic,
        ),
    )

    (response_text, audio_bytes, tool_steps), (_, grammar_json) = await asyncio.gather(
        pipeline_task, grammar_task
    )
    return response_text, audio_bytes, grammar_json, tool_steps
```

`_run_pipeline` is the extracted synchronous pipeline call (renamed from the current `run_langraph_agent` body, minus the grammar call).

The existing synchronous `run_langraph_agent` is removed — `chat.py` calls `run_langraph_agent_async` directly via `await`. Any test that previously called `run_langraph_agent` synchronously must be updated to use `asyncio.run(run_langraph_agent_async(...))` or `pytest-asyncio`.

### 3. `chat.py` — make endpoint async, include full grammar in response

**File:** `app/api/chat.py`

- Change `def chat_respond(...)` → `async def chat_respond(...)`
- Replace `run_langraph_agent(...)` call with `await run_langraph_agent_async(...)`
- Extend `ChatResponse` return: replace `grammar_summary` with both `grammar_summary` (kept for backward compat) and a new `grammar_detail` field containing the full `GrammarDetailResponse`.

`grammar_detail` is populated directly from the already-parsed `grammar_data` object — no extra DB query.

### 4. `schemas.py` — extend `ChatResponse`

**File:** `app/api/schemas.py`

```python
class ChatResponse(BaseModel):
    ...
    grammar_summary: GrammarSummary = ...       # kept for backward compat
    grammar_detail: GrammarDetailResponse | None = None   # new: full inline detail
    tool_steps: list[ToolCallStep] = ...
```

`grammar_detail` is `None` when grammar parsing fails (LLM returned invalid JSON).

### 5. `useSendChatMessage.ts` — read inline grammar, remove fetch

**File:** `frontend/src/hooks/useSendChatMessage.ts`

Remove the `fetchGrammarFeedback` call (lines 178–237). Instead, after `chatRespond()` returns, read `data.grammar_detail` directly:

```typescript
if (data.grammar_detail) {
  const items = data.grammar_detail.errors ?? [];
  setGrammarCorrectedSentence(data.grammar_detail.corrected_sentence ?? '');
  const grammarMistakes = items.map(...); // same mapping logic as today
  setGrammarErrors(grammarMistakes);
  setMessages((prev) => prev.map((msg) => ...));
}
setIsGrammarLoading(false);
```

The `fetchGrammarFeedback` import is NOT removed from `chat.ts` — it is still used by `VoiceAgent.tsx` for historical message expansion.

### 6. `VoiceAgent.tsx` — skip fetch if grammar already in state

**File:** `frontend/src/pages/VoiceAgent.tsx`

In the `useEffect` at lines 774–842 that fires `fetchGrammarFeedback` on message expand:

Before firing the fetch, check if the selected message already has grammar mistakes loaded in its `message.mistakes` state (type `'Grammar'`). If so, set the grammar state from the cached data and return — skip the network call.

```typescript
useEffect(() => {
  grammarAbortRef.current?.abort();
  if (!displayMsg || displayMsg.role !== 'user') {
    setIsGrammarLoading(false);
    return;
  }

  // Use cached grammar if already loaded for this message
  const cachedGrammar = displayMsg.mistakes?.filter((m) => m.type === 'Grammar') ?? [];
  if (cachedGrammar.length > 0 || displayMsg.grammarChecked) {
    setGrammarErrors(cachedGrammar);
    setIsGrammarLoading(false);
    return;
  }

  // ... existing fetchGrammarFeedback logic unchanged
}, [displayMsg, setMessages]);
```

Add a `grammarChecked: boolean` field to the `Message` type so messages with zero errors (but grammar was confirmed checked) also skip re-fetching.

### 7. `VoiceAgent.tsx` — guard topic-switch auto-load cascade

**File:** `frontend/src/pages/VoiceAgent.tsx`

In the auto-load effect (lines 718–743), skip auto-loading if `convsLoading` is still `true` (the conversations list fetch hasn't settled yet). The existing `convsLoading` state already tracks this — it just isn't used as a guard in the auto-load condition.

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

---

## Data Flow — Per Turn (After)

```
1. HTTP POST /chat/respond
   ├─ Async: pipeline (main LLM + TTS)    ~800ms
   └─ Async: grammar LLM call             ~500ms
        └─ both finish via asyncio.gather

2. chat.py merges → ChatResponse {
     response_text, audio_base64,
     grammar_summary,          ← lightweight, backward compat
     grammar_detail: {         ← new: full detail inline
       errors: [...],
       corrected_sentence,
       overall_score
     },
     tool_steps
   }

3. Frontend receives single response
   ├─ Renders agent reply + audio
   ├─ Reads grammar_detail → updates grammar state
   └─ No follow-up API call needed
```

---

## Error Handling

| Failure | Behavior |
|---------|----------|
| Grammar LLM call fails | `grammar_detail: null` in response; pipeline result unaffected |
| Main pipeline fails | Exception propagates normally; grammar result discarded |
| `asyncio.gather` partial failure | Each task wrapped in try/except; partial results returned |
| Frontend `grammar_detail` is null | `setGrammarErrors([])` + `setIsGrammarLoading(false)` silently |

---

## What Does NOT Change

- Grammar runs on every user turn — no opt-out flag added.
- `GET /grammar/detail_grammar_fb/:id` endpoint is kept — used for historical message viewing.
- Pronunciation assessment flow is unchanged.
- Tool call cap (`_TOOL_CALL_CAP = 5`) and tool loop logic are unchanged.
- `GrammarSummary` field in `ChatResponse` is kept for backward compatibility.

---

## Files Touched

| File | Change |
|------|--------|
| `app/agents/pipeline.py` | Remove grammar call from `_respond_node`; drop `grammar_json` from state/return |
| `app/core/ai_services.py` | Add `run_langraph_agent_async()`; extract `_run_pipeline()` |
| `app/api/chat.py` | `async def chat_respond`; call async runner; populate `grammar_detail` |
| `app/api/schemas.py` | Add `grammar_detail: GrammarDetailResponse \| None` to `ChatResponse` |
| `frontend/src/hooks/useSendChatMessage.ts` | Remove `fetchGrammarFeedback` call; read `data.grammar_detail` |
| `frontend/src/pages/VoiceAgent.tsx` | Skip grammar fetch if cached; guard topic-switch auto-load |
| `frontend/src/components/voice-agent/MessageBubble.tsx` | Add `grammarChecked` field to `Message` type |
| `tests/test_ai_services/test_ai_services.py` | Update sync calls to use `asyncio.run(run_langraph_agent_async(...))` |

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| LLM calls per turn | 2 sequential | 2 parallel |
| Turn latency (p50) | ~1.5s | ~900ms |
| HTTP calls per turn (frontend) | 2 (chat + grammar) | 1 |
| Grammar-on-click fetches | Every click | Only on cache miss |
| Topic-switch fetches | 2 concurrent | 1 sequential |
