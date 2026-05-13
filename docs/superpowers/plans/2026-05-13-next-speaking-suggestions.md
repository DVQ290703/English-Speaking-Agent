# Next Speaking Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate, persist, and return three learner-ready next-turn suggestions from the same LLM call that produces the assistant reply and grammar feedback.

**Architecture:** Keep the existing chat pipeline shape and add suggestions as a third XML-style output section. Add a suggestions-aware parser while preserving the current two-value `split_combined_output()` API for older callers. Store parsed suggestions as JSONB on assistant messages and return them through live chat and conversation history responses.

**Tech Stack:** FastAPI, Pydantic, LangGraph, LangChain messages, psycopg2, PostgreSQL JSONB, pytest.

---

## File Structure

- Modify `app/services/grammar_parser.py`: parse `<suggestions>` JSON and expose `split_combined_output_with_suggestions()`.
- Modify `tests/test_grammar_parser/test_annotated_grammar.py`: cover suggestion parsing and backward-compatible response parsing.
- Modify `app/prompts/system_prompt.md`: add the model-facing `<suggestions>` output contract.
- Modify `app/prompts/prompt_builder.py`: load and append the suggestions instruction section.
- Modify `tests/test_ai_services/test_prompt_builder_grammar.py`: cover suggestions prompt assembly.
- Modify `app/agents/state.py`: add `suggestions` to the LangGraph state.
- Modify `app/agents/pipeline.py`: parse suggestions from the final response LLM call and keep them out of TTS.
- Modify `app/core/ai_services.py`: return suggestions as the fifth tuple element.
- Modify `tests/test_agents/test_pipeline_voice_accent.py`, `tests/test_agents/test_pipeline_guardrail.py`, `tests/test_agents/test_pipeline_tool_use_failed.py`, and `tests/test_ai_services/test_ai_services.py`: update pipeline/service expectations.
- Modify `app/api/schemas.py`: add `suggestions` to `ChatResponse` and `MessageWithScoreOut`.
- Modify `app/api/chat.py`: unpack suggestions, redact PII in them, store them for assistant messages, and return them.
- Modify `app/api/conversations.py`: select and return stored assistant suggestions in message history.
- Modify `tests/test_api/test_routes.py`, `tests/test_api/test_user_data_flow.py`, `tests/test_api/test_topic_conversations.py`, `tests/test_api/test_schemas.py`, and `tests/test_api/test_tool_call_step_schema.py`: update route/schema expectations and mocked agent return tuples.
- Modify `db_schema/schema.sql`: add the JSONB column for fresh databases.
- Modify `db_schema/seed.sql`: add an idempotent migration for existing init flows.
- Create `tests/test_db_schema/test_messages_suggestions_schema.py`: verify schema and migration SQL.

---

### Task 1: Suggestions Parser

**Files:**
- Modify: `tests/test_grammar_parser/test_annotated_grammar.py`
- Modify: `app/services/grammar_parser.py`

- [ ] **Step 1: Write parser tests**

Add these tests to `tests/test_grammar_parser/test_annotated_grammar.py` under `TestSplitCombinedOutput`:

```python
    def test_splits_response_grammar_and_suggestions(self):
        from app.services.grammar_parser import split_combined_output_with_suggestions

        raw = (
            "<response>Nice answer.</response>"
            '<grammar>{"ann":"I like hiking.","err":[],"score":100}</grammar>'
            '<suggestions>{"suggestions":["I usually hike on weekends.","What trails do you recommend?","In my experience, hiking helps me clear my head."]}</suggestions>'
        )

        text, grammar, suggestions = split_combined_output_with_suggestions(raw)

        assert text == "Nice answer."
        assert grammar == '{"ann":"I like hiking.","err":[],"score":100}'
        assert suggestions == [
            "I usually hike on weekends.",
            "What trails do you recommend?",
            "In my experience, hiking helps me clear my head.",
        ]

    def test_missing_suggestions_returns_empty_list(self):
        from app.services.grammar_parser import split_combined_output_with_suggestions

        raw = '<response>Hello!</response><grammar>{"ann":"x","err":[],"score":100}</grammar>'

        assert split_combined_output_with_suggestions(raw) == (
            "Hello!",
            '{"ann":"x","err":[],"score":100}',
            [],
        )

    def test_malformed_suggestions_returns_empty_list(self):
        from app.services.grammar_parser import split_combined_output_with_suggestions

        raw = "<response>Hello!</response><suggestions>not json</suggestions>"

        assert split_combined_output_with_suggestions(raw) == ("Hello!", None, [])

    def test_non_list_suggestions_returns_empty_list(self):
        from app.services.grammar_parser import split_combined_output_with_suggestions

        raw = '<response>Hello!</response><suggestions>{"suggestions":"ask more"}</suggestions>'

        assert split_combined_output_with_suggestions(raw) == ("Hello!", None, [])

    def test_more_than_three_suggestions_keeps_first_three(self):
        from app.services.grammar_parser import split_combined_output_with_suggestions

        raw = (
            "<response>Hello!</response>"
            '<suggestions>{"suggestions":["one","two","three","four"]}</suggestions>'
        )

        assert split_combined_output_with_suggestions(raw) == ("Hello!", None, ["one", "two", "three"])

    def test_missing_response_tag_strips_grammar_and_suggestions_blocks(self):
        from app.services.grammar_parser import split_combined_output_with_suggestions

        raw = (
            "Hello outside tags"
            '<grammar>{"ann":"x","err":[],"score":100}</grammar>'
            '<suggestions>{"suggestions":["one"]}</suggestions>'
        )

        assert split_combined_output_with_suggestions(raw) == (
            "Hello outside tags",
            '{"ann":"x","err":[],"score":100}',
            ["one"],
        )
```

