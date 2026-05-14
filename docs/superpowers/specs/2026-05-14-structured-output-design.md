# Structured Output via Pydantic Models — Design Spec

**Date:** 2026-05-14
**Status:** Approved

---

## Problem

The LLM is instructed via system prompt to wrap its output in XML tags
(`<response>`, `<grammar>`, `<suggestions>`). Regex-based parsing in
`grammar_parser.split_combined_output_with_suggestions()` extracts each section.
When the LLM deviates from the format — omitting a wrapper, emitting bare JSON,
or placing suggestions outside tags — artifacts leak into `response_text` and
reach the client.

Root failure modes:
1. `<response>` tag missing → fallback strips `<grammar>`/`<suggestions>` XML but
   not bare `{"suggestions":[...]}` JSON blocks
2. Suggestions emitted as raw JSON without XML wrapper → not stripped, bleeds into
   `response_text`

---

## Goal

Eliminate XML leakage from `response_text` and `suggestions` on the non-tool path
(~95% of turns) by replacing regex parsing with `with_structured_output` +
Pydantic models. The tool-call path (flashcard turns) retains XML parsing as
fallback.

---

## Approach: Option A — Structured output on the non-tool path

Use LangChain's `with_structured_output(AgentOutput, method="json_mode")` when
`use_tools=False` in `_respond_node`. The LLM fills typed fields directly — no
XML tags, no regex, no leakage.

The tool path is unchanged: `tool_client` cannot coexist with `with_structured_output`
on a single Groq call (both use the tool-calling interface). XML parsing stays as
fallback after flashcard tool iterations.

---

## Components

| File | Change |
|------|--------|
| `app/agents/output_models.py` | **New.** Pydantic models: `GrammarErrorOutput`, `GrammarOutput`, `AgentOutput` |
| `app/services/groq_llm.py` | Add `structured_client` initialized with `client.with_structured_output(AgentOutput)` |
| `app/agents/pipeline.py` | `_respond_node`: use `structured_client` when `use_tools=False`; XML fallback on failure |
| `app/prompts/prompt_builder.py` | Add `use_structured_output: bool = False` to `build_system_prompt()`; skip XML format instructions when True |
| `app/services/grammar_parser.py` | Add `grammar_data_from_structured_output(grammar, user_input)` adapter |

`chat.py`, `schemas.py`, `ai_services.py` — **no changes**. Output types from
`run_langraph_agent()` are unchanged.

---

## Pydantic Models (`app/agents/output_models.py`)

```python
from pydantic import BaseModel, Field


class GrammarErrorOutput(BaseModel):
    cat: str                         # vt, art, prep, sv, sp, wc, punc, wo, pl, other
    sev: int = Field(ge=1, le=3)     # 1=minor  2=major  3=critical
    msg: str                         # one-sentence explanation
    eg: str | None = None            # optional example


class GrammarOutput(BaseModel):
    ann: str                         # annotated sentence with {wrong->correct} markers
    err: list[GrammarErrorOutput]    # parallel to annotation tokens, in order
    score: int = Field(ge=0, le=100)


class AgentOutput(BaseModel):
    response_text: str                               # plain coaching reply, no XML
    grammar: GrammarOutput | None = None             # None = no errors
    suggestions: list[str] = Field(default_factory=list)  # up to 3 next-turn prompts
```

Validation guarantees:
- `sev` outside `[1,3]` → `ValidationError` at parse time
- `score` outside `[0,100]` → caught immediately
- `suggestions` is always `list[str]`, never a JSON string or wrapped object
- `grammar=None` is explicit — no empty-dict ambiguity

---

## Data Flow

### Structured path (non-tool turns)

```
chat.py → run_langraph_agent()
  └─ pipeline.run()
       ├─ preflight_node  (unchanged)
       └─ respond_node  [use_tools=False]
            ├─ build_system_prompt(use_structured_output=True)
            │    └─ skips XML <response>/<grammar>/<suggestions> instructions
            ├─ structured_client.invoke(messages)
            │    └─ Groq returns typed AgentOutput
            ├─ response_text  ← agent_out.response_text
            ├─ grammar_raw    ← grammar_data_from_structured_output(agent_out.grammar)
            ├─ suggestions    ← agent_out.suggestions[:3]
            └─ tts_node  (unchanged)
```

### Tool path (flashcard turns — unchanged)

