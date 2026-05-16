# Structured Output via Pydantic Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace XML-tag regex parsing with `with_structured_output` + Pydantic models on the non-tool LLM path, eliminating response/suggestions leakage.

**Architecture:** A new `AgentOutput` Pydantic model captures `response_text`, `grammar`, and `suggestions` as typed fields. `GroqLLMService` exposes a `structured_client` built from `client.with_structured_output(AgentOutput)`. `_respond_node` uses `structured_client` when `use_tools=False` and falls back to plain XML parsing on any exception. The tool path (flashcard turns) is unchanged.

**Tech Stack:** Python 3.11+, Pydantic v2, LangChain (`with_structured_output`), LangChain-Groq, pytest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `app/agents/output_models.py` | Pydantic LLM output models |
| Create | `tests/test_agents/test_output_models.py` | Unit tests for output models |
| Modify | `app/services/grammar_parser.py` | Add `grammar_data_from_structured_output` adapter |
| Modify | `tests/test_grammar_parser/test_annotated_grammar.py` | Tests for adapter |
| Modify | `app/prompts/prompt_builder.py` | Add `use_structured_output` flag |
| Modify | `tests/test_ai_services/test_prompt_builder_grammar.py` | Tests for new flag |
| Modify | `app/services/groq_llm.py` | Add `structured_client` |
| Modify | `tests/test_services/test_groq_llm_streaming.py` | Test `structured_client` init |
| Modify | `app/agents/pipeline.py` | Use `structured_client` in `_respond_node` |
| Create | `tests/test_agents/test_pipeline_structured_output.py` | Integration tests |
| Modify | `tests/test_agents/test_pipeline_suggestions.py` | Fix broken mock |
| Modify | `tests/test_agents/test_pipeline_guardrail.py` | Fix broken mock |
| Modify | `tests/test_agents/test_pipeline_voice_accent.py` | Fix broken mock |

---

## Task 1: Create Pydantic output models

**Files:**
- Create: `app/agents/output_models.py`
- Create: `tests/test_agents/test_output_models.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_agents/test_output_models.py`:

```python
import os
import pytest

os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")

from pydantic import ValidationError


class TestGrammarErrorOutput:
    def test_valid_error(self):
        from app.agents.output_models import GrammarErrorOutput
        e = GrammarErrorOutput(cat="vt", sev=2, msg="Past tense required.")
        assert e.cat == "vt"
        assert e.sev == 2
        assert e.eg is None

    def test_sev_below_range_raises(self):
        from app.agents.output_models import GrammarErrorOutput
        with pytest.raises(ValidationError):
            GrammarErrorOutput(cat="vt", sev=0, msg="x")

    def test_sev_above_range_raises(self):
        from app.agents.output_models import GrammarErrorOutput
        with pytest.raises(ValidationError):
            GrammarErrorOutput(cat="vt", sev=4, msg="x")

    def test_eg_field_optional(self):
        from app.agents.output_models import GrammarErrorOutput
        e = GrammarErrorOutput(cat="art", sev=1, msg="Missing article.", eg="Use 'the' here.")
        assert e.eg == "Use 'the' here."


class TestGrammarOutput:
    def test_valid_grammar(self):
        from app.agents.output_models import GrammarOutput, GrammarErrorOutput
        g = GrammarOutput(
            ann="I {go->went} to school.",
            err=[GrammarErrorOutput(cat="vt", sev=2, msg="Past tense required.")],
            score=85,
        )
        assert g.score == 85
        assert len(g.err) == 1

    def test_score_below_range_raises(self):
        from app.agents.output_models import GrammarOutput
        with pytest.raises(ValidationError):
            GrammarOutput(ann="x", err=[], score=-1)

    def test_score_above_range_raises(self):
        from app.agents.output_models import GrammarOutput
        with pytest.raises(ValidationError):
            GrammarOutput(ann="x", err=[], score=101)

    def test_empty_errors_valid(self):
        from app.agents.output_models import GrammarOutput
        g = GrammarOutput(ann="Good sentence.", err=[], score=100)
        assert g.err == []


class TestAgentOutput:
    def test_minimal_valid(self):
        from app.agents.output_models import AgentOutput
        out = AgentOutput(response_text="Great job!")
        assert out.response_text == "Great job!"
        assert out.grammar is None
        assert out.suggestions == []

    def test_grammar_none_is_explicit(self):
        from app.agents.output_models import AgentOutput
        out = AgentOutput(response_text="Good.", grammar=None)
        assert out.grammar is None

    def test_suggestions_list(self):
        from app.agents.output_models import AgentOutput
        out = AgentOutput(
            response_text="Good.",
            suggestions=["Try this.", "Or this.", "Or that."],
        )
        assert len(out.suggestions) == 3

    def test_full_model(self):
        from app.agents.output_models import AgentOutput, GrammarOutput, GrammarErrorOutput
        out = AgentOutput(
            response_text="Nice try!",
            grammar=GrammarOutput(
                ann="I {go->went} to school.",
                err=[GrammarErrorOutput(cat="vt", sev=2, msg="Past tense required.")],
                score=85,
            ),
            suggestions=["I went to school yesterday.", "What did you study?", "I enjoyed school."],
        )
        assert out.grammar.score == 85
        assert out.grammar.err[0].cat == "vt"
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pytest tests/test_agents/test_output_models.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.agents.output_models'`

