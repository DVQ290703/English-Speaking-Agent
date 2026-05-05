# Grammar Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-turn grammar assessment to `POST /api/chat/respond` (returns inline summary) and a new `GET /api/grammar/{message_id}` endpoint (returns full error detail).

**Architecture:** One Groq LLM call returns a JSON blob containing both the chat reply and grammar analysis. Grammar data is extracted in the pipeline, persisted to a `grammar_feedback` table, and surfaced as `grammar_summary` in the chat response. Full detail is served on demand from the DB.

**Tech Stack:** Python 3.12, FastAPI, psycopg2, LangChain + ChatGroq (JSON mode), LangGraph, pytest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `db_schema/grammar_feedback.sql` | DB migration for `grammar_feedback` table |
| Create | `app/services/grammar_parser.py` | Parse LLM JSON → `GrammarData`; fallback on bad JSON |
| Modify | `app/prompts/prompt_builder.py` | Add `GRAMMAR_INSTRUCTION` constant; add `include_grammar` param to `build_system_prompt()` |
| Modify | `app/agents/state.py` | Add `grammar_json: str \| None` to `AgentState` |
| Modify | `app/services/groq_llm.py` | Add `generate_response_with_grammar()` using JSON mode |
| Modify | `app/agents/pipeline.py` | `_respond_node` calls `generate_response_with_grammar()`; stores `grammar_json` in state |
| Modify | `app/core/ai_services.py` | `run_langraph_agent()` returns `tuple[str, bytes, str \| None]` |
| Modify | `app/api/schemas.py` | Add `GrammarSpan`, `GrammarSummary`, `GrammarErrorDetail`, `GrammarDetailResponse`; update `ChatResponse` |
| Modify | `app/api/chat.py` | Unpack 3-tuple; save grammar to DB; include `grammar_summary` in response |
| Create | `app/api/grammar.py` | `GET /api/grammar/{message_id}` route |
| Modify | `app/api/router.py` | Register grammar router |
| Create | `tests/test_services/test_grammar_parser.py` | Unit tests for `grammar_parser` |
| Create | `tests/test_api/test_grammar.py` | Integration tests for grammar endpoint |

---

## Task 1: DB migration — `grammar_feedback` table

**Files:**
- Create: `db_schema/grammar_feedback.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- db_schema/grammar_feedback.sql
CREATE TABLE IF NOT EXISTS grammar_feedback (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id         UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_input         TEXT        NOT NULL,
    errors             JSONB       NOT NULL DEFAULT '[]',
    corrected_sentence TEXT,
    overall_score      INTEGER,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grammar_feedback_message_id_idx
    ON grammar_feedback(message_id);
```

- [ ] **Step 2: Apply migration**

Run against your local DB:
```bash
psql "$DATABASE_URL" -f db_schema/grammar_feedback.sql
```
Expected: `CREATE TABLE` and `CREATE INDEX` output, no errors.

- [ ] **Step 3: Commit**

```bash
git add db_schema/grammar_feedback.sql
git commit -m "feat: add grammar_feedback table migration"
```

---

## Task 2: Grammar parser — tests first

**Files:**
- Create: `app/services/grammar_parser.py`
- Create: `tests/test_services/test_grammar_parser.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_services/test_grammar_parser.py`:

