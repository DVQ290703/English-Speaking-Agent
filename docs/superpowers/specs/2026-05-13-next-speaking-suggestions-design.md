# Next Speaking Suggestions Design

## Goal

Add "Next Speaking Suggestions" to the AI English Speaking Agent. For each normal assistant chat reply, the backend should generate exactly three short suggestions the learner can use for their next turn. Suggestions must be generated in the same final LLM call that already produces the spoken response and grammar feedback.

## Scope

In scope:
- Extend the LLM output contract to include a suggestions block.
- Parse suggestions separately from the spoken response and grammar block.
- Store suggestions on assistant messages.
- Return suggestions from the live chat response.
- Return suggestions when conversation history is fetched.
- Keep TTS limited to the spoken assistant response.
- Preserve existing flashcard tool behavior.

Out of scope:
- Frontend rendering changes.
- Separate suggestion-only LLM calls.
- TTS audio for suggestions.
- Suggestions for pure tool-call messages with no spoken text.

## Output Contract

The final assistant text reply should use three XML-style sections:

```xml
<response>
[Spoken assistant reply. Plain text only.]
</response>
<grammar>
{"ann":"...","err":[],"score":100}
</grammar>
<suggestions>
{"suggestions":["...","...","..."]}
</suggestions>
```

The `<response>` content remains the only text sent to TTS.

The `<grammar>` JSON keeps the existing compact grammar schema.

The `<suggestions>` JSON must contain one key, `suggestions`, whose value is a list of exactly three strings. The prompt should require exactly three, while backend parsing remains tolerant of imperfect model output. Each suggestion should be a learner-ready phrase or sentence, not an explanation. The three suggestions should represent different speaking directions, such as:
- a simple answer or continuation,
- a follow-up question,
- an opinion or experience-based response.

Each suggestion should be concise, natural, and relevant to the current agent response and conversation history.

## Backend Architecture

### Prompt Builder

Add a suggestions instruction section to `app/prompts/system_prompt.md` and include it through `app/prompts/prompt_builder.py` alongside the existing grammar instruction. The response node should continue to call `build_system_prompt(..., include_grammar=True)`.

The prompt should instruct the model to include suggestions only in final text replies. It should not include suggestions when the model is returning a tool call with no spoken text.

### Parser

Extend `app/services/grammar_parser.py` or a narrowly named parser helper in the same module to split:
- `response_text`
- `grammar_raw`
- `suggestions`

Keep backward compatibility:
- If `<suggestions>` is missing, return `[]`.
- If the JSON is malformed, return `[]`.
- If the value is not a list of strings, return `[]`.
- If the list has more than three valid strings, keep the first three.
- If the list has fewer than three strings, return the valid strings rather than failing the whole response.

The existing grammar parsing must keep working for current tests and legacy model output.

### Agent State

Add `suggestions: list[str]` to `AgentState`.

In `_respond_node`, parse suggestions from the same `ai_msg.content` that already contains the response and grammar. Store suggestions in state with `response_text` and `grammar_raw`.

In blocked or fallback paths, suggestions should be `[]`.

### Core AI Service

Update `run_langraph_agent()` to return:

```python
(response_text, audio_bytes, grammar_raw, tool_steps, suggestions)
```

Call sites should pass through suggestions without triggering TTS. Existing tests that mock `run_langraph_agent()` will need updates to include the fifth return value.

### Chat API

Add `suggestions: list[str]` to `ChatResponse`.

When persisting the assistant message, store suggestions on that assistant message. User messages should use the default empty array.

Return suggestions in `/chat/respond` next to `response_text`.

### Conversation History API

Add `suggestions: list[str]` to `MessageWithScoreOut` and include it in `/conversations/{conversation_id}/messages-with-scores`.

The SQL query should select `m.suggestions`. The response should return `[]` for null or non-assistant rows.

The older commented-out `MessageOut` endpoint does not need implementation unless it is re-enabled.

## Database Design

Add a JSONB column to `messages` in `db_schema/schema.sql` for fresh databases:

```sql
suggestions JSONB NOT NULL DEFAULT '[]',
```

Add the idempotent migration to `db_schema/seed.sql`, matching the existing init pattern used for other evolved columns:

```sql
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS suggestions JSONB NOT NULL DEFAULT '[]'::jsonb;
```

This keeps suggestions attached to the exact assistant message that generated them. A separate table is unnecessary because suggestions are small, read with messages, and do not need independent lifecycle management.

Seed assistant messages can keep the default `[]`; no seed rewrite is required unless tests need sample suggestions.

## Data Flow

1. User sends text or audio to `/chat/respond`.
2. The route loads visible conversation history from Postgres.
3. `run_langraph_agent()` invokes the LangGraph pipeline.
4. `_respond_node` uses one final LLM call to produce response, grammar, and suggestions.
5. The parser extracts the spoken response, grammar JSON, and suggestions JSON.
6. TTS runs only on `response_text`.
7. Output guardrails redact PII from `response_text` and from each suggestion before storage or API return.
8. The route stores:
   - user message with default suggestions `[]`,
   - assistant message with redacted parsed suggestions.
9. The API response returns the same suggestions list.
10. History APIs return stored suggestions for assistant messages.

## Error Handling

Suggestion parsing must never fail the chat turn. Any malformed or missing suggestions produce `[]`.

If the pipeline is guardrail-blocked, return the blocked response and `[]`.

If the pipeline falls back because of an exception or empty response, return fallback text and `[]`.

If TTS fails or is skipped due to tool use, suggestions are still returned when the final assistant text reply was parsed successfully.

## Testing

Parser tests:
- Splits response, grammar, and suggestions.
- Missing suggestions returns `[]`.
- Malformed suggestions JSON returns `[]`.
- Non-list suggestions returns `[]`.
- More than three suggestions keeps the first three.

Pipeline tests:
- Normal response state includes parsed suggestions.
- Tool-call retry behavior still returns response text and does not break existing tool tests.

API tests:
- `/chat/respond` returns suggestions from `run_langraph_agent()`.
- Assistant message insert includes suggestions JSON.
- `/messages-with-scores` returns suggestions for assistant messages and `[]` for user messages.

Schema tests or migration checks:
- `db_schema/schema.sql` defines `messages.suggestions`.
- `db_schema/seed.sql` adds the column idempotently for existing init flows.
