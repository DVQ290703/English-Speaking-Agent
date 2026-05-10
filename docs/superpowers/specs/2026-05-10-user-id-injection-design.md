# Design: Server-side user_id injection via RunnableConfig

**Date:** 2026-05-10  
**Branch:** feat/3rd_auth  
**Status:** Approved

## Problem

`user_id` is currently passed to flashcard tools as an LLM-visible parameter. The LLM receives it via the system prompt and forwards it in every tool call. This creates two issues:

1. **Information disclosure** — the UUID appears in tool call arguments, visible in UI traces and LangSmith runs.
2. **BOLA/IDOR vulnerability** — the LLM is not a trust boundary. A prompt injection attack could substitute a different `user_id`, allowing one user to read or modify another's data.

## Solution

Inject `user_id` server-side via LangGraph's `RunnableConfig`. The LLM never sees or handles the value.

## Architecture

```
Request arrives (user_id from JWT/session)
    → pipeline.run() passes config={"configurable": {"user_id": ...}, "metadata": {"user_id": ...}}
    → LangGraph forwards config through graph execution
    → ToolNode injects config into each tool call
    → Tools read user_id from config["configurable"]["user_id"]
    → LLM JSON schema never includes user_id
```

LangChain automatically excludes `RunnableConfig` parameters from tool JSON schemas, so the LLM sees no `user_id` field in any tool definition.

## Files Changed

### `app/agents/tools/flashcard_tools.py`

All 7 tools (`list_decks`, `create_deck`, `create_card`, `update_card`, `search_cards`, `get_due_cards`, `submit_card_review`, `get_deck_stats`):

- Remove `user_id: str` parameter from function signature
- Add `config: RunnableConfig` parameter (injected by LangGraph, excluded from LLM schema)
- Read `user_id = config["configurable"]["user_id"]` at top of function body

### `app/agents/pipeline.py`

Two changes:

1. **`_respond_node`** — remove `user_id` from system prompt injection (lines 84–91). Keep the tool use policy text but strip the `f"use this user_id: {user_id}"` line.

2. **`run()`** — pass config to `self.app.invoke()`:
   ```python
   self.app.invoke(
       initial_state,
       config={
           "configurable": {"user_id": user_id},
           "metadata": {"user_id": user_id},
       }
   )
   ```

### `app/agents/state.py`

No changes. `user_id` remains in `AgentState` — it is still used in `pipeline.py` to gate tool-calling (`use_tools = bool(state.get("user_id"))`).

## LangSmith Observability

- Tool call inputs in traces will no longer show `user_id` (security improvement)
- `user_id` is passed as `metadata` in config, so it remains searchable and filterable in LangSmith runs without leaking into LLM-visible tool args

## Security Outcome

| Concern | Before | After |
|---|---|---|
| LLM sees user_id | Yes (system prompt) | No |
| user_id in tool call args | Yes (trace-visible) | No |
| BOLA attack surface | LLM could pass wrong UUID | Impossible |
| LangSmith observability | user_id in tool args | user_id in run metadata |
| Graph recompiled per request | No | No |