- [ ] **Step 2: Run parser tests and verify failure**

Run:

```bash
pytest tests/test_grammar_parser/test_annotated_grammar.py::TestSplitCombinedOutput -v
```

Expected: the new tests fail with `ImportError` because `split_combined_output_with_suggestions` is not defined.

- [ ] **Step 3: Implement parser support**

Update the top-level regex definitions in `app/services/grammar_parser.py`:

```python
_RESPONSE_TAG_RE = re.compile(r"<response>(.*?)</response>", re.DOTALL)
_GRAMMAR_TAG_RE = re.compile(r"<grammar>(.*?)</grammar>", re.DOTALL)
_SUGGESTIONS_TAG_RE = re.compile(r"<suggestions>(.*?)</suggestions>", re.DOTALL)
```

Add these helpers above the existing `split_combined_output()`:

```python
def _parse_suggestions_raw(suggestions_raw: str | None) -> list[str]:
    """Parse compact suggestions JSON. Never raises."""
    if not suggestions_raw:
        return []
    try:
        data = json.loads(suggestions_raw)
    except json.JSONDecodeError:
        logger.warning("parse_suggestions: failed to parse suggestions JSON")
        return []

    values = data.get("suggestions") if isinstance(data, dict) else None
    if not isinstance(values, list):
        return []

    suggestions: list[str] = []
    for value in values:
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned:
                suggestions.append(cleaned)
        if len(suggestions) == 3:
            break
    return suggestions


def split_combined_output_with_suggestions(raw: str) -> tuple[str, str | None, list[str]]:
    """Split response, grammar, and suggestions sections from LLM output."""
    response_match = _RESPONSE_TAG_RE.search(raw)
    grammar_match = _GRAMMAR_TAG_RE.search(raw)
    suggestions_match = _SUGGESTIONS_TAG_RE.search(raw)

    grammar_raw = grammar_match.group(1).strip() if grammar_match else None
    suggestions_raw = suggestions_match.group(1).strip() if suggestions_match else None

    if response_match:
        response_text = response_match.group(1).strip()
    else:
        response_text = _SUGGESTIONS_TAG_RE.sub("", _GRAMMAR_TAG_RE.sub("", raw)).strip()

    return response_text, grammar_raw, _parse_suggestions_raw(suggestions_raw)
```

Replace the body of `split_combined_output()` with:

```python
def split_combined_output(raw: str) -> tuple[str, str | None]:
    """Split response and grammar from LLM output, preserving the original API."""
    response_text, grammar_raw, _suggestions = split_combined_output_with_suggestions(raw)
    return response_text, grammar_raw
```

- [ ] **Step 4: Run parser tests and verify pass**

Run:

```bash
pytest tests/test_grammar_parser/test_annotated_grammar.py -v
```

Expected: all tests in the file pass.

- [ ] **Step 5: Commit parser support**

```bash
git add app/services/grammar_parser.py tests/test_grammar_parser/test_annotated_grammar.py
git commit -m "feat: parse next speaking suggestions"
```

---

### Task 2: Prompt Contract

**Files:**
- Modify: `tests/test_ai_services/test_prompt_builder_grammar.py`
- Modify: `app/prompts/prompt_builder.py`
- Modify: `app/prompts/system_prompt.md`