```
respond_node  [use_tools=True]
  ├─ tool_client.invoke(messages)
  ├─ if tool_calls → tools node → back to respond_node
  └─ final text → split_combined_output_with_suggestions()  (XML regex, existing)
```

### Fallback (structured call fails)

```
structured_client.invoke() raises
  → logger.warning("structured_output_failed — falling back to XML parse")
  → plain client.invoke() + split_combined_output_with_suggestions()
```

---

## Key Implementation Details

### `groq_llm.py`
```python
from app.agents.output_models import AgentOutput

# in __init__, after self.client is created:
self.structured_client = self.client.with_structured_output(AgentOutput, method="json_mode")
```

### `prompt_builder.py`
```python
def build_system_prompt(
    category: str | None = None,
    topic: str | None = None,
    include_grammar: bool = True,
    include_suggestions: bool = True,
    use_structured_output: bool = False,  # new
) -> str:
    ...
    if include_grammar and not use_structured_output:
        prompt_parts.append(_load_grammar_instruction())
        if include_suggestions:
            prompt_parts.append(_load_suggestions_instruction())
```

### `grammar_parser.py` — adapter
```python
def grammar_data_from_structured_output(
    grammar: "GrammarOutput | None",
    user_input: str,
) -> tuple[GrammarData, str | None]:
    if grammar is None:
        return GrammarData(), None
    grammar_raw = grammar.model_dump_json()
    return parse_annotated_grammar(grammar_raw, user_input), grammar_raw
```

`parse_annotated_grammar` already accepts a JSON string — reused without modification.

### `pipeline.py` — `_respond_node` structured branch

Two clearly separated invoke paths — `use_tools` determines which client and return type is used:

```python
use_tools = not cap_reached and bool(state.get("user_id")) and intent_requires_tool

if use_tools:
    # tool path — AIMessage, may have .tool_calls
    ai_msg: AIMessage = self.llm_service.tool_client.invoke(messages_to_send)
    if ai_msg.tool_calls:
        return {...}  # existing tool-call routing, unchanged
    # LLM chose not to call a tool — XML parse fallback
    raw_output = ai_msg.content or ""
    response_text, grammar_raw, suggestions = split_combined_output_with_suggestions(raw_output)
else:
    # structured path — returns AgentOutput directly, never has .tool_calls
    raw_output = None  # no raw text; raw_content stored as None in DB
    try:
        agent_out: AgentOutput = self.llm_service.structured_client.invoke(messages_to_send)
        response_text = agent_out.response_text
        _, grammar_raw = grammar_data_from_structured_output(
            agent_out.grammar, state["user_input"]
        )
        suggestions = agent_out.suggestions[:3]
    except Exception:
        logger.warning("structured_output_failed — falling back to XML parse")
        fallback_msg: AIMessage = self.llm_service.client.invoke(messages_to_send)
        raw_output = fallback_msg.content or ""
        response_text, grammar_raw, suggestions = split_combined_output_with_suggestions(raw_output)
```

`raw_output=None` on the structured path is intentional. `chat.py` stores it as `raw_content` in the DB;
`_fetch_visible_history` already falls back to `text_content` when `raw_content IS NULL`.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `ValidationError` from structured output | Caught by fallback; plain invoke + XML parse |
| `sev` / `score` out of range | Caught at Pydantic parse time before any downstream use |
| `grammar=None` (no errors) | `grammar_data_from_structured_output` returns `(GrammarData(), None)` |
| Structured call times out / 429 | Existing `RateLimitError` handler in `_respond_node` unchanged |
| Tool path final text (XML) | `split_combined_output_with_suggestions` unchanged |

---

## What Does NOT Change

- `chat.py` — no changes
- `schemas.py` — no changes
- `ai_services.py` — no changes
- `GrammarData`, `GrammarError` dataclasses — no changes
- `parse_annotated_grammar` — no changes
- Tool-call routing logic — no changes
- TTS node — no changes
- Audit logging — no changes

---

## Testing

- Unit test `AgentOutput` validation: `sev=0` raises, `score=101` raises, `grammar=None` valid
- Unit test `grammar_data_from_structured_output`: typed model → correct `GrammarData`
- Unit test `build_system_prompt(use_structured_output=True)`: assert no XML format instructions in output
- Integration test `_respond_node` structured path: mock `structured_client.invoke()` returning `AgentOutput`; assert `response_text` has no XML tags
- Integration test fallback: mock `structured_client.invoke()` raising; assert fallback runs and returns valid response