```python
"""Unit tests for grammar_parser."""
import json
import pytest
from app.services.grammar_parser import GrammarData, GrammarError, parse_grammar_response


VALID_JSON = json.dumps({
    "response_text": "That sounds fun!",
    "grammar_errors": [
        {
            "original": "go",
            "corrected": "went",
            "start_char": 2,
            "end_char": 4,
            "category": "verb_tense",
            "severity": "major",
            "explanation": "Use simple past 'went' because 'yesterday' marks a completed action.",
            "rule": "Simple Past Tense: use V2 for completed past actions.",
            "example": "I went to the store yesterday.",
        }
    ],
    "corrected_sentence": "I went to the store yesterday.",
    "overall_score": 85,
})

VALID_JSON_NO_ERRORS = json.dumps({
    "response_text": "Great sentence!",
    "grammar_errors": [],
    "corrected_sentence": "I went to the store yesterday.",
    "overall_score": 100,
})


class TestParseGrammarResponse:
    def test_parses_valid_json_returns_response_text(self):
        response_text, _ = parse_grammar_response(VALID_JSON, "I go to the store yesterday")
        assert response_text == "That sounds fun!"

    def test_parses_valid_json_returns_grammar_data(self):
        _, grammar_data = parse_grammar_response(VALID_JSON, "I go to the store yesterday")
        assert isinstance(grammar_data, GrammarData)
        assert len(grammar_data.errors) == 1

    def test_parses_error_fields(self):
        _, grammar_data = parse_grammar_response(VALID_JSON, "I go to the store yesterday")
        err = grammar_data.errors[0]
        assert err.original == "go"
        assert err.corrected == "went"
        assert err.start_char == 2
        assert err.end_char == 4
        assert err.category == "verb_tense"
        assert err.severity == "major"
        assert "simple past" in err.explanation.lower()
        assert err.rule != ""
        assert err.example != ""

    def test_parses_corrected_sentence_and_score(self):
        _, grammar_data = parse_grammar_response(VALID_JSON, "I go to the store yesterday")
        assert grammar_data.corrected_sentence == "I went to the store yesterday."
        assert grammar_data.overall_score == 85

    def test_no_errors_returns_empty_list(self):
        _, grammar_data = parse_grammar_response(VALID_JSON_NO_ERRORS, "I went to the store yesterday.")
        assert grammar_data.errors == []
        assert grammar_data.overall_score == 100

    def test_none_input_returns_none_text_and_empty_data(self):
        response_text, grammar_data = parse_grammar_response(None, "anything")
        assert response_text is None
        assert grammar_data.errors == []

    def test_malformed_json_returns_none_text_and_empty_data(self):
        response_text, grammar_data = parse_grammar_response("{not valid json", "anything")
        assert response_text is None
        assert grammar_data.errors == []

    def test_missing_response_text_key_returns_none(self):
        raw = json.dumps({"grammar_errors": [], "overall_score": 100})
        response_text, _ = parse_grammar_response(raw, "anything")
        assert response_text is None

    def test_overall_score_defaults_to_100_when_missing(self):
        raw = json.dumps({"response_text": "Hi!", "grammar_errors": []})
        _, grammar_data = parse_grammar_response(raw, "anything")
        assert grammar_data.overall_score == 100
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python -m pytest tests/test_services/test_grammar_parser.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.services.grammar_parser'`

- [ ] **Step 3: Implement `app/services/grammar_parser.py`**

```python
"""Parse the structured LLM JSON output into grammar domain objects."""
from __future__ import annotations

import json
from dataclasses import dataclass, field

from app.core.logger import logger


@dataclass
class GrammarError:
    original: str
    corrected: str
    start_char: int
    end_char: int
    category: str
    severity: str
    explanation: str
    rule: str
    example: str


@dataclass
class GrammarData:
    errors: list[GrammarError] = field(default_factory=list)
    corrected_sentence: str | None = None
    overall_score: int = 100


def parse_grammar_response(
    raw_json: str | None, user_input: str
) -> tuple[str | None, GrammarData]:
    """Parse the LLM JSON blob into (response_text, GrammarData).

    Returns (None, empty GrammarData) when raw_json is None or malformed.
    Never raises.
    """
    empty = GrammarData()
    if not raw_json:
        return None, empty
    try:
        data = json.loads(raw_json)
        response_text = data.get("response_text", "").strip() or None
        errors = [
            GrammarError(
                original=str(e["original"]),
                corrected=str(e["corrected"]),
                start_char=int(e["start_char"]),
                end_char=int(e["end_char"]),
                category=str(e["category"]),
                severity=str(e["severity"]),
                explanation=str(e["explanation"]),
                rule=str(e["rule"]),
                example=str(e["example"]),
            )
            for e in data.get("grammar_errors", [])
        ]
        return response_text, GrammarData(
            errors=errors,
            corrected_sentence=data.get("corrected_sentence") or None,
            overall_score=int(data.get("overall_score", 100)),
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        logger.warning("grammar_parser: failed to parse LLM response user_input_length=%d", len(user_input))
        return None, empty
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
python -m pytest tests/test_services/test_grammar_parser.py -v
```
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/grammar_parser.py tests/test_services/test_grammar_parser.py
git commit -m "feat: add grammar_parser with tests"
```

---

## Task 3: Add grammar schemas to `app/api/schemas.py`

**Files:**
- Modify: `app/api/schemas.py`

- [ ] **Step 1: Add grammar schemas and update `ChatResponse`**

Add these classes after the existing `ChatResponse` class in `app/api/schemas.py`:

```python
class GrammarSpan(BaseModel):
    original: str
    corrected: str
    start_char: int
    end_char: int


