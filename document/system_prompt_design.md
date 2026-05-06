# System Prompt Design

## Overview

The system prompt is dynamically composed on every request based on the `category` and `topic` sent by the client. It is **never persisted** — it exists only in memory for the duration of one LLM API call.

---

## Prompt Composition

The final system prompt is assembled in layers by `prompts/prompt_builder.py::build_system_prompt()`.

```
┌──────────────────────────────────┐
│  Layer 1: Base prompt            │  prompts/system_prompt.md
│  (always present)                │  General English coach persona,
│                                  │  tone, and response style rules
├──────────────────────────────────┤
│  Layer 2: Category prompt        │  prompts/topic_prompts.md
│  (if category provided)          │  # Topic: <category_key>
│                                  │  Context for this learning domain
├──────────────────────────────────┤
│  Layer 3: Topic prompt           │  prompts/topic_prompts.md
│  (if topic provided)             │  ## Sub-topic: <topic_key>
│                                  │  Specific scenario instructions
├──────────────────────────────────┤
│  Layer 4: Grammar instruction    │  Hardcoded in prompt_builder.py
│  (always present on chat)        │  Defines strict JSON output format
│                                  │  for grammar analysis
└──────────────────────────────────┘
```

Each layer is joined with `\n\n---\n\n` as a separator. Missing layers are silently skipped.

---

## Prompt Files

| File | Role | Format |
|------|------|--------|
| `prompts/system_prompt.md` | Base persona and coaching rules | Plain markdown |
| `prompts/topic_prompts.md` | Prompt index that includes split topic files | Structured markdown (see below) |
| `prompts/topic_prompts/*.md` | Category and topic-specific instructions | Structured markdown sections |

### `topic_prompts.md` Structure

```markdown
!include topic_prompts/daily_conversation.md
---
!include topic_prompts/job_interview.md
```

Each included file keeps the same internal structure:

```markdown
# Topic: daily_conversation
<category-level context>

## Sub-topic: ordering_food
<scenario-specific instructions>
```

Keys are normalized at parse time: `"Ordering Food"` → `"ordering_food"` (lowercase, non-alphanumeric → underscore).

---

## Caching

Prompt files are read from disk once and cached in a module-level dict keyed by file `mtime`.

```python
_CACHE = {
    "base_mtime": None, "base": None,      # system_prompt.md
    "topics_signature": None, "topics": None,  # topic_prompts.md + included files
}
```

On each request, `stat().st_mtime` is checked. If the file has not changed, the cached value is returned. If it has changed (e.g. hot-reload in dev), the file is re-read and re-parsed automatically. **No restart required.**

---

## Request Lifecycle

```
POST /api/chat/respond  { category, topic, text/audio, ... }
        │
        ▼
chat.py extracts category, topic from form params
        │
        ▼
run_langraph_agent(user_input, history, category, topic)
        │
        ▼
pipeline.run(...)  →  AgentState{ category, topic, history, ... }
        │
        ▼
_respond_node calls:
  generate_response_with_grammar(user_input, history, category, topic)
        │
        ├─→  build_system_prompt(category, topic, include_grammar=True)
        │       assembles layers 1–4 in memory
        │
        └─→  Groq API call:
               messages[0]  = SystemMessage(composed_prompt)   ← injected here
               messages[1…n] = history[-8:] (last 4 turns)
               messages[-1]  = HumanMessage(user_input)
        │
        ▼
LLM returns JSON  →  parse response_text + grammar_json
        │
        ▼
DB write: only user_input + response_text saved
          system prompt is NEVER written to DB
```

---

## Separation of Concerns

| Data | Persisted to DB | Sent to LLM |
|------|-----------------|-------------|
| System prompt | No | Yes — position `[0]` every call |
| Category / Topic | Yes (on conversation row) | Yes — used to build system prompt |
| Conversation history | Yes (message rows) | Yes — last 8 lines (`history[-8:]`) |
| Grammar JSON | Yes (grammar_feedback row) | No |
| Audio bytes | Yes (MinIO object) | No |

---

## Why the System Prompt Cannot Accumulate or Duplicate

The system prompt is constructed in memory and placed at `messages[0]` before each Groq API call. It is not part of `history_lines` (the list fetched from DB) and is never saved back to the DB. Therefore:

- A 100-turn conversation sends exactly **one** system prompt to the LLM per request.
- The history window is capped at `history[-8:]` (last 4 turns), so the total messages array is always bounded: `1 (system) + 8 (history) + 1 (current) = 10 messages max`.

---

## Fallback Behavior

| Condition | Fallback |
|-----------|----------|
| `system_prompt.md` missing | Inline hardcoded string in `groq_llm.py` |
| `topic_prompts.md` missing | Only base prompt used, no category/topic layer |
| `category` not found in topics dict | Generic "learner selected this category" sentence appended |
| `topic` not found in category options | Generic "learner selected this topic" sentence appended |
| LLM returns invalid JSON (grammar mode) | Falls back to `generate_response()` (plain text, no grammar) |

---

## Adding a New Category or Topic

1. Open `prompts/topic_prompts.md`
2. Add a new section following the existing format:

```markdown
# Topic: <new_category_key>
<describe the learning context and coaching approach>

## Sub-topic: <scenario_key>
<specific scenario instructions for the LLM>
```

3. Register the category and topic in the database `categories` / `topics` tables so the API can validate and resolve them.
4. No code change or restart needed — the file cache invalidates on `mtime` change.