- [ ] **Step 1: Write prompt builder tests**

Add these tests to `TestBuildSystemPromptGrammar` in `tests/test_ai_services/test_prompt_builder_grammar.py`:

```python
    def test_suggestions_block_appended_with_grammar(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(
            tmp_path,
            system_prompt="base",
            grammar_instruction="GRAMMAR BLOCK",
            suggestions_instruction="SUGGESTIONS BLOCK",
        )
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        prompt = pb.build_system_prompt(include_grammar=True)

        assert "GRAMMAR BLOCK" in prompt
        assert "SUGGESTIONS BLOCK" in prompt

    def test_suggestions_block_absent_when_disabled(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(
            tmp_path,
            system_prompt="base",
            grammar_instruction="GRAMMAR BLOCK",
            suggestions_instruction="SUGGESTIONS BLOCK",
        )
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        prompt = pb.build_system_prompt(include_grammar=True, include_suggestions=False)

        assert "GRAMMAR BLOCK" in prompt
        assert "SUGGESTIONS BLOCK" not in prompt
```

Update `TestLoadSections.test_parses_all_sections()` so `_write_sections_file()` includes `suggestions_instruction="suggestions content"` and assert:

```python
        assert sections["suggestions_instruction"] == "suggestions content"
```

- [ ] **Step 2: Run prompt tests and verify failure**

Run:

```bash
pytest tests/test_ai_services/test_prompt_builder_grammar.py -v
```

Expected: at least one test fails with `TypeError: build_system_prompt() got an unexpected keyword argument 'include_suggestions'`.

- [ ] **Step 3: Implement prompt builder support**

Add this fallback string in `app/prompts/prompt_builder.py` after `_GRAMMAR_FALLBACK`:

```python
_SUGGESTIONS_FALLBACK = """\
---

SUGGESTIONS FORMAT - include this block in every final text reply:

<suggestions>
{"suggestions":["<simple continuation>","<follow-up question>","<opinion or experience response>"]}
</suggestions>

Suggestion rules:
- Generate exactly 3 suggestions for the learner's next turn.
- Each suggestion must be one natural English phrase or sentence the learner can say directly.
- Make the 3 suggestions meaningfully different: simple continuation, follow-up question, and opinion or experience response.
- Keep each suggestion concise and relevant to the latest assistant response and conversation history.
- Do not include suggestions when your response is only a tool call with no spoken text.
- The 75-word limit applies only to the spoken <response> block, not this JSON block.\
"""
```

Add `suggestions_instruction` to `_fallback_sections()`:

```python
        "suggestions_instruction": _SUGGESTIONS_FALLBACK,
```

Add this loader below `_load_grammar_instruction()`:

```python
def _load_suggestions_instruction() -> str:
    return _load_sections().get("suggestions_instruction") or _SUGGESTIONS_FALLBACK
```

Change the `build_system_prompt()` signature and final append logic:

```python
def build_system_prompt(
    category: str | None = None,
    topic: str | None = None,
    include_grammar: bool = True,
    include_suggestions: bool = True,
) -> str:
```

```python
    if include_grammar:
        prompt_parts.append(_load_grammar_instruction())
        logger.debug("prompt_builder layer=grammar injected")
        if include_suggestions:
            prompt_parts.append(_load_suggestions_instruction())
            logger.debug("prompt_builder layer=suggestions injected")
```

- [ ] **Step 4: Add the real prompt section**

Add this section to `app/prompts/system_prompt.md` after `<!-- END: grammar_instruction -->` and before `<!-- BEGIN: preflight_prompt -->`:

```markdown
<!-- BEGIN: suggestions_instruction -->
---

SUGGESTIONS FORMAT - include this block in every final text reply:

<suggestions>
{"suggestions":["<simple continuation>","<follow-up question>","<opinion or experience response>"]}
</suggestions>

Suggestion rules:
- Generate exactly 3 suggestions for the learner's next turn.
- Each suggestion must be one natural English phrase or sentence the learner can say directly.
- Make the 3 suggestions meaningfully different: simple continuation, follow-up question, and opinion or experience response.
- Keep each suggestion concise and relevant to the latest assistant response and conversation history.
- Do not include suggestions when your response is only a tool call with no spoken text.
- The 75-word limit applies only to the spoken <response> block, not this JSON block.
<!-- END: suggestions_instruction -->
```

- [ ] **Step 5: Run prompt tests and verify pass**