class GrammarSummary(BaseModel):
    error_count: int
    has_errors: bool
    flagged_spans: list[GrammarSpan]


class GrammarErrorDetail(BaseModel):
    id: int
    original: str
    corrected: str
    start_char: int
    end_char: int
    category: str
    severity: str
    explanation: str
    rule: str
    example: str


class GrammarDetailResponse(BaseModel):
    message_id: str
    user_input: str
    errors: list[GrammarErrorDetail]
    corrected_sentence: str | None
    overall_score: int
```

Update the existing `ChatResponse` class to add the `grammar_summary` field:

```python
class ChatResponse(BaseModel):
    user_input: str
    response_text: str
    audio_base64: str = ""
    audio_mime: str = "audio/mpeg"
    user_audio_url: str | None = None
    assistant_audio_url: str | None = None
    conversation_id: str
    user_message_id: str | None = None
    grammar_summary: GrammarSummary = Field(
        default_factory=lambda: GrammarSummary(error_count=0, has_errors=False, flagged_spans=[])
    )
```

Also add `Field` to the pydantic import at the top of `schemas.py`:
```python
from pydantic import BaseModel, Field, field_validator, model_validator
```

- [ ] **Step 2: Verify schemas import without error**

```bash
python -c "from app.api.schemas import GrammarSummary, GrammarSpan, GrammarErrorDetail, GrammarDetailResponse, ChatResponse; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add app/api/schemas.py
git commit -m "feat: add grammar schemas to ChatResponse and new GrammarDetailResponse"
```

---

## Task 4: Add grammar instruction to `app/prompts/prompt_builder.py`

**Files:**
- Modify: `app/prompts/prompt_builder.py`

- [ ] **Step 1: Add `GRAMMAR_INSTRUCTION` constant and update `build_system_prompt()`**

Add the constant after `_BASE_FALLBACK` in `prompt_builder.py`:

```python
GRAMMAR_INSTRUCTION = """\
---

RESPONSE FORMAT (strict JSON only — no markdown, no code fences):
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
- corrected_sentence is the full user message with all errors fixed.
- start_char and end_char are character positions in the original user input string.\
"""
```

Update the signature of `build_system_prompt()` to accept `include_grammar`:

```python
def build_system_prompt(
    topic: str | None = None,
    sub_option: str | None = None,
    include_grammar: bool = False,
) -> str:
    """Compose a system prompt: base -> topic layer -> sub-option layer -> grammar instruction."""
    prompt_parts = [_load_base_prompt()]

    if topic:
        topics = _load_topics()
        topic_key = _normalize_key(topic)
        topic_data = topics.get(topic_key)

        if topic_data:
            topic_prompt = topic_data.get("topic_prompt", "").strip()
            if topic_prompt:
                prompt_parts.append(f"---\n\n## Topic: {topic_key}\n{topic_prompt}")

            if sub_option:
                sub_key = _normalize_key(sub_option)
                option_prompt = topic_data.get("options", {}).get(sub_key, "").strip()
                if option_prompt:
                    prompt_parts.append(f"---\n\n## Scenario: {sub_key}\n{option_prompt}")
                else:
                    prompt_parts.append(
                        f"---\n\n## Scenario: {sub_option.strip()}\n"
                        "The learner selected this scenario. "
                        "Adapt the conversation to it while keeping the same coaching style."
                    )
        else:
            prompt_parts.append(
                f"---\n\n## Topic: {topic.strip()}\n"
                "The learner selected this topic. "
                "Create a realistic speaking-practice conversation around it."
            )
            if sub_option:
                prompt_parts.append(
                    f"---\n\n## Scenario: {sub_option.strip()}\n"
                    "The learner selected this scenario. "
                    "Adapt the conversation to it while keeping the same coaching style."
                )

    if include_grammar:
        prompt_parts.append(GRAMMAR_INSTRUCTION)

    return "\n\n".join(part for part in prompt_parts if part)