- [ ] **Step 3: Create `app/agents/output_models.py`**

```python
from pydantic import BaseModel, Field


class GrammarErrorOutput(BaseModel):
    cat: str                        # vt, art, prep, sv, sp, wc, punc, wo, pl, other
    sev: int = Field(ge=1, le=3)    # 1=minor  2=major  3=critical
    msg: str                        # one-sentence explanation
    eg: str | None = None           # optional example


class GrammarOutput(BaseModel):
    ann: str                        # annotated sentence with {wrong->correct} markers
    err: list[GrammarErrorOutput]   # parallel to annotation tokens, in order
    score: int = Field(ge=0, le=100)


class AgentOutput(BaseModel):
    response_text: str                               # plain coaching reply, no XML tags
    grammar: GrammarOutput | None = None             # None = no errors found
    suggestions: list[str] = Field(default_factory=list)  # up to 3 next-turn prompts
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pytest tests/test_agents/test_output_models.py -v
```

Expected: all 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/agents/output_models.py tests/test_agents/test_output_models.py
git commit -m "feat: add AgentOutput Pydantic models for structured LLM output"
```

---

## Task 2: Add `grammar_data_from_structured_output` adapter

**Files:**
- Modify: `app/services/grammar_parser.py`
- Modify: `tests/test_grammar_parser/test_annotated_grammar.py`

- [ ] **Step 1: Write failing tests**

Append this class to the bottom of `tests/test_grammar_parser/test_annotated_grammar.py`:

```python
class TestGrammarDataFromStructuredOutput:
    def test_none_grammar_returns_empty_data_and_none_raw(self):
        from app.services.grammar_parser import grammar_data_from_structured_output
        data, raw = grammar_data_from_structured_output(None, "hello")
        assert data.errors == []
        assert data.overall_score == 100
        assert raw is None

    def test_grammar_with_no_errors(self):
        from app.agents.output_models import GrammarOutput
        from app.services.grammar_parser import grammar_data_from_structured_output
        g = GrammarOutput(ann="I went to school.", err=[], score=100)
        data, raw = grammar_data_from_structured_output(g, "I went to school.")
        assert data.errors == []
        assert data.overall_score == 100
        assert raw is not None
        import json
        parsed = json.loads(raw)
        assert parsed["score"] == 100

    def test_grammar_with_error_produces_grammar_data(self):
        from app.agents.output_models import GrammarOutput, GrammarErrorOutput
        from app.services.grammar_parser import grammar_data_from_structured_output
        g = GrammarOutput(
            ann="yesterday I {go->went} to school",
            err=[GrammarErrorOutput(cat="vt", sev=2, msg="Past tense required.")],
            score=85,
        )
        data, raw = grammar_data_from_structured_output(g, "yesterday I go to school")
        assert len(data.errors) == 1
        assert data.errors[0].original == "go"
        assert data.errors[0].corrected == "went"
        assert data.overall_score == 85
        assert raw is not None

    def test_grammar_raw_is_valid_json_with_required_keys(self):
        from app.agents.output_models import GrammarOutput
        from app.services.grammar_parser import grammar_data_from_structured_output
        import json
        g = GrammarOutput(ann="Good.", err=[], score=100)
        _, raw = grammar_data_from_structured_output(g, "Good.")
        parsed = json.loads(raw)
        assert "ann" in parsed
        assert "err" in parsed
        assert "score" in parsed
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pytest tests/test_grammar_parser/test_annotated_grammar.py::TestGrammarDataFromStructuredOutput -v
```

Expected: `ImportError: cannot import name 'grammar_data_from_structured_output'`

- [ ] **Step 3: Add adapter to `app/services/grammar_parser.py`**

Add these lines at the top of the file after the existing imports:

```python
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.agents.output_models import GrammarOutput
```

Note: `from __future__ import annotations` is already on line 1 of the file. Add only the `TYPE_CHECKING` block after the existing imports section (after the `from app.core.logger import logger` line):

```python
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.agents.output_models import GrammarOutput
```

Then append this function at the bottom of `app/services/grammar_parser.py`:

```python
def grammar_data_from_structured_output(
    grammar: "GrammarOutput | None",
    user_input: str,
) -> tuple[GrammarData, str | None]:
    """Convert a typed GrammarOutput Pydantic model into (GrammarData, grammar_raw JSON).

    Returns (GrammarData(), None) when grammar is None (no errors found).
    Reuses parse_annotated_grammar so all existing annotation logic is preserved.
    """
    if grammar is None:
        return GrammarData(), None
    grammar_raw = grammar.model_dump_json()
    return parse_annotated_grammar(grammar_raw, user_input), grammar_raw
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pytest tests/test_grammar_parser/test_annotated_grammar.py -v
```

Expected: all tests PASS (existing + 4 new)

- [ ] **Step 5: Commit**

```bash
git add app/services/grammar_parser.py tests/test_grammar_parser/test_annotated_grammar.py
git commit -m "feat: add grammar_data_from_structured_output adapter"
```

---

## Task 3: Add `use_structured_output` flag to `build_system_prompt`

**Files:**
- Modify: `app/prompts/prompt_builder.py`
- Modify: `tests/test_ai_services/test_prompt_builder_grammar.py`

- [ ] **Step 1: Write failing tests**

Append these two test methods inside the existing `TestBuildSystemPromptGrammar` class in `tests/test_ai_services/test_prompt_builder_grammar.py`:

```python
    def test_grammar_and_suggestions_absent_when_use_structured_output(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(
            tmp_path,
            system_prompt="base",
            grammar_instruction="GRAMMAR BLOCK",
            suggestions_instruction="SUGGESTIONS BLOCK",
        )
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        prompt = pb.build_system_prompt(include_grammar=True, use_structured_output=True)
        assert "GRAMMAR BLOCK" not in prompt
        assert "SUGGESTIONS BLOCK" not in prompt

    def test_structured_output_false_preserves_existing_behaviour(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(
            tmp_path,
            system_prompt="base",
            grammar_instruction="GRAMMAR BLOCK",
            suggestions_instruction="SUGGESTIONS BLOCK",
        )
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        prompt = pb.build_system_prompt(include_grammar=True, use_structured_output=False)
        assert "GRAMMAR BLOCK" in prompt
        assert "SUGGESTIONS BLOCK" in prompt
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pytest tests/test_ai_services/test_prompt_builder_grammar.py::TestBuildSystemPromptGrammar::test_grammar_and_suggestions_absent_when_use_structured_output tests/test_ai_services/test_prompt_builder_grammar.py::TestBuildSystemPromptGrammar::test_structured_output_false_preserves_existing_behaviour -v
```

Expected: `TypeError: build_system_prompt() got an unexpected keyword argument 'use_structured_output'`

- [ ] **Step 3: Update `build_system_prompt` signature and logic in `app/prompts/prompt_builder.py`**

Change the function signature (line 329) from:
```python
def build_system_prompt(
    category: str | None = None,
    topic: str | None = None,
    include_grammar: bool = True,
    include_suggestions: bool = True,
) -> str:
```

To:
```python
def build_system_prompt(
    category: str | None = None,
    topic: str | None = None,
    include_grammar: bool = True,
    include_suggestions: bool = True,
    use_structured_output: bool = False,
) -> str:
```

Change the grammar/suggestions injection block (lines 410-415) from:
```python
    if include_grammar:
        prompt_parts.append(_load_grammar_instruction())
        logger.debug("prompt_builder layer=grammar injected")
        if include_suggestions:
            prompt_parts.append(_load_suggestions_instruction())
            logger.debug("prompt_builder layer=suggestions injected")
```

To:
```python
    if include_grammar and not use_structured_output:
        prompt_parts.append(_load_grammar_instruction())
        logger.debug("prompt_builder layer=grammar injected")
        if include_suggestions:
            prompt_parts.append(_load_suggestions_instruction())
            logger.debug("prompt_builder layer=suggestions injected")
    elif include_grammar and use_structured_output:
        logger.debug("prompt_builder layer=grammar skipped use_structured_output=True")
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pytest tests/test_ai_services/test_prompt_builder_grammar.py -v
```

Expected: all tests PASS (existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add app/prompts/prompt_builder.py tests/test_ai_services/test_prompt_builder_grammar.py
git commit -m "feat: add use_structured_output flag to build_system_prompt"
```

---

## Task 4: Add `structured_client` to `GroqLLMService`

**Files:**
- Modify: `app/services/groq_llm.py`
- Modify: `tests/test_services/test_groq_llm_streaming.py`

- [ ] **Step 1: Write the failing test**

Append this class to the bottom of `tests/test_services/test_groq_llm_streaming.py`:

```python
class TestStructuredClientInit:
    def test_structured_client_is_set_on_init(self):
        """GroqLLMService.__init__ sets structured_client via with_structured_output."""
        from app.agents.output_models import AgentOutput

        service = GroqLLMService(model_name="test-model")

        assert hasattr(service, "structured_client")
        service.client.with_structured_output.assert_called_once_with(
            AgentOutput, method="json_mode"
        )

    def test_structured_client_is_return_value_of_with_structured_output(self):
        """structured_client is the exact object returned by with_structured_output."""
        from app.agents.output_models import AgentOutput

        service = GroqLLMService(model_name="test-model")
        expected = service.client.with_structured_output.return_value

        assert service.structured_client is expected
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pytest tests/test_services/test_groq_llm_streaming.py::TestStructuredClientInit -v
```

Expected: `AttributeError: 'GroqLLMService' object has no attribute 'structured_client'`

- [ ] **Step 3: Add `structured_client` to `GroqLLMService.__init__` in `app/services/groq_llm.py`**

Add the import at the top of the file after the existing imports:

```python
from app.agents.output_models import AgentOutput
```

In `__init__`, after the line `self.tool_client = self.client.bind_tools(FLASHCARD_TOOLS)` (line 46), add:

```python
        self.structured_client = self.client.with_structured_output(AgentOutput, method="json_mode")
        logger.info("GroqLLMService structured_client ready model=%s", model_name)
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pytest tests/test_services/test_groq_llm_streaming.py -v
```

Expected: all tests PASS (existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add app/services/groq_llm.py tests/test_services/test_groq_llm_streaming.py
git commit -m "feat: add structured_client to GroqLLMService"
```

---

## Task 5: Update `_respond_node` to use structured path

**Files:**
- Modify: `app/agents/pipeline.py`
- Create: `tests/test_agents/test_pipeline_structured_output.py`

- [ ] **Step 1: Write the failing integration tests**

Create `tests/test_agents/test_pipeline_structured_output.py`:

```python
"""
tests/test_agents/test_pipeline_structured_output.py

Integration tests for the structured output path in VoiceAgentPipeline._respond_node.
"""
import os
import sys
import types
from unittest.mock import MagicMock

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")

_lc_groq = types.ModuleType("langchain_groq")
_lc_groq.ChatGroq = MagicMock
sys.modules.setdefault("langchain_groq", _lc_groq)


def _make_llm_mock(preflight_content="SAFETY: SAFE\nTOOL: NO_TOOL"):
    from langchain_core.messages import AIMessage
    llm_mock = MagicMock()
    llm_mock.model_name = "test-model"
    llm_mock.client.invoke.return_value = AIMessage(content=preflight_content)
    llm_mock.tool_client.invoke.side_effect = AssertionError("tool_client must not be used on non-tool path")
    return llm_mock


def test_structured_path_response_text_has_no_xml_tags():
    """response_text must be plain text — no <response>, <grammar>, or <suggestions> tags."""
    from app.agents.output_models import AgentOutput, GrammarOutput
    from app.agents.pipeline import VoiceAgentPipeline

    llm_mock = _make_llm_mock()
    llm_mock.structured_client.invoke.return_value = AgentOutput(
        response_text="Great sentence!",
        grammar=GrammarOutput(ann="I went to school.", err=[], score=100),
        suggestions=["I went yesterday.", "What do you study?", "I love school."],
    )
    tts_mock = MagicMock()
    tts_mock.convert_text_to_speech.return_value = b"audio"

    pipeline = VoiceAgentPipeline(llm_service=llm_mock, tts_service=tts_mock)
    result = pipeline.run(user_input="I went to school.")

    assert result["response_text"] == "Great sentence!"
    assert "<response>" not in result["response_text"]
    assert "<grammar>" not in result["response_text"]
    assert "<suggestions>" not in result["response_text"]


def test_structured_path_suggestions_are_plain_list():
    """suggestions must be list[str], never a JSON string or XML-wrapped blob."""
    from app.agents.output_models import AgentOutput
    from app.agents.pipeline import VoiceAgentPipeline

    llm_mock = _make_llm_mock()
    llm_mock.structured_client.invoke.return_value = AgentOutput(
        response_text="Good job!",
        suggestions=["Tell me more.", "What happened next?", "How did you feel?"],
    )
    tts_mock = MagicMock()
    tts_mock.convert_text_to_speech.return_value = b"audio"

    pipeline = VoiceAgentPipeline(llm_service=llm_mock, tts_service=tts_mock)
    result = pipeline.run(user_input="I went to the park.")

    assert result["suggestions"] == ["Tell me more.", "What happened next?", "How did you feel?"]
    for s in result["suggestions"]:
        assert isinstance(s, str)
        assert "{" not in s  # no JSON bleed


def test_structured_path_grammar_raw_is_json_string():
    """grammar_raw must be a JSON string parseable by parse_annotated_grammar."""
    import json
    from app.agents.output_models import AgentOutput, GrammarOutput, GrammarErrorOutput
    from app.agents.pipeline import VoiceAgentPipeline

    llm_mock = _make_llm_mock()
    llm_mock.structured_client.invoke.return_value = AgentOutput(
        response_text="Watch your verb tense!",
        grammar=GrammarOutput(
            ann="yesterday I {go->went} to school",
            err=[GrammarErrorOutput(cat="vt", sev=2, msg="Past tense required.")],
            score=85,
        ),
        suggestions=["I went to school.", "What did you learn?", "I studied hard."],
    )
    tts_mock = MagicMock()
    tts_mock.convert_text_to_speech.return_value = b"audio"

    pipeline = VoiceAgentPipeline(llm_service=llm_mock, tts_service=tts_mock)
    result = pipeline.run(user_input="yesterday I go to school")

    assert result["grammar_raw"] is not None
    parsed = json.loads(result["grammar_raw"])
    assert parsed["score"] == 85
    assert parsed["ann"] == "yesterday I {go->went} to school"


def test_structured_path_grammar_none_produces_none_raw():
    """When grammar=None (no errors), grammar_raw must be None."""
    from app.agents.output_models import AgentOutput
    from app.agents.pipeline import VoiceAgentPipeline

    llm_mock = _make_llm_mock()
    llm_mock.structured_client.invoke.return_value = AgentOutput(
        response_text="Perfect English!",
        grammar=None,
        suggestions=["Keep it up!", "Tell me more.", "What else?"],
    )
    tts_mock = MagicMock()
    tts_mock.convert_text_to_speech.return_value = b"audio"

    pipeline = VoiceAgentPipeline(llm_service=llm_mock, tts_service=tts_mock)
    result = pipeline.run(user_input="I went to the park yesterday.")

    assert result["grammar_raw"] is None


def test_structured_path_suggestions_capped_at_three():
    """suggestions are capped at 3 even if LLM returns more."""
    from app.agents.output_models import AgentOutput
    from app.agents.pipeline import VoiceAgentPipeline

    llm_mock = _make_llm_mock()
    llm_mock.structured_client.invoke.return_value = AgentOutput(
        response_text="Nice!",
        suggestions=["one", "two", "three", "four", "five"],
    )
    tts_mock = MagicMock()
    tts_mock.convert_text_to_speech.return_value = b"audio"

    pipeline = VoiceAgentPipeline(llm_service=llm_mock, tts_service=tts_mock)
    result = pipeline.run(user_input="Hello!")

    assert len(result["suggestions"]) == 3


def test_structured_path_uses_structured_client_not_plain():
    """_respond_node must call structured_client.invoke, not client.invoke, on non-tool path."""
    from app.agents.output_models import AgentOutput
    from app.agents.pipeline import VoiceAgentPipeline

    llm_mock = _make_llm_mock()
    llm_mock.structured_client.invoke.return_value = AgentOutput(response_text="Hi!")
    tts_mock = MagicMock()
    tts_mock.convert_text_to_speech.return_value = b"audio"

    pipeline = VoiceAgentPipeline(llm_service=llm_mock, tts_service=tts_mock)
    pipeline.run(user_input="Hello!")

    llm_mock.structured_client.invoke.assert_called_once()
    # client.invoke is called once for preflight only
    assert llm_mock.client.invoke.call_count == 1


def test_structured_path_fallback_on_exception():
    """When structured_client raises, fall back to plain client + XML parse."""
    from langchain_core.messages import AIMessage
    from app.agents.pipeline import VoiceAgentPipeline

    llm_mock = MagicMock()
    llm_mock.model_name = "test-model"
    llm_mock.client.invoke.side_effect = [
        AIMessage(content="SAFETY: SAFE\nTOOL: NO_TOOL"),           # preflight
        AIMessage(content="<response>Fallback reply.</response>"     # fallback
                          '<grammar>{"ann":"I went.","err":[],"score":100}</grammar>'
                          '<suggestions>{"suggestions":["a","b","c"]}</suggestions>'),
    ]
    llm_mock.structured_client.invoke.side_effect = Exception("Groq structured output failed")
    tts_mock = MagicMock()
    tts_mock.convert_text_to_speech.return_value = b"audio"

    pipeline = VoiceAgentPipeline(llm_service=llm_mock, tts_service=tts_mock)
    result = pipeline.run(user_input="I went.")

    assert result["response_text"] == "Fallback reply."
    assert result["suggestions"] == ["a", "b", "c"]
    # client.invoke called twice: preflight + fallback
    assert llm_mock.client.invoke.call_count == 2
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pytest tests/test_agents/test_pipeline_structured_output.py -v
```

Expected: tests fail because `_respond_node` still uses plain `client` / XML parsing.

- [ ] **Step 3: Replace `_respond_node` in `app/agents/pipeline.py`**

Replace the entire `_respond_node` method (lines 137–274) with:

```python
    def _respond_node(self, state: AgentState) -> AgentState:
        """Generate the assistant response, invoking tools if the LLM requests them."""
        iterations = state.get("_tool_call_iterations", 3)
        logger.debug("respond_node start input_length=%d tool_iterations=%d", len(state["user_input"]), iterations)

        from app.prompts.prompt_builder import build_system_prompt
        from app.services.groq_llm import SYSTEM_PROMPT

        # Compute routing flags before building prompt so we know which mode to use
        cap_reached = iterations >= _TOOL_CALL_CAP
        intent_requires_tool = state.get("tool_intent", False) or iterations > 0
        use_tools = not cap_reached and bool(state.get("user_id")) and intent_requires_tool

        dynamic_prompt = build_system_prompt(
            category=state.get("category"),
            topic=state.get("topic"),
            include_grammar=True,
            use_structured_output=not use_tools,
        )
        if dynamic_prompt:
            logger.info("respond_node system_prompt=dynamic chars=%d", len(dynamic_prompt))
            base_prompt = dynamic_prompt
        else:
            logger.info("respond_node system_prompt=fallback SYSTEM_PROMPT (build_system_prompt returned empty)")
            base_prompt = SYSTEM_PROMPT
        if state.get("tool_intent") and not iterations:
            base_prompt += (
                "\n\n[TOOL CONTEXT] The user's current message continues an ongoing flashcard "
                "workflow. Use the conversation history to determine the correct flashcard tool "
                "and arguments — do not ask for clarification, infer from context and call the tool now."
            )

        messages_to_send: list = [SystemMessage(content=base_prompt)]

        for line in state.get("history", [])[-8:]:
            if line.startswith("User:"):
                messages_to_send.append(HumanMessage(content=line[5:].strip()))
            elif line.startswith("Assistant:"):
                messages_to_send.append(AIMessage(content=line[10:].strip()))

        messages_to_send.append(HumanMessage(content=state["user_input"]))

        if state.get("messages"):
            messages_to_send.extend(_sanitize_tool_messages(state["messages"]))

        if state.get("user_id") and not intent_requires_tool:
            logger.debug("respond_node tool_gated_off preflight=NO_TOOL")
        logger.debug(
            "respond_node invoking_llm client=%s messages=%d cap_reached=%s intent_requires_tool=%s",
            "tool_client" if use_tools else "structured",
            len(messages_to_send),
            cap_reached,
            intent_requires_tool,
        )

        raw_output: str | None = None
        response_text: str = ""
        grammar_raw: str | None = None
        suggestions: list[str] = []

        if use_tools:
            with span_context("llm.respond", kind="llm") as span:
                try:
                    ai_msg: AIMessage = self.llm_service.tool_client.invoke(messages_to_send)
                except RateLimitError as exc:
                    span.fail(str(exc))
                    logger.warning("respond_node rate_limited iteration=%d: %s", iterations, exc)
                    return {
                        **state,
                        "response_text": "I'm a bit overwhelmed right now. Please try again in a moment.",
                        "messages": [],
                        "_tool_call_iterations": iterations,
                        "grammar_raw": None,
                        "suggestions": [],
                    }
                except BadRequestError as exc:
                    span.fail(str(exc))
                    logger.warning(
                        "respond_node tool_use_failed — model emitted malformed tool call, retrying with plain client: %s",
                        exc,
                    )
                    ai_msg = self.llm_service.client.invoke(messages_to_send)
                usage = getattr(ai_msg, "usage_metadata", {}) or {}
                span.set(
                    model=self.llm_service.model_name,
                    prompt_tokens=usage.get("input_tokens", 0),
                    completion_tokens=usage.get("output_tokens", 0),
                    total_tokens=usage.get("total_tokens", 0),
                )

            logger.debug(
                "respond_node llm_response has_tool_calls=%s content_length=%d",
                bool(ai_msg.tool_calls),
                len(ai_msg.content or ""),
            )

            if ai_msg.tool_calls:
                tool_names = [tc["name"] for tc in ai_msg.tool_calls]
                tool_args = [{tc["name"]: tc.get("args", {})} for tc in ai_msg.tool_calls]
                logger.info(
                    "respond_node tool_calls_detected count=%d tools=%s args=%s iteration=%d",
                    len(ai_msg.tool_calls),
                    tool_names,
                    tool_args,
                    iterations + 1,
                )
                return {
                    **state,
                    "messages": [ai_msg],
                    "_tool_call_iterations": iterations + 1,
                    "response_text": state.get("response_text", ""),
                }

            # LLM chose not to use a tool — XML parse fallback
            raw_output = ai_msg.content or ""
            response_text, grammar_raw, suggestions = split_combined_output_with_suggestions(raw_output)

        else:
            # Structured output path — AgentOutput returned directly, never has .tool_calls
            from app.agents.output_models import AgentOutput
            from app.services.grammar_parser import grammar_data_from_structured_output

            with span_context("llm.respond", kind="llm") as span:
                try:
                    agent_out: AgentOutput = self.llm_service.structured_client.invoke(messages_to_send)
                    span.set(model=self.llm_service.model_name)
                except RateLimitError as exc:
                    span.fail(str(exc))
                    logger.warning("respond_node rate_limited iteration=%d: %s", iterations, exc)
                    return {
                        **state,
                        "response_text": "I'm a bit overwhelmed right now. Please try again in a moment.",
                        "messages": [],
                        "_tool_call_iterations": iterations,
                        "grammar_raw": None,
                        "suggestions": [],
                    }
                except Exception as exc:
                    span.fail(str(exc))
                    logger.warning(
                        "respond_node structured_output_failed — falling back to XML parse: %s", exc
                    )
                    try:
                        fallback_msg: AIMessage = self.llm_service.client.invoke(messages_to_send)
                        raw_output = fallback_msg.content or ""
                    except Exception as fallback_exc:
                        logger.error("respond_node fallback_also_failed: %s", fallback_exc)
                        raw_output = ""
                    response_text, grammar_raw, suggestions = split_combined_output_with_suggestions(
                        raw_output
                    )
                else:
                    response_text = agent_out.response_text
                    _, grammar_raw = grammar_data_from_structured_output(
                        agent_out.grammar, state["user_input"]
                    )
                    suggestions = agent_out.suggestions[:3]

            logger.debug(
                "respond_node structured_response response_preview=%r grammar_present=%s",
                response_text[:120] if response_text else "",
                grammar_raw is not None,
            )

        history = state.get("history", []) + [
            f"User: {state['user_input']}",
            f"Assistant: {response_text}",
        ]
        return {
            **state,
            "response_text": response_text,
            "raw_output": raw_output,
            "history": history,
            "grammar_raw": grammar_raw,
            "suggestions": suggestions,
            "messages": [],
            "_tool_call_iterations": iterations,
        }
```

- [ ] **Step 4: Run new integration tests to confirm they pass**

```
pytest tests/test_agents/test_pipeline_structured_output.py -v
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/agents/pipeline.py tests/test_agents/test_pipeline_structured_output.py
git commit -m "feat: use structured_client in _respond_node for non-tool turns"
```

---

## Task 6: Fix existing pipeline tests broken by the structured path change

**Context:** Three test files mock `llm_mock.client.invoke` for the respond node, but `_respond_node` now uses `structured_client.invoke` on the non-tool path. They must be updated to mock `structured_client.invoke` instead.

**Files:**
- Modify: `tests/test_agents/test_pipeline_suggestions.py`
- Modify: `tests/test_agents/test_pipeline_guardrail.py`
- Modify: `tests/test_agents/test_pipeline_voice_accent.py`

- [ ] **Step 1: Confirm the three test files currently fail**

```
pytest tests/test_agents/test_pipeline_suggestions.py tests/test_agents/test_pipeline_guardrail.py tests/test_agents/test_pipeline_voice_accent.py -v
```

Expected: failures because `structured_client.invoke` is not set up, so mock returns a `MagicMock` instead of `AgentOutput` and `response_text` doesn't match.

- [ ] **Step 2: Fix `tests/test_agents/test_pipeline_suggestions.py`**

Replace the entire file content with:

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
_lc_groq.ChatGroq = MagicMock
sys.modules.setdefault("langchain_groq", _lc_groq)


def test_pipeline_parses_suggestions_from_final_llm_response():
    from langchain_core.messages import AIMessage
    from app.agents.output_models import AgentOutput, GrammarOutput
    from app.agents.pipeline import VoiceAgentPipeline

    llm_mock = MagicMock()
    llm_mock.model_name = "test-model"
    # preflight via client.invoke
    llm_mock.client.invoke.return_value = AIMessage(content="SAFETY: SAFE\nTOOL: NO_TOOL")
    # respond node uses structured_client.invoke on non-tool path
    llm_mock.structured_client.invoke.return_value = AgentOutput(
        response_text="Nice answer.",
        grammar=GrammarOutput(ann="I like hiking.", err=[], score=100),
        suggestions=[
            "I usually hike on weekends.",
            "What trails do you recommend?",
            "In my experience, hiking helps me clear my head.",
        ],
    )
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

- [ ] **Step 3: Fix `tests/test_agents/test_pipeline_guardrail.py`**

Replace the `_make_pipeline` helper function and the `test_guardrail_llm_error_fails_open` test. The rest of the tests are unchanged.

Replace the `_make_pipeline` function (lines 19–40) with:

```python
def _make_pipeline(guardrail_response: str, respond_response: str = "That sounds fun!"):
    """
    Build a VoiceAgentPipeline where:
    - llm.client.invoke returns the guardrail classification
    - llm.structured_client.invoke returns AgentOutput for the respond node
    - tts returns dummy bytes
    """
    from langchain_core.messages import AIMessage
    from app.agents.output_models import AgentOutput
    from app.agents.pipeline import VoiceAgentPipeline

    llm_mock = MagicMock()
    llm_mock.model_name = "test-model"
    tts_mock = MagicMock()
    tts_mock.convert_text_to_speech.return_value = b"audio"

    llm_mock.client.invoke.return_value = AIMessage(content=guardrail_response)
    llm_mock.structured_client.invoke.return_value = AgentOutput(
        response_text=respond_response,
        suggestions=[],
    )
    llm_mock.tool_client.invoke.return_value = AIMessage(content=respond_response)

    return VoiceAgentPipeline(llm_service=llm_mock, tts_service=tts_mock), llm_mock, tts_mock
```

Replace the `test_guardrail_llm_error_fails_open` test function (lines 89–109) with:

```python
def test_guardrail_llm_error_fails_open():
    """If the guardrail LLM raises an exception, treat as SAFE (fail-open)."""
    from langchain_core.messages import AIMessage
    from app.agents.output_models import AgentOutput
    from app.agents.pipeline import VoiceAgentPipeline

    llm_mock = MagicMock()
    llm_mock.model_name = "test-model"
    tts_mock = MagicMock()
    tts_mock.convert_text_to_speech.return_value = b"audio"

    # preflight raises → fail open (SAFE); respond node uses structured_client
    llm_mock.client.invoke.side_effect = RuntimeError("LLM down")
    llm_mock.structured_client.invoke.return_value = AgentOutput(
        response_text="Hello!",
        suggestions=[],
    )
    llm_mock.tool_client.invoke.return_value = AIMessage(content="Hello!")

    pipeline = VoiceAgentPipeline(llm_service=llm_mock, tts_service=tts_mock)
    result = pipeline.run(user_input="Hello there")
    assert result["guardrail_blocked"] is False
    assert result["response_text"] == "Hello!"
    assert result["suggestions"] == []
```

- [ ] **Step 4: Fix `tests/test_agents/test_pipeline_voice_accent.py`**

Replace the `_make_pipeline` method inside `TestPipelineVoiceAccent` (lines 21–36) with:

```python
    def _make_pipeline(self):
        from langchain_core.messages import AIMessage
        from app.agents.output_models import AgentOutput
        mock_llm = MagicMock()
        # preflight
        mock_llm.client.invoke.return_value = AIMessage(content="SAFETY: SAFE\nTOOL: NO_TOOL")
        # respond node uses structured_client on non-tool path
        mock_llm.structured_client.invoke.return_value = AgentOutput(
            response_text="Hello!",
            suggestions=[],
        )
        mock_llm.tool_client.invoke.return_value = AIMessage(content="Hello!")
        mock_llm.model_name = "test-model"
        mock_tts = MagicMock()
        mock_tts.convert_text_to_speech.return_value = b"mp3"

        from app.agents.pipeline import VoiceAgentPipeline
        pipeline = VoiceAgentPipeline.__new__(VoiceAgentPipeline)
        pipeline.llm_service = mock_llm
        pipeline.tts_service = mock_tts
        pipeline.app = pipeline._build_graph()
        return pipeline, mock_tts
```

- [ ] **Step 5: Run all updated tests**

```
pytest tests/test_agents/test_pipeline_suggestions.py tests/test_agents/test_pipeline_guardrail.py tests/test_agents/test_pipeline_voice_accent.py -v
```

Expected: all tests PASS

- [ ] **Step 6: Run full test suite to catch any remaining breakage**

```
pytest tests/ -v --tb=short
```

Expected: all tests PASS. Fix any remaining failures before committing.

- [ ] **Step 7: Commit**

```bash
git add tests/test_agents/test_pipeline_suggestions.py tests/test_agents/test_pipeline_guardrail.py tests/test_agents/test_pipeline_voice_accent.py
git commit -m "test: update pipeline tests to use structured_client mock"
```