Run:

```bash
pytest tests/test_ai_services/test_prompt_builder_grammar.py -v
```

Expected: all tests in the file pass.

- [ ] **Step 6: Commit prompt contract**

```bash
git add app/prompts/prompt_builder.py app/prompts/system_prompt.md tests/test_ai_services/test_prompt_builder_grammar.py
git commit -m "feat: add suggestions prompt contract"
```

---

### Task 3: Pipeline And Core Service Propagation

**Files:**
- Modify: `app/agents/state.py`
- Modify: `app/agents/pipeline.py`
- Modify: `app/core/ai_services.py`
- Modify: `tests/test_agents/test_pipeline_voice_accent.py`
- Modify: `tests/test_agents/test_pipeline_guardrail.py`
- Modify: `tests/test_agents/test_pipeline_tool_use_failed.py`
- Modify: `tests/test_ai_services/test_ai_services.py`

- [ ] **Step 1: Write pipeline suggestion test**

Create `tests/test_agents/test_pipeline_suggestions.py`:

```python
import os
import sys
import types
from unittest.mock import MagicMock

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")

_lc_groq = types.ModuleType("langchain_groq")
_lc_groq.ChatGroq = MagicMock  # type: ignore[attr-defined]
sys.modules.setdefault("langchain_groq", _lc_groq)


def test_pipeline_parses_suggestions_from_final_llm_response():
    from langchain_core.messages import AIMessage

    from app.agents.pipeline import VoiceAgentPipeline

    llm_mock = MagicMock()
    llm_mock.model_name = "test-model"
    llm_mock.client.invoke.side_effect = [
        AIMessage(content="SAFETY: SAFE\nTOOL: NO_TOOL"),
        AIMessage(
            content=(
                "<response>Nice answer.</response>"
                '<grammar>{"ann":"I like hiking.","err":[],"score":100}</grammar>'
                '<suggestions>{"suggestions":["I usually hike on weekends.","What trails do you recommend?","In my experience, hiking helps me clear my head."]}</suggestions>'
            )
        ),
    ]
    llm_mock.tool_client.invoke.side_effect = AssertionError("tool client should not be used")

    tts_mock = MagicMock()
    tts_mock.convert_text_to_speech.return_value = b"audio"

    pipeline = VoiceAgentPipeline(llm_service=llm_mock, tts_service=tts_mock)

    result = pipeline.run(user_input="I like hiking.")

    assert result["response_text"] == "Nice answer."
    assert result["grammar_raw"] == '{"ann":"I like hiking.","err":[],"score":100}'
    assert result["suggestions"] == [
        "I usually hike on weekends.",
        "What trails do you recommend?",
        "In my experience, hiking helps me clear my head.",
    ]
    tts_mock.convert_text_to_speech.assert_called_once_with(
        "Nice answer.",
        voice_gender=None,
        voice_accent=None,
    )
```

- [ ] **Step 2: Update core service tests for the new return tuple**

In `tests/test_ai_services/test_ai_services.py`, update both `_mock_pipeline()` helpers so their `run.return_value` includes:

```python
            "suggestions": ["Try one.", "Ask one?", "Share one."],
```

Update destructuring from:

```python
text, audio, grammar, tool_steps = run_langraph_agent("Tell me about IELTS", history=[])
```

to:

```python
text, audio, grammar, tool_steps, suggestions = run_langraph_agent("Tell me about IELTS", history=[])
```

Add this assertion to the happy-path test:

```python
        assert suggestions == ["Try one.", "Ask one?", "Share one."]
```

For fallback, exception, and guardrail-blocked tests, assert:

```python
        assert suggestions == []
```

- [ ] **Step 3: Run pipeline and service tests and verify failure**

Run:

```bash
pytest tests/test_agents/test_pipeline_suggestions.py tests/test_ai_services/test_ai_services.py::TestRunLangraphAgent tests/test_ai_services/test_ai_services.py::TestRunLangraphAgentAccent tests/test_ai_services/test_ai_services.py::test_run_langraph_agent_blocked_skips_tts -v
```

Expected: tests fail because pipeline state and `run_langraph_agent()` do not expose suggestions yet.

- [ ] **Step 4: Implement state and pipeline propagation**

In `app/agents/state.py`, add:

```python
    suggestions: list[str]   # next-turn suggestions parsed from the final LLM response
```

In `app/agents/pipeline.py`, change the import inside `_respond_node()`:

```python
        from app.services.grammar_parser import split_combined_output_with_suggestions
```