```

- [ ] **Step 2: Verify the grammar instruction appears in the built prompt**

```bash
python -c "
from app.prompts.prompt_builder import build_system_prompt
p = build_system_prompt(include_grammar=True)
assert 'RESPONSE FORMAT' in p, 'Grammar instruction missing'
p2 = build_system_prompt(include_grammar=False)
assert 'RESPONSE FORMAT' not in p2, 'Grammar instruction leaked into non-grammar prompt'
print('OK')
"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add app/prompts/prompt_builder.py
git commit -m "feat: add GRAMMAR_INSTRUCTION and include_grammar param to build_system_prompt"
```

---

## Task 5: Add `generate_response_with_grammar()` to `GroqLLMService`

**Files:**
- Modify: `app/services/groq_llm.py`

- [ ] **Step 1: Add the new method to `GroqLLMService`**

Add the following method to the `GroqLLMService` class in `app/services/groq_llm.py`. Also add `import json` at the top of the file.

```python
import json  # add to top-of-file imports
```

Add this method after `generate_response()`:

```python
def generate_response_with_grammar(
    self, user_input: str, history: list[str] | None = None
) -> tuple[str, str | None]:
    """Generate a reply with grammar analysis in one JSON-mode LLM call.

    Returns (response_text, raw_json_str).
    Falls back to (plain_response_text, None) when JSON mode fails.
    """
    history = history or []
    logger.info(
        "GroqLLM generate_response_with_grammar model=%s history_lines=%d input_length=%d",
        self.model_name,
        len(history),
        len(user_input),
    )

    topic, sub_option = extract_prompt_context(history)
    dynamic_prompt = build_system_prompt(topic=topic, sub_option=sub_option, include_grammar=True)
    messages: list = [SystemMessage(content=dynamic_prompt or SYSTEM_PROMPT)]

    for line in history[-8:]:
        if line.startswith("User:"):
            messages.append(HumanMessage(content=line[5:].strip()))
        elif line.startswith("Assistant:"):
            messages.append(AIMessage(content=line[10:].strip()))

    messages.append(HumanMessage(content=user_input))

    try:
        json_client = self.client.bind(response_format={"type": "json_object"})
        response = json_client.invoke(messages)
        raw = response.content if isinstance(response, AIMessage) else str(response)

        data = json.loads(raw)
        response_text = data.get("response_text", "").strip()
        if response_text:
            logger.info("GroqLLM grammar response parsed ok response_length=%d", len(response_text))
            return response_text, raw

        logger.warning("GroqLLM grammar response missing response_text key, falling back")
    except Exception:
        logger.exception("GroqLLM generate_response_with_grammar failed, falling back to plain response")

    # Fallback: plain response without grammar
    fallback = self.generate_response(user_input=user_input, history=history)
    return fallback, None
```

- [ ] **Step 2: Verify the method is importable**

```bash
python -c "from app.services.groq_llm import GroqLLMService; print(hasattr(GroqLLMService, 'generate_response_with_grammar'))"
```
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add app/services/groq_llm.py
git commit -m "feat: add generate_response_with_grammar to GroqLLMService"
```

---

## Task 6: Thread grammar through `AgentState` and pipeline

**Files:**
- Modify: `app/agents/state.py`
- Modify: `app/agents/pipeline.py`
- Modify: `app/core/ai_services.py`

- [ ] **Step 1: Add `grammar_json` to `AgentState`**

Replace the contents of `app/agents/state.py` with:

```python
from typing import TypedDict


class AgentState(TypedDict):
    user_input: str
    response_text: str
    audio_bytes: bytes   # raw MP3 bytes from TTS; empty on failure
    history: list[str]
    voice_gender: str | None
    grammar_json: str | None  # raw JSON from LLM grammar call; None on failure
```

- [ ] **Step 2: Update `_respond_node` in `app/agents/pipeline.py`**

Replace `_respond_node` (the method that currently calls `generate_response`) with:

```python
def _respond_node(self, state: AgentState) -> AgentState:
    """Generate the assistant response with grammar analysis."""
    logger.debug("respond_node start input_length=%d", len(state["user_input"]))
    response_text, grammar_json = self.llm_service.generate_response_with_grammar(
        user_input=state["user_input"],
        history=state.get("history", []),
    )
    logger.debug("respond_node done response_length=%d grammar_present=%s", len(response_text), grammar_json is not None)
    history = state.get("history", []) + [
        f"User: {state['user_input']}",
        f"Assistant: {response_text}",
    ]
    return {**state, "response_text": response_text, "history": history, "grammar_json": grammar_json}
```

Also update `run()` to include `grammar_json` in the initial state:

```python
def run(
    self,
    user_input: str,
    history: list[str] | None = None,
    voice_gender: str | None = None,
) -> AgentState:
    """Execute the pipeline for a single user message and return the final state."""
    initial_state: AgentState = {
        "user_input": user_input,
        "response_text": "",
        "audio_bytes": b"",
        "history": history or [],
        "voice_gender": voice_gender,
        "grammar_json": None,
    }
    return self.app.invoke(initial_state)
```

- [ ] **Step 3: Update `run_langraph_agent()` in `app/core/ai_services.py` to return 3-tuple**

Find and replace the `run_langraph_agent` function signature and return statements:

```python
def run_langraph_agent(
    user_input: str,
    history: list[str] | None = None,
    voice_gender: str | None = None,
) -> tuple[str, bytes, str | None]:
    """Run the conversation pipeline and return (response_text, audio_bytes, grammar_json)."""
    history = history or []
    logger.info("run_langraph_agent start user_input_length=%d history_lines=%d", len(user_input), len(history))
    try:
        pipeline = get_voice_agent_pipeline()
        result = pipeline.run(user_input=user_input, history=history, voice_gender=voice_gender)
        response_text = str(result.get("response_text", "")).strip()
        audio_bytes: bytes = result.get("audio_bytes") or b""
        grammar_json: str | None = result.get("grammar_json")

        logger.info(
            "Pipeline run complete response_text_length=%d audio_bytes=%d grammar_present=%s",
            len(response_text),
            len(audio_bytes),
            grammar_json is not None,
        )

        if response_text:
            if not audio_bytes:
                logger.warning("Pipeline returned text but empty audio - retrying TTS directly")
                audio_bytes = _synthesize_audio_bytes(response_text, voice_gender=voice_gender)
            return response_text, audio_bytes, grammar_json

        logger.warning("Pipeline returned empty response_text - using fallback")
    except Exception:
        logger.exception("LangGraph agent pipeline failed user_input_length=%d", len(user_input))

    fallback_text = "Sorry, I couldn't process your request right now."
    logger.info("Returning fallback response")
    return fallback_text, _synthesize_audio_bytes(fallback_text, voice_gender=voice_gender), None
```

- [ ] **Step 4: Verify the pipeline import chain works**

```bash
python -c "
from app.core.ai_services import run_langraph_agent
import inspect
sig = inspect.signature(run_langraph_agent)
print('return annotation:', sig.return_annotation)
print('OK')
"
```
Expected: prints the return annotation and `OK` without errors.

- [ ] **Step 5: Commit**

```bash
git add app/agents/state.py app/agents/pipeline.py app/core/ai_services.py
git commit -m "feat: thread grammar_json through AgentState, pipeline, and run_langraph_agent"
```

---

## Task 7: Update `chat.py` — save grammar to DB and return summary

**Files:**
- Modify: `app/api/chat.py`

- [ ] **Step 1: Add imports to `app/api/chat.py`**

At the top of `app/api/chat.py`, add these imports (alongside existing imports):

```python
import json as _json

from app.services.grammar_parser import parse_grammar_response
from app.api.schemas import GrammarSummary, GrammarSpan
```

- [ ] **Step 2: Update the `run_langraph_agent` call to unpack 3-tuple**

Find this line (around line 290):
```python
    response_text, response_audio_bytes = run_langraph_agent(
        user_input=user_input,
        history=history_lines,
        voice_gender=voice_gender,
    )
```

Replace with:
```python
    response_text, response_audio_bytes, grammar_json = run_langraph_agent(
        user_input=user_input,
        history=history_lines,
        voice_gender=voice_gender,
    )
    _, grammar_data = parse_grammar_response(grammar_json, user_input)
```

- [ ] **Step 3: Add grammar insert inside the existing DB transaction**

Find the end of the existing `with get_connection() as conn:` block (after the audio asset inserts, before the closing `# ── Audit Logging` comment). Add the grammar insert inside the same `with conn.cursor() as cur:` block, after the existing inserts:

```python
            # Save grammar feedback (only when LLM returned valid JSON)
            if grammar_json is not None:
                cur.execute(
                    """
                    INSERT INTO grammar_feedback
                        (message_id, user_input, errors, corrected_sentence, overall_score)
                    VALUES (%s, %s, %s::jsonb, %s, %s)
                    """,
                    (
                        user_message_id,
                        user_input,
                        _json.dumps([e.__dict__ for e in grammar_data.errors]),
                        grammar_data.corrected_sentence,
                        grammar_data.overall_score,
                    ),
                )
```

- [ ] **Step 4: Build `grammar_summary` and include it in `ChatResponse`**

Find the `return ChatResponse(...)` at the bottom of the route handler. Add `grammar_summary` to it:

First, add the `grammar_summary` construction right before the `return ChatResponse(...)` statement:

```python
    grammar_summary = GrammarSummary(
        error_count=len(grammar_data.errors),
        has_errors=len(grammar_data.errors) > 0,
        flagged_spans=[
            GrammarSpan(
                original=e.original,
                corrected=e.corrected,
                start_char=e.start_char,
                end_char=e.end_char,
            )
            for e in grammar_data.errors
        ],
    )
```

Then add `grammar_summary=grammar_summary` to the `ChatResponse(...)` constructor call.

- [ ] **Step 5: Run existing chat tests to confirm no regressions**

```bash
python -m pytest tests/test_api/test_routes.py -v -k "Chat"
```
Expected: all existing chat tests PASS.

Note: the tests mock `run_langraph_agent`. Update the mock return value in any test that patches `run_langraph_agent` — change:
```python
patch("app.api.chat.run_langraph_agent", return_value=("Great job!", b"mp3data"))
```
to:
```python
patch("app.api.chat.run_langraph_agent", return_value=("Great job!", b"mp3data", None))
```

- [ ] **Step 6: Commit**

```bash
git add app/api/chat.py
git commit -m "feat: save grammar feedback to DB and include grammar_summary in chat response"
```

---

## Task 8: Add `GET /api/grammar/{message_id}` endpoint

**Files:**
- Create: `app/api/grammar.py`
- Modify: `app/api/router.py`
- Create: `tests/test_api/test_grammar.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_api/test_grammar.py`:

```python
"""Integration tests for GET /api/grammar/{message_id}."""
import json
import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import os
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only!")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")
os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
os.environ.setdefault("MINIO_SECRET_KEY", "minio-test-secret-2026")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("POSTGRES_DB", "test_db")
os.environ.setdefault("POSTGRES_USER", "test_user")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key-2026")

from app.core.security import create_access_token


def _make_headers(user_id: str | None = None) -> tuple[dict, str]:
    uid = user_id or str(uuid.uuid4())
    token, _ = create_access_token(user_id=uid, email="alice@example.com")
    return {"Authorization": f"Bearer {token}"}, uid


def _make_conn_with_grammar(row):
    """Build a mock DB connection that returns `row` from fetchone."""
    mock_cursor = MagicMock()
    mock_cursor.fetchone.return_value = row
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    @contextmanager
    def _ctx():
        yield mock_conn

    return _ctx()


SAMPLE_ERRORS = [
    {
        "original": "go",
        "corrected": "went",
        "start_char": 2,
        "end_char": 4,
        "category": "verb_tense",
        "severity": "major",
        "explanation": "Use simple past.",
        "rule": "Simple Past Tense",
        "example": "I went to the store.",
    }
]


@contextmanager
def _client(db_ctx):
    with (
        patch("app.core.database.init_db_pool"),
        patch("app.core.storage.init_storage"),
        patch("app.core.database.get_connection", return_value=db_ctx),
    ):
        from app.main import app
        with TestClient(app, raise_server_exceptions=True) as c:
            yield c


class TestGetGrammarDetail:
    def test_returns_200_with_grammar_detail(self):
        message_id = str(uuid.uuid4())
        headers, _ = _make_headers()
        row = (
            "I go to the store yesterday",
            SAMPLE_ERRORS,
            "I went to the store yesterday.",
            85,
        )
        with _client(_make_conn_with_grammar(row)) as c:
            r = c.get(f"/api/grammar/{message_id}", headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert body["message_id"] == message_id
        assert body["user_input"] == "I go to the store yesterday"
        assert len(body["errors"]) == 1
        assert body["errors"][0]["original"] == "go"
        assert body["errors"][0]["corrected"] == "went"
        assert body["errors"][0]["category"] == "verb_tense"
        assert body["errors"][0]["severity"] == "major"
        assert body["corrected_sentence"] == "I went to the store yesterday."
        assert body["overall_score"] == 85

    def test_returns_404_when_no_record(self):
        message_id = str(uuid.uuid4())
        headers, _ = _make_headers()
        with _client(_make_conn_with_grammar(None)) as c:
            r = c.get(f"/api/grammar/{message_id}", headers=headers)
        assert r.status_code == 404

    def test_requires_authentication(self):
        message_id = str(uuid.uuid4())
        row = ("some input", [], None, 100)
        with _client(_make_conn_with_grammar(row)) as c:
            r = c.get(f"/api/grammar/{message_id}")
        assert r.status_code == 401
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python -m pytest tests/test_api/test_grammar.py -v
```
Expected: `404 Not Found` errors for `/api/grammar/...` (route doesn't exist yet).

- [ ] **Step 3: Create `app/api/grammar.py`**

```python
"""GET /api/grammar/{message_id} — retrieve full grammar feedback for a user message."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import get_current_user_id
from app.api.schemas import GrammarDetailResponse, GrammarErrorDetail
from app.core.database import get_connection
from app.core.logger import logger

router = APIRouter(prefix="/grammar", tags=["grammar"])


@router.get("/{message_id}", response_model=GrammarDetailResponse)
def get_grammar_detail(
    message_id: str,
    user_id: str = Depends(get_current_user_id),
) -> GrammarDetailResponse:
    """Return full grammar feedback for a user message.

    Ownership is enforced via the conversations table — users can only
    retrieve feedback for their own messages.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT gf.user_input, gf.errors, gf.corrected_sentence, gf.overall_score
                FROM grammar_feedback gf
                JOIN messages m ON m.id = gf.message_id
                JOIN conversations c ON c.id = m.conversation_id
                WHERE gf.message_id = %s AND c.user_id = %s
                """,
                (message_id, user_id),
            )
            row = cur.fetchone()

    if row is None:
        logger.info("get_grammar_detail not found message_id=%s user_id=%s", message_id, user_id)
        raise HTTPException(status_code=404, detail="Grammar feedback not found")

    user_input, errors_raw, corrected_sentence, overall_score = row
    errors = [
        GrammarErrorDetail(id=i + 1, **e)
        for i, e in enumerate(errors_raw or [])
    ]
    return GrammarDetailResponse(
        message_id=message_id,
        user_input=user_input,
        errors=errors,
        corrected_sentence=corrected_sentence,
        overall_score=overall_score if overall_score is not None else 100,
    )
```

- [ ] **Step 4: Register the grammar router in `app/api/router.py`**

Open `app/api/router.py` and add:

```python
from app.api.grammar import router as grammar_router
```

Then add to the router includes:
```python
router.include_router(grammar_router)
```

- [ ] **Step 5: Run grammar tests to confirm they pass**

```bash
python -m pytest tests/test_api/test_grammar.py -v
```
Expected: all 3 tests PASS.

- [ ] **Step 6: Run full test suite**

```bash
python -m pytest tests/ -v --tb=short
```
Expected: all tests PASS (zero failures).

- [ ] **Step 7: Commit**

```bash
git add app/api/grammar.py app/api/router.py tests/test_api/test_grammar.py
git commit -m "feat: add GET /api/grammar/{message_id} endpoint with ownership check"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** DB table (Task 1), grammar parser (Task 2), schemas (Task 3), prompt instruction (Task 4), single LLM call (Task 5), pipeline threading (Task 6), chat save + summary (Task 7), detail endpoint (Task 8) — all spec sections covered.
- [x] **No placeholders:** All steps contain complete code.
- [x] **Type consistency:** `GrammarData.errors` → `list[GrammarError]` used consistently in Tasks 2, 7. `GrammarErrorDetail` (schema) is constructed from `GrammarData` errors in Task 8. `run_langraph_agent` 3-tuple `tuple[str, bytes, str | None]` matches across Tasks 6 and 7.
- [x] **Fallback coverage:** `parse_grammar_response` returns empty `GrammarData` on None/malformed (Task 2). `generate_response_with_grammar` falls back to plain `generate_response` (Task 5). Grammar DB insert is skipped when `grammar_json is None` (Task 7). `GET /api/grammar` returns 404 when no row exists (Task 8).