Change the parse line:

```python
        response_text, grammar_raw, suggestions = split_combined_output_with_suggestions(raw_output)
```

Add `suggestions` to the final `_respond_node()` return:

```python
            "suggestions": suggestions,
```

Add `suggestions: []` to the RateLimitError return:

```python
                    "suggestions": [],
```

Add `suggestions: []` to the blocked return in `_preflight_node()`:

```python
                "suggestions": [],
```

Add `suggestions` to `initial_state` in `run()`:

```python
            "suggestions": [],
```

- [ ] **Step 5: Implement core service propagation**

In `app/core/ai_services.py`, change the return docstring:

```python
) -> tuple[str, bytes, str | None, list, list[str]]:
    """Run the conversation pipeline and return (response_text, audio_bytes, grammar_raw, tool_steps, suggestions)."""
```

Change the guardrail-blocked return:

```python
            return response_text, b"", None, [], []
```

Read suggestions from the pipeline result:

```python
        suggestions: list[str] = result.get("suggestions") or []
```

Add `suggestions` to the success return:

```python
            return response_text, audio_bytes, grammar_raw, tool_steps, suggestions
```

Change the fallback return:

```python
    return fallback_text, _synthesize_audio_bytes(fallback_text, voice_gender=voice_gender, voice_accent=voice_accent), None, [], []
```

- [ ] **Step 6: Update existing pipeline tests that assert plain responses**

In pipeline tests that create `AIMessage(content="Hello!")` or similar untagged responses, add assertions only where useful:

```python
    assert result["suggestions"] == []
```

Do not change the mocked `AIMessage` content in unrelated voice-accent and guardrail tests.

- [ ] **Step 7: Run pipeline and service tests and verify pass**

Run:

```bash
pytest tests/test_agents/test_pipeline_suggestions.py tests/test_agents/test_pipeline_voice_accent.py tests/test_agents/test_pipeline_guardrail.py tests/test_agents/test_pipeline_tool_use_failed.py tests/test_ai_services/test_ai_services.py::TestRunLangraphAgent tests/test_ai_services/test_ai_services.py::TestRunLangraphAgentAccent tests/test_ai_services/test_ai_services.py::test_run_langraph_agent_blocked_skips_tts -v
```

Expected: all selected tests pass.

- [ ] **Step 8: Commit pipeline propagation**

```bash
git add app/agents/state.py app/agents/pipeline.py app/core/ai_services.py tests/test_agents/test_pipeline_suggestions.py tests/test_agents/test_pipeline_voice_accent.py tests/test_agents/test_pipeline_guardrail.py tests/test_agents/test_pipeline_tool_use_failed.py tests/test_ai_services/test_ai_services.py
git commit -m "feat: propagate next speaking suggestions"
```

---

### Task 4: Live Chat API Response And Persistence

**Files:**
- Modify: `app/api/schemas.py`
- Modify: `app/api/chat.py`
- Modify: `tests/test_api/test_schemas.py`
- Modify: `tests/test_api/test_tool_call_step_schema.py`
- Modify: `tests/test_api/test_routes.py`
- Modify: `tests/test_api/test_user_data_flow.py`
- Modify: `tests/test_api/test_topic_conversations.py`

- [ ] **Step 1: Write schema tests**

In `tests/test_api/test_schemas.py`, add this assertion to `TestChatResponse.test_chat_response_defaults()`:

```python
        assert r.suggestions == []
```

Add this test to `TestChatResponse`:

```python
    def test_chat_response_with_suggestions(self):
        r = ChatResponse(
            user_input="hi",
            response_text="hello",
            conversation_id="conv-1",
            suggestions=["I can add one detail.", "What do you think?", "In my experience, it helps."],
        )

        assert r.suggestions == [
            "I can add one detail.",
            "What do you think?",
            "In my experience, it helps.",
        ]
```

- [ ] **Step 2: Write chat route tests**

In `tests/test_api/test_routes.py`, add this test to `TestChatRespond`:

```python
    def test_chat_respond_returns_and_stores_suggestions(self):
        suggestions = [
            "I usually practice after work.",
            "What should I focus on next?",
            "In my experience, short daily practice works best.",
        ]
        fresh_conn = _make_conn(
            fetchone_by_sql={
                "insert into conversations": (self._conv_id,),
                "max(turn_number)": (1,),
            }
        )
        with (
            patch("app.api.chat.run_langraph_agent", return_value=("Great job!", b"", None, [], suggestions)),
            patch("app.api.chat.store_user_audio", return_value=None),
            patch("app.api.chat._upload"),
        ):
            with _client(fresh_conn) as (c, cursor):
                r = c.post("/api/chat/respond", data={"text": "Hello"}, headers=self._headers())

        assert r.status_code == 200
        assert r.json()["suggestions"] == suggestions

        assistant_insert = [
            call for call in cursor.execute.call_args_list
            if "insert into messages" in " ".join(call.args[0].lower().split())
            and "'assistant'" in call.args[0].lower()
        ][0]
        assert assistant_insert.args[1][-1] == json.dumps(suggestions)
```

Add this test to the same class:

```python
    def test_chat_respond_redacts_pii_from_suggestions(self):
        suggestions = [
            "Email me at learner@example.com.",
            "What should I practice next?",
            "In my experience, repetition helps.",
        ]
        fresh_conn = _make_conn(
            fetchone_by_sql={
                "insert into conversations": (self._conv_id,),
                "max(turn_number)": (1,),
            }
        )
        with (
            patch("app.api.chat.run_langraph_agent", return_value=("Great job!", b"", None, [], suggestions)),
            patch("app.api.chat.store_user_audio", return_value=None),
            patch("app.api.chat._upload"),
        ):
            with _client(fresh_conn) as (c, _):
                r = c.post("/api/chat/respond", data={"text": "Hello"}, headers=self._headers())

        assert r.status_code == 200
        assert r.json()["suggestions"][0] == "Email me at [EMAIL REDACTED]."
```

At the top of `tests/test_api/test_routes.py`, `json` is already imported. If the file in the working tree does not import `json`, add:

```python
import json
```

- [ ] **Step 3: Update existing mocked agent return tuples**

In these files, change every patched `run_langraph_agent` return value from four values to five values by adding a final `[]`:

```python
("Great job!", b"mp3data", None, [])
```

becomes:

```python
("Great job!", b"mp3data", None, [], [])
```

Apply this to:
- `tests/test_api/test_routes.py`
- `tests/test_api/test_user_data_flow.py`
- `tests/test_api/test_topic_conversations.py`

- [ ] **Step 4: Run API schema and route tests and verify failure**

Run:

```bash
pytest tests/test_api/test_schemas.py::TestChatResponse tests/test_api/test_tool_call_step_schema.py tests/test_api/test_routes.py::TestChatRespond -v
```

Expected: new tests fail because `ChatResponse.suggestions` and chat route unpacking/persistence are not implemented.

- [ ] **Step 5: Implement `ChatResponse.suggestions`**

In `app/api/schemas.py`, add this field to `ChatResponse`:

```python
    suggestions: list[str] = Field(default_factory=list)
```

- [ ] **Step 6: Implement chat route propagation, redaction, storage, and response**

In `app/api/chat.py`, update the agent call unpacking:

```python
    response_text, response_audio_bytes, grammar_raw, tool_steps, suggestions = run_langraph_agent(
```

After output guardrails process `response_text`, redact suggestions:

```python
    redacted_suggestions: list[str] = []
    for suggestion in suggestions:
        suggestion_result = _output_guardrails.check(suggestion)
        redacted_suggestions.append(suggestion_result.text)
        _all_flags.extend(suggestion_result.flags)
    suggestions = redacted_suggestions
```

Keep `_guardrail_decisions["output_pii_redacted"]` after suggestion redaction so the flag reflects both response text and suggestions.

Change the assistant message insert SQL:

```python
                INSERT INTO messages (id, conversation_id, turn_id, role, input_mode, text_content, suggestions)
                VALUES (%s, %s, %s, 'assistant', 'text', %s, %s::jsonb)
```

Change the assistant insert params:

```python
                (assistant_message_id, conv_id, turn_id, response_text, _json.dumps(suggestions)),
```

Add suggestions to the `ChatResponse` constructor return:

```python
        suggestions=suggestions,
```

- [ ] **Step 7: Run API schema and route tests and verify pass**

Run:

```bash
pytest tests/test_api/test_schemas.py::TestChatResponse tests/test_api/test_tool_call_step_schema.py tests/test_api/test_routes.py::TestChatRespond tests/test_api/test_routes.py::TestChatRespondVoiceAccent tests/test_api/test_user_data_flow.py::TestUserLifecycle::test_step4_first_chat_creates_conversation_and_returns_id tests/test_api/test_topic_conversations.py -v
```

Expected: all selected tests pass.

- [ ] **Step 8: Commit live chat API support**

```bash
git add app/api/schemas.py app/api/chat.py tests/test_api/test_schemas.py tests/test_api/test_tool_call_step_schema.py tests/test_api/test_routes.py tests/test_api/test_user_data_flow.py tests/test_api/test_topic_conversations.py
git commit -m "feat: return and store chat suggestions"
```

---

### Task 5: Conversation History Suggestions

**Files:**
- Modify: `app/api/schemas.py`
- Modify: `app/api/conversations.py`
- Modify: `tests/test_api/test_routes.py`
- Modify: `tests/test_api/test_user_data_flow.py`

- [ ] **Step 1: Write history route tests**

In `tests/test_api/test_routes.py`, add this test to `TestGetConversationMessages`:

```python
    def test_get_messages_returns_assistant_suggestions(self):
        now = datetime.now(timezone.utc)
        suggestions = [
            "I usually practice in the morning.",
            "What routine works best for you?",
            "In my experience, consistency matters most.",
        ]
        conn = _make_conn(
            fetchone_side_effect=[(self._conv_id,)],
            fetchall_value=[
                (self._msg_id, "user", "text", "Hello AI", now, [], None, None, None, None, None, None, None, None),
                (_new_uuid(), "assistant", "text", "Hello human!", now, suggestions, None, None, None, None, None, None, None, None),
            ],
        )

        with _client(conn) as (c, _):
            r = c.get(f"/api/conversations/{self._conv_id}/messages-with-scores", headers=self._headers())

        assert r.status_code == 200
        body = r.json()
        assert body["messages"][0]["suggestions"] == []
        assert body["messages"][1]["suggestions"] == suggestions
```

Update existing `fetchall_value` rows for `/messages-with-scores` tests in `tests/test_api/test_routes.py` and `tests/test_api/test_user_data_flow.py` by inserting the suggestions value after `created_at`. For existing rows, use `[]`.

Example old row:

```python
(self._msg_id, "user", "text", "Hello AI", now, None, None, None, None, None, None, None, None)
```

New row:

```python
(self._msg_id, "user", "text", "Hello AI", now, [], None, None, None, None, None, None, None, None)
```

- [ ] **Step 2: Run history route tests and verify failure**

Run:

```bash
pytest tests/test_api/test_routes.py::TestGetConversationMessages tests/test_api/test_user_data_flow.py::TestUserLifecycle::test_step6_messages_contain_user_and_assistant_turns -v
```

Expected: new test fails because `MessageWithScoreOut` does not include suggestions and the SQL does not select them.

- [ ] **Step 3: Add suggestions to message history schema**

In `app/api/schemas.py`, add this field to `MessageWithScoreOut`:

```python
    suggestions: list[str] = []
```

- [ ] **Step 4: Select and normalize suggestions in conversation history**

In `app/api/conversations.py`, add `m.suggestions` to the SQL select immediately after `m.created_at`:

```sql
                    m.created_at,
                    m.suggestions,
                    ua.storage_key,
```

Update the tuple unpack:

```python
    for (msg_id, role, input_mode, text_content, created_at, suggestions_raw,
         storage_key, assistant_storage_key, overall, accuracy, fluency, completeness,
         prosody, assessment_id) in msg_rows:
```

Before constructing `MessageWithScoreOut`, normalize:

```python
        suggestions = suggestions_raw if role == "assistant" and isinstance(suggestions_raw, list) else []
```

Add the field to the `MessageWithScoreOut` constructor:

```python
                suggestions=suggestions,
```

Update `assessment_ids` index from `row[12]` to `row[13]`:

```python
            assessment_ids = [row[13] for row in msg_rows if row[13] is not None]
```

- [ ] **Step 5: Run history route tests and verify pass**

Run:

```bash
pytest tests/test_api/test_routes.py::TestGetConversationMessages tests/test_api/test_user_data_flow.py::TestUserLifecycle::test_step6_messages_contain_user_and_assistant_turns -v
```

Expected: all selected tests pass.

- [ ] **Step 6: Commit history support**

```bash
git add app/api/schemas.py app/api/conversations.py tests/test_api/test_routes.py tests/test_api/test_user_data_flow.py
git commit -m "feat: include suggestions in conversation history"
```

---

### Task 6: Database Schema And Migration SQL

**Files:**
- Create: `tests/test_db_schema/test_messages_suggestions_schema.py`
- Modify: `db_schema/schema.sql`
- Modify: `db_schema/seed.sql`

- [ ] **Step 1: Write schema tests**

Create `tests/test_db_schema/test_messages_suggestions_schema.py`:

```python
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_messages_table_defines_suggestions_jsonb_column():
    schema = (ROOT / "db_schema" / "schema.sql").read_text(encoding="utf-8")
    start = schema.index("CREATE TABLE IF NOT EXISTS messages")
    end = schema.index("CREATE INDEX IF NOT EXISTS idx_messages_conversation_created")
    messages_block = schema[start:end]

    assert "suggestions" in messages_block
    assert "JSONB" in messages_block
    assert "DEFAULT '[]'" in messages_block


def test_seed_adds_suggestions_column_idempotently():
    seed = (ROOT / "db_schema" / "seed.sql").read_text(encoding="utf-8")

    assert "ALTER TABLE messages ADD COLUMN IF NOT EXISTS suggestions JSONB NOT NULL DEFAULT '[]'::jsonb;" in " ".join(seed.split())
```

- [ ] **Step 2: Run schema tests and verify failure**

Run:

```bash
pytest tests/test_db_schema/test_messages_suggestions_schema.py -v
```

Expected: both tests fail because the schema and seed migration do not define `messages.suggestions`.

- [ ] **Step 3: Update fresh database schema**

In `db_schema/schema.sql`, add the column inside `CREATE TABLE IF NOT EXISTS messages`, after `text_content TEXT,`:

```sql
    suggestions         JSONB NOT NULL DEFAULT '[]',
```

- [ ] **Step 4: Update idempotent seed migration**

In `db_schema/seed.sql`, add this near the top with the other idempotent migrations:

```sql
-- Store next-turn suggestions generated for assistant messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS suggestions JSONB NOT NULL DEFAULT '[]'::jsonb;
```

- [ ] **Step 5: Run schema tests and verify pass**

Run:

```bash
pytest tests/test_db_schema/test_messages_suggestions_schema.py -v
```

Expected: both tests pass.

- [ ] **Step 6: Commit schema support**

```bash
git add db_schema/schema.sql db_schema/seed.sql tests/test_db_schema/test_messages_suggestions_schema.py
git commit -m "feat: add message suggestions schema"
```

---

### Task 7: Integration Verification

**Files:**
- No new files.
- Fix only regressions caused by previous tasks.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
pytest tests/test_grammar_parser/test_annotated_grammar.py tests/test_ai_services/test_prompt_builder_grammar.py tests/test_agents/test_pipeline_suggestions.py tests/test_agents/test_pipeline_voice_accent.py tests/test_agents/test_pipeline_guardrail.py tests/test_agents/test_pipeline_tool_use_failed.py tests/test_ai_services/test_ai_services.py::TestRunLangraphAgent tests/test_ai_services/test_ai_services.py::TestRunLangraphAgentAccent tests/test_ai_services/test_ai_services.py::test_run_langraph_agent_blocked_skips_tts tests/test_api/test_schemas.py::TestChatResponse tests/test_api/test_tool_call_step_schema.py tests/test_api/test_routes.py::TestChatRespond tests/test_api/test_routes.py::TestChatRespondVoiceAccent tests/test_api/test_routes.py::TestGetConversationMessages tests/test_api/test_user_data_flow.py::TestUserLifecycle tests/test_api/test_topic_conversations.py tests/test_db_schema/test_messages_suggestions_schema.py -v
```

Expected: all selected tests pass.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
pytest
```

Expected: the full suite passes. If unrelated pre-existing tests fail, record the failing test names and confirm the focused suggestions tests still pass.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: `git diff --check` has no output. `git status --short` shows only files changed by this feature. `git diff --stat` shows parser, prompt, pipeline, API, schema, and test files.

- [ ] **Step 4: Commit verification fixes if any were needed**

If Step 1 or Step 2 required small fixes, commit them:

```bash
git add app tests db_schema
git commit -m "fix: stabilize suggestions integration"
```

If no fixes were needed after the previous task commits, do not create an empty commit.

---

## Self-Review

- Spec coverage: Tasks cover single-call LLM output, parser isolation, prompt contract, state propagation, live API return, assistant-message storage, history return, PII redaction, schema migration, and no TTS for suggestions.
- Placeholder scan: This plan contains concrete file paths, commands, expected failures, expected passes, and code snippets for each implementation step.
- Type consistency: Suggestions are `list[str]` in parser, agent state, core service return tuple, Pydantic response models, route handling, and history response models.
