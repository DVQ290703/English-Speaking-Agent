# LLM Cost & Latency Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two sequential LLM calls per turn with one combined call that returns response + grammar in XML-delimited format, eliminate the redundant frontend grammar fetch, and fix secondary over-fetching.

**Architecture:** The LLM system prompt is updated to always include a compact grammar block in `<response>…</response><grammar>…</grammar>` format. `pipeline.py` splits the output on those tags. `chat.py` returns full grammar inline in `ChatResponse`, so the frontend never needs a follow-up `fetchGrammarFeedback` call after sending a message.

**Tech Stack:** Python/FastAPI, LangGraph, LangChain-Groq, TypeScript/React

---

## File Map

| File | What changes |
|------|-------------|
| `app/services/grammar_parser.py` | Add `split_combined_output()`, `parse_annotated_grammar()`; remove old functions |
| `app/prompts/prompt_builder.py` | Replace `GRAMMAR_INSTRUCTION` with compact XML-tag format |
| `app/agents/state.py` | Rename `grammar_json` → `grammar_raw` |
| `app/agents/pipeline.py` | Pass `include_grammar=True`; split tags; drop second LLM call |
| `app/services/groq_llm.py` | Remove `generate_response_with_grammar()` |
| `app/core/ai_services.py` | Read `grammar_raw` from state |
| `app/api/schemas.py` | Add `grammar_detail` to `ChatResponse`; make `rule`/`example` optional |
| `app/api/chat.py` | Use `parse_annotated_grammar`; return `grammar_detail` inline |
| `tests/test_grammar_parser/test_annotated_grammar.py` | New — tests for new parser |
| `tests/test_ai_services/test_ai_services.py` | Update `grammar_json` → `grammar_raw` references |
| `frontend/src/api/chat.ts` | Add `grammar_detail` to `ChatRespondResult` |
| `frontend/src/components/voice-agent/MessageBubble.tsx` | Add `grammarChecked` to `Message` |
| `frontend/src/hooks/useSendChatMessage.ts` | Remove `fetchGrammarFeedback` call; read `grammar_detail` |
| `frontend/src/pages/VoiceAgent.tsx` | Cache-check grammar; guard topic-switch cascade |

---

## Task 1: New grammar parser — `split_combined_output` + `parse_annotated_grammar`

**Files:**
- Modify: `app/services/grammar_parser.py`
- Create: `tests/test_grammar_parser/__init__.py`
- Create: `tests/test_grammar_parser/test_annotated_grammar.py`

- [ ] **Step 1: Create the test file**

```python
# tests/test_grammar_parser/__init__.py
```

```python
# tests/test_grammar_parser/test_annotated_grammar.py
import os
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")


class TestSplitCombinedOutput:
    def _call(self, raw):
        from app.services.grammar_parser import split_combined_output
        return split_combined_output(raw)

    def test_splits_response_and_grammar(self):
        raw = '<response>\nHello!\n</response>\n<grammar>\n{"ann":"x","err":[],"score":100}\n</grammar>'
        text, gram = self._call(raw)
        assert text == "Hello!"
        assert gram == '{"ann":"x","err":[],"score":100}'

    def test_missing_response_tag_returns_full_raw(self):
        raw = "Hello there no tags here"
        text, gram = self._call(raw)
        assert text == raw
        assert gram is None

    def test_missing_grammar_tag_returns_none(self):
        raw = "<response>Hello!</response>"
        text, gram = self._call(raw)
        assert text == "Hello!"
        assert gram is None

    def test_strips_whitespace_from_both_sections(self):
        raw = "<response>  Hi  </response><grammar>  {}  </grammar>"
        text, gram = self._call(raw)
        assert text == "Hi"
        assert gram == "{}"

    def test_multiline_response_preserved(self):
        raw = "<response>Line one.\nLine two.</response><grammar>{}</grammar>"
        text, gram = self._call(raw)
        assert text == "Line one.\nLine two."


class TestParseAnnotatedGrammar:
    def _call(self, grammar_raw, user_input=""):
        from app.services.grammar_parser import parse_annotated_grammar
        return parse_annotated_grammar(grammar_raw, user_input)

    def test_none_returns_empty_grammar_data(self):
        result = self._call(None, "hello")
        assert result.errors == []
        assert result.overall_score == 100
        assert result.corrected_sentence is None

    def test_no_errors_returns_empty_errors(self):
        raw = '{"ann":"I went to school yesterday.","err":[],"score":100}'
        result = self._call(raw, "I went to school yesterday.")
        assert result.errors == []
        assert result.overall_score == 100
        assert result.corrected_sentence == "I went to school yesterday."

    def test_single_substitution_positions(self):
        raw = '{"ann":"yesterday, i {go->went} to the cinema","err":[{"cat":"vt","sev":2,"msg":"Past simple required."}],"score":78}'
        result = self._call(raw, "yesterday, i go to the cinema")
        assert len(result.errors) == 1
        e = result.errors[0]
        assert e.original == "go"
        assert e.corrected == "went"
        assert e.start_char == 13
        assert e.end_char == 15

    def test_single_substitution_fields(self):
        raw = '{"ann":"{go->went}","err":[{"cat":"vt","sev":2,"msg":"Past simple required.","eg":"I went yesterday."}],"score":78}'
        result = self._call(raw, "go")
        e = result.errors[0]
        assert e.category == "verb_tense"
        assert e.severity == "major"
        assert e.explanation == "Past simple required."
        assert e.example == "I went yesterday."

    def test_corrected_sentence_derived_from_ann(self):
        raw = '{"ann":"i {go->went} to {cinema->the cinema}","err":[{"cat":"vt","sev":2,"msg":"Past."},{"cat":"art","sev":1,"msg":"Article."}],"score":70}'
        result = self._call(raw, "i go to cinema")
        assert result.corrected_sentence == "i went to the cinema"

    def test_two_same_word_errors_cursor_advances(self):
        raw = '{"ann":"{go->went} and {go->goes} later","err":[{"cat":"vt","sev":2,"msg":"Past."},{"cat":"vt","sev":1,"msg":"Agreement."}],"score":70}'
        result = self._call(raw, "go and go later")
        assert result.errors[0].start_char == 0
        assert result.errors[0].end_char == 2
        assert result.errors[1].start_char == 7
        assert result.errors[1].end_char == 9

    def test_insertion_zero_width_span(self):
        raw = '{"ann":"{->I} went","err":[{"cat":"sv","sev":2,"msg":"Missing subject."}],"score":75}'
        result = self._call(raw, "went")
        assert result.errors[0].original == ""
        assert result.errors[0].corrected == "I"
        assert result.errors[0].start_char == 0
        assert result.errors[0].end_char == 0

    def test_deletion_marks_span(self):
        raw = '{"ann":"I {really->} went","err":[{"cat":"wc","sev":1,"msg":"Remove filler."}],"score":95}'
        result = self._call(raw, "I really went")
        e = result.errors[0]
        assert e.original == "really"
        assert e.corrected == ""
        assert e.start_char == 2
        assert e.end_char == 8

    def test_case_insensitive_search(self):
        raw = '{"ann":"{Go->Went}","err":[{"cat":"vt","sev":2,"msg":"Past simple."}],"score":80}'
        result = self._call(raw, "Go to school")
        assert result.errors[0].start_char == 0
        assert result.errors[0].end_char == 2

    def test_annotation_count_greater_than_errors_uses_min(self):
        raw = '{"ann":"{go->went} {a->the}","err":[{"cat":"vt","sev":2,"msg":"Past."}],"score":80}'
        result = self._call(raw, "go a")
        assert len(result.errors) == 1

    def test_malformed_json_returns_empty(self):
        result = self._call("not json at all", "hello")
        assert result.errors == []

    def test_category_code_expansion(self):
        codes = {
            "vt": "verb_tense", "art": "article", "prep": "preposition",
            "sv": "subject_verb_agreement", "sp": "spelling", "wc": "word_choice",
            "punc": "punctuation", "wo": "word_order", "pl": "plural_singular",
            "other": "other",
        }
        for code, expected in codes.items():
            raw = f'{{"ann":"{{x->y}}","err":[{{"cat":"{code}","sev":1,"msg":"x"}}],"score":90}}'
            result = self._call(raw, "x")
            assert result.errors[0].category == expected, f"Failed for code={code}"

    def test_severity_int_expansion(self):
        for sev_int, expected in [(1, "minor"), (2, "major"), (3, "critical")]:
            raw = f'{{"ann":"{{x->y}}","err":[{{"cat":"other","sev":{sev_int},"msg":"x"}}],"score":90}}'
            result = self._call(raw, "x")
            assert result.errors[0].severity == expected

    def test_unknown_category_code_passes_through(self):
        raw = '{"ann":"{x->y}","err":[{"cat":"xyz","sev":1,"msg":"x"}],"score":90}'
        result = self._call(raw, "x")
        assert result.errors[0].category == "xyz"

    def test_optional_eg_field_absent(self):
        raw = '{"ann":"{go->went}","err":[{"cat":"vt","sev":2,"msg":"Past simple."}],"score":80}'
        result = self._call(raw, "go")
        assert result.errors[0].example == ""

    def test_score_preserved(self):
        raw = '{"ann":"good sentence","err":[],"score":95}'
        result = self._call(raw, "good sentence")
        assert result.overall_score == 95
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd D:/work/projects/English-Speaking-Agent
python -m pytest tests/test_grammar_parser/test_annotated_grammar.py -v 2>&1 | head -30
```

Expected: `ImportError` or `ModuleNotFoundError` — `split_combined_output` and `parse_annotated_grammar` don't exist yet.

- [ ] **Step 3: Rewrite `grammar_parser.py` with new functions**

Replace the entire file content:

```python
"""Parse the XML-delimited LLM output and compact grammar JSON into domain objects.

The LLM returns output in this format:
    <response>conversational reply</response>
    <grammar>{"ann":"sentence {wrong->correct}","err":[...],"score":85}</grammar>

split_combined_output() separates the two sections.
parse_annotated_grammar() derives reliable char positions from the {wrong->correct}
annotations — never trusting LLM character counts.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from app.core.logger import logger

_RESPONSE_TAG_RE = re.compile(r"<response>(.*?)</response>", re.DOTALL)
_GRAMMAR_TAG_RE = re.compile(r"<grammar>(.*?)</grammar>", re.DOTALL)
_ANNOTATION_RE = re.compile(r"\{([^}]*?)->([^}]*?)\}")

_CAT_MAP: dict[str, str] = {
    "vt": "verb_tense",
    "art": "article",
    "prep": "preposition",
    "sv": "subject_verb_agreement",
    "sp": "spelling",
    "wc": "word_choice",
    "punc": "punctuation",
    "wo": "word_order",
    "pl": "plural_singular",
    "other": "other",
}

_SEV_MAP: dict[int, str] = {1: "minor", 2: "major", 3: "critical"}


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


def split_combined_output(raw: str) -> tuple[str, str | None]:
    """Split <response>…</response><grammar>…</grammar> LLM output.

    Returns (response_text, grammar_raw_json).
    Falls back to (raw.strip(), None) when <response> tag is missing.
    """
    response_match = _RESPONSE_TAG_RE.search(raw)
    grammar_match = _GRAMMAR_TAG_RE.search(raw)
    response_text = response_match.group(1).strip() if response_match else raw.strip()
    grammar_raw = grammar_match.group(1).strip() if grammar_match else None
    return response_text, grammar_raw


def parse_annotated_grammar(grammar_raw: str | None, user_input: str) -> GrammarData:
    """Parse compact annotated grammar JSON into GrammarData.

    Expects: {"ann":"sentence {wrong->correct}","err":[...],"score":85}

    Character positions are computed by searching user_input for annotation
    tokens left-to-right. Never raises — returns empty GrammarData on failure.
    """
    if not grammar_raw:
        return GrammarData()
    try:
        data = json.loads(grammar_raw)
        ann: str = data.get("ann", "")
        err_list: list = data.get("err", [])
        score: int = int(data.get("score", 100))

        # Extract annotation tokens in left-to-right order
        tokens = [(m.group(1), m.group(2)) for m in _ANNOTATION_RE.finditer(ann)]

        # Derive corrected_sentence: replace each {wrong->correct} with correct
        corrected_sentence = _ANNOTATION_RE.sub(lambda m: m.group(2), ann).strip() or None

        # Pair tokens with error detail items; use min length to handle mismatches
        pairs = list(zip(tokens, err_list))
        if len(tokens) != len(err_list):
            logger.warning(
                "parse_annotated_grammar annotation/error count mismatch tokens=%d errors=%d",
                len(tokens),
                len(err_list),
            )

        errors: list[GrammarError] = []
        cursor = 0  # tracks search position in user_input

        for (wrong_text, correct_text), err_item in pairs:
            start_char, end_char = 0, 0

            if wrong_text:  # substitution or deletion
                idx = user_input.lower().find(wrong_text.lower(), cursor)
                if idx != -1:
                    start_char = idx
                    end_char = idx + len(wrong_text)
                    cursor = end_char
            else:
                # Insertion {->word}: zero-width span at cursor position
                start_char = cursor
                end_char = cursor

            cat_code = str(err_item.get("cat", "other"))
            category = _CAT_MAP.get(cat_code, cat_code)
            sev_raw = err_item.get("sev", 1)
            severity = _SEV_MAP.get(int(sev_raw), "minor")

            errors.append(GrammarError(
                original=wrong_text,
                corrected=correct_text,
                start_char=start_char,
                end_char=end_char,
                category=category,
                severity=severity,
                explanation=str(err_item.get("msg", "")),
                rule="",
                example=str(err_item.get("eg", "")),
            ))

        return GrammarData(
            errors=errors,
            corrected_sentence=corrected_sentence,
            overall_score=score,
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        logger.warning(
            "parse_annotated_grammar: failed to parse grammar_raw user_input_length=%d",
            len(user_input),
        )
        return GrammarData()
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
python -m pytest tests/test_grammar_parser/test_annotated_grammar.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/grammar_parser.py tests/test_grammar_parser/
git commit -m "feat(grammar): add split_combined_output and parse_annotated_grammar"
```

---

## Task 2: Update `GRAMMAR_INSTRUCTION` in `prompt_builder.py`

**Files:**
- Modify: `app/prompts/prompt_builder.py`

- [ ] **Step 1: Replace `GRAMMAR_INSTRUCTION` constant**

In `app/prompts/prompt_builder.py`, replace lines 21–51:

```python
GRAMMAR_INSTRUCTION = """\
---

RESPONSE FORMAT — always wrap your output in these XML tags, no exceptions:

<response>
[Your conversational coaching reply here — natural, warm, encouraging]
</response>
<grammar>
{"ann":"<user sentence with {wrong->correct} markers>","err":[{"cat":"<code>","sev":<1|2|3>,"msg":"<one explanation sentence>","eg":"<optional example>"}],"score":<0-100>}
</grammar>

Grammar annotation rules:
- ann: copy the user's LATEST message verbatim, wrapping each error as {wrong->correct}
- Insertion (missing word): {->word}  |  Deletion (extra word): {word->}
- Category codes: vt=verb tense, art=article, prep=preposition, sv=subject-verb agreement,
  sp=spelling, wc=word choice, punc=punctuation, wo=word order, pl=plural/singular, other=catch-all
- Severity: 1=minor  2=major  3=critical
- err[i] corresponds to the i-th {wrong->correct} annotation in ann, in order
- "eg" field is optional — omit for simple or obvious errors
- No errors: ann=<original message unchanged>, err=[], score=100
- score = 100 minus (critical_count×15 + major_count×8 + minor_count×3), minimum 0
- Include the <grammar> block ONLY in your final conversational reply.
  Do NOT include it when you are calling tools.\
"""
```

- [ ] **Step 2: Run existing prompt builder tests to check nothing broke**

```bash
python -m pytest tests/test_ai_services/test_ai_services.py::TestPromptArchitecture -v
```

Expected: all PASS (prompt builder logic is unchanged — only the constant content changed).

- [ ] **Step 3: Commit**

```bash
git add app/prompts/prompt_builder.py
git commit -m "feat(prompt): replace JSON grammar instruction with compact XML-tag format"
```

---

## Task 3: Update `AgentState` — rename `grammar_json` to `grammar_raw`

**Files:**
- Modify: `app/agents/state.py`

- [ ] **Step 1: Rename the field**

Replace the full contents of `app/agents/state.py`:

```python
from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    user_input: str
    response_text: str
    audio_bytes: bytes   # raw MP3 bytes from TTS; empty on failure
    history: list[str]
    voice_gender: str | None
    grammar_raw: str | None  # raw compact JSON from <grammar> tag; None on failure
    category: str | None      # routing context — e.g. "daily_conversation"
    topic: str | None         # routing context — e.g. "ordering_food"
    user_id: str | None       # authenticated user UUID — injected into system prompt for tool calls
    messages: Annotated[list[BaseMessage], add_messages]  # tool-calling sub-loop accumulator
    _tool_call_iterations: int                            # loop guard counter
```

- [ ] **Step 2: Commit**

```bash
git add app/agents/state.py
git commit -m "refactor(state): rename grammar_json to grammar_raw"
```

---

## Task 4: Update `pipeline.py` — single combined LLM call

**Files:**
- Modify: `app/agents/pipeline.py`

- [ ] **Step 1: Update `_respond_node` to use combined prompt and split on tags**

In `app/agents/pipeline.py`, make these changes:

**4a.** In `_respond_node`, change `build_system_prompt` call (around line 77) to always pass `include_grammar=True`:

```python
        dynamic_prompt = build_system_prompt(
            category=state.get("category"),
            topic=state.get("topic"),
            include_grammar=True,
        )
```

**4b.** In the rate-limit error return (around line 126), change `grammar_json` → `grammar_raw`:

```python
            except RateLimitError as exc:
                span.fail(str(exc))
                logger.warning(
                    "respond_node rate_limited iteration=%d: %s",
                    iterations,
                    exc,
                )
                return {
                    **state,
                    "response_text": "I'm a bit overwhelmed right now. Please try again in a moment.",
                    "messages": [],
                    "_tool_call_iterations": iterations,
                    "grammar_raw": None,
                }
```

**4c.** Replace the entire final-response block (lines 171–196) — remove the separate grammar call and use `split_combined_output` instead:

Replace this block:
```python
        # No tool calls — final response; run grammar analysis as a second pass
        response_text = ai_msg.content or ""
        logger.debug(
            "respond_node no_tool_calls text_preview=%r",
            response_text[:120],
        )

        _, grammar_json = self.llm_service.generate_response_with_grammar(
            user_input=state["user_input"],
            history=state.get("history", []),
            category=state.get("category"),
            topic=state.get("topic"),
        )

        history = state.get("history", []) + [
            f"User: {state['user_input']}",
            f"Assistant: {response_text}",
        ]
        return {
            **state,
            "response_text": response_text,
            "history": history,
            "grammar_json": grammar_json,
            "messages": [ai_msg],
            "_tool_call_iterations": iterations,
        }
```

With:
```python
        # No tool calls — final response; split <response> and <grammar> sections
        from app.services.grammar_parser import split_combined_output
        raw_output = ai_msg.content or ""
        response_text, grammar_raw = split_combined_output(raw_output)
        logger.debug(
            "respond_node no_tool_calls response_preview=%r grammar_present=%s",
            response_text[:120],
            grammar_raw is not None,
        )

        history = state.get("history", []) + [
            f"User: {state['user_input']}",
            f"Assistant: {response_text}",
        ]
        return {
            **state,
            "response_text": response_text,
            "history": history,
            "grammar_raw": grammar_raw,
            "messages": [ai_msg],
            "_tool_call_iterations": iterations,
        }
```

**4d.** Update `pipeline.run()` initial state — rename `grammar_json` → `grammar_raw` (around line 237):

```python
        initial_state: AgentState = {
            "user_input": user_input,
            "response_text": "",
            "audio_bytes": b"",
            "history": history or [],
            "voice_gender": voice_gender,
            "grammar_raw": None,
            "category": category,
            "topic": topic,
            "user_id": user_id,
            "messages": [],
            "_tool_call_iterations": 0,
        }
```

- [ ] **Step 2: Verify import is clean**

```bash
python -c "from app.agents.pipeline import VoiceAgentPipeline; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add app/agents/pipeline.py
git commit -m "feat(pipeline): single combined LLM call with XML-tag grammar format"
```

---

## Task 5: Remove `generate_response_with_grammar` from `groq_llm.py`

**Files:**
- Modify: `app/services/groq_llm.py`

- [ ] **Step 1: Delete the method**

In `app/services/groq_llm.py`, delete the entire `generate_response_with_grammar` method (lines 115–182):

```python
    def generate_response_with_grammar(
        self,
        ...
    ) -> tuple[str, str | None]:
        ...
        # DELETE ALL OF THIS
```

The file after deletion should end at line 113 (`return result`), closing `generate_response`.

- [ ] **Step 2: Verify import is clean**

```bash
python -c "from app.services.groq_llm import GroqLLMService; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add app/services/groq_llm.py
git commit -m "refactor(groq): remove generate_response_with_grammar and json_client"
```

---

## Task 6: Update `ai_services.py` — read `grammar_raw` from pipeline state

**Files:**
- Modify: `app/core/ai_services.py`

- [ ] **Step 1: Update `run_langraph_agent` to use `grammar_raw`**

In `app/core/ai_services.py`, replace the relevant lines in `run_langraph_agent`:

Change line `grammar_json: str | None = result.get("grammar_json")` to:
```python
        grammar_raw: str | None = result.get("grammar_raw")
```

Change all subsequent `grammar_json` references to `grammar_raw`:
```python
        logger.info(
            "Pipeline run complete response_text_length=%d audio_bytes=%d grammar_present=%s tool_steps=%d",
            len(response_text),
            len(audio_bytes),
            grammar_raw is not None,
            len(tool_steps),
        )

        if response_text:
            if not audio_bytes:
                logger.warning("Pipeline returned text but empty audio - retrying TTS directly")
                audio_bytes = _synthesize_audio_bytes(response_text, voice_gender=voice_gender)
            return response_text, audio_bytes, grammar_raw, tool_steps
```

Also update the function docstring and signature comment:
```python
def run_langraph_agent(
    user_input: str,
    history: list[str] | None = None,
    voice_gender: str | None = None,
    category: str | None = None,
    topic: str | None = None,
    user_id: str | None = None,
) -> tuple[str, bytes, str | None, list]:
    """Run the conversation pipeline and return (response_text, audio_bytes, grammar_raw, tool_steps)."""
```

- [ ] **Step 2: Verify import is clean**

```bash
python -c "from app.core.ai_services import run_langraph_agent; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add app/core/ai_services.py
git commit -m "refactor(ai_services): use grammar_raw field from pipeline state"
```

---

## Task 7: Update `schemas.py` and `chat.py` — return full grammar inline

**Files:**
- Modify: `app/api/schemas.py`
- Modify: `app/api/chat.py`

- [ ] **Step 1: Update `schemas.py`**

**7a.** Make `rule` and `example` optional in `GrammarErrorDetail` (around line 264):

```python
class GrammarErrorDetail(BaseModel):
    id: int
    original: str
    corrected: str
    start_char: int
    end_char: int
    category: str
    severity: str
    explanation: str
    rule: str | None = None
    example: str | None = None
```

**7b.** Add `grammar_detail` field to `ChatResponse` (around line 86):

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
    grammar_detail: GrammarDetailResponse | None = None
    tool_steps: list[ToolCallStep] = Field(default_factory=list)
```

- [ ] **Step 2: Update `chat.py`**

**7c.** Update the import at the top of `chat.py` — replace `parse_grammar_response` with `parse_annotated_grammar`:

```python
from app.services.grammar_parser import parse_annotated_grammar
```

**7d.** Update the `run_langraph_agent` call and parsing (around line 324):

```python
    response_text, response_audio_bytes, grammar_raw, tool_steps = run_langraph_agent(
        user_input=user_input,
        history=history_lines,
        voice_gender=voice_gender,
        category=category,
        topic=topic,
        user_id=user_id,
    )
    grammar_data = parse_annotated_grammar(grammar_raw, user_input)
```

**7e.** Update the grammar DB insert condition (around line 407) — change `grammar_json` to `grammar_raw`:

```python
            if grammar_raw is not None:
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

**7f.** Build `grammar_detail` and add it to the `ChatResponse` return (after `grammar_summary` block, around line 462):

```python
    grammar_detail = GrammarDetailResponse(
        message_id=user_message_id,
        user_input=user_input,
        errors=[
            GrammarErrorDetail(
                id=i + 1,
                original=e.original,
                corrected=e.corrected,
                start_char=e.start_char,
                end_char=e.end_char,
                category=e.category,
                severity=e.severity,
                explanation=e.explanation,
                rule=e.rule or None,
                example=e.example or None,
            )
            for i, e in enumerate(grammar_data.errors)
        ],
        corrected_sentence=grammar_data.corrected_sentence,
        overall_score=grammar_data.overall_score,
    ) if grammar_raw is not None else None
```

**7g.** Add `GrammarDetailResponse` and `GrammarErrorDetail` to the imports from `app.api.schemas` in `chat.py`:

```python
from app.api.schemas import ChatResponse, GrammarSummary, GrammarSpan, ToolCallStep, GrammarDetailResponse, GrammarErrorDetail
```

**7h.** Add `grammar_detail=grammar_detail` to the `ChatResponse(...)` return (around line 476):

```python
    return ChatResponse(
        user_input=user_input,
        response_text=response_text,
        audio_base64=inline_audio,
        audio_mime="audio/mpeg",
        user_audio_url=user_audio_url,
        assistant_audio_url=assistant_audio_url,
        conversation_id=conv_id,
        user_message_id=user_message_id if grammar_raw is not None else None,
        grammar_summary=grammar_summary,
        grammar_detail=grammar_detail,
        tool_steps=tool_steps,
    )
```

- [ ] **Step 3: Verify import is clean**

```bash
python -c "from app.api.chat import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add app/api/schemas.py app/api/chat.py
git commit -m "feat(api): return full grammar_detail inline in ChatResponse"
```

---

## Task 8: Update existing backend tests

**Files:**
- Modify: `tests/test_ai_services/test_ai_services.py`

- [ ] **Step 1: Update `TestRunLangraphAgent` mock returns**

The mock pipeline's `run()` return currently uses `grammar_json`. Update `_mock_pipeline` helper and all assertions that check `grammar` to reflect that grammar still returns as `None` from mock (since mock doesn't set `grammar_raw`):

Find `_mock_pipeline` method in `TestRunLangraphAgent` and update mock state keys:

```python
    def _mock_pipeline(self, response_text="Great answer!", audio_bytes=b"mp3"):
        mock_pipeline = MagicMock()
        mock_pipeline.run.return_value = {
            "response_text": response_text,
            "audio_bytes": audio_bytes,
            "grammar_raw": None,
            "messages": [],
        }
        return mock_pipeline
```

- [ ] **Step 2: Run the full test suite**

```bash
python -m pytest tests/test_ai_services/test_ai_services.py tests/test_grammar_parser/ -v
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/test_ai_services/test_ai_services.py
git commit -m "test: update ai_services tests for grammar_raw field rename"
```

---

## Task 9: Frontend — add `grammar_detail` to API types

**Files:**
- Modify: `frontend/src/api/chat.ts`
- Modify: `frontend/src/components/voice-agent/MessageBubble.tsx`

- [ ] **Step 1: Add `grammar_detail` to `ChatRespondResult` in `chat.ts`**

In `frontend/src/api/chat.ts`, update `ChatRespondResult` interface:

```typescript
export interface ChatRespondResult {
  response_text: string;
  audio_base64?: string;
  audio_mime?: string;
  user_input?: string;
  user_audio_url?: string | null;
  assistant_audio_url?: string | null;
  conversation_id?: string;
  user_message_id?: string;
  tool_steps?: ToolCallStep[];
  grammar_detail?: GrammarFeedbackPayload | null;
}
```

- [ ] **Step 2: Add `grammarChecked` to `Message` in `MessageBubble.tsx`**

In `frontend/src/components/voice-agent/MessageBubble.tsx`, update the `Message` interface:

```typescript
export interface Message {
  id: number;
  backendMessageId?: string;
  role: 'agent' | 'user';
  text: string;
  timestamp: Date;
  typing?: boolean;
  audioUrl?: string;
  score?: number;
  minioUrl?: string;
  userAudioUrl?: string;
  audioBlob?: Blob;
  scoreDetails?: ScoreDetails;
  mistakes?: Mistake[];
  assessmentStatus?: 'available' | 'unavailable' | 'failed' | 'pending';
  assessmentNote?: string;
  toolSteps?: ToolCallStep[];
  grammarChecked?: boolean;
}
```

- [ ] **Step 3: Build frontend to check for TypeScript errors**

```bash
cd D:/work/projects/English-Speaking-Agent/frontend
npm run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd D:/work/projects/English-Speaking-Agent
git add frontend/src/api/chat.ts frontend/src/components/voice-agent/MessageBubble.tsx
git commit -m "feat(frontend): add grammar_detail to ChatRespondResult and grammarChecked to Message"
```

---

## Task 10: Frontend — `useSendChatMessage.ts` — remove redundant grammar fetch

**Files:**
- Modify: `frontend/src/hooks/useSendChatMessage.ts`

- [ ] **Step 1: Replace the `fetchGrammarFeedback` block with inline grammar reading**

In `frontend/src/hooks/useSendChatMessage.ts`, find the block starting at line 178:

```typescript
          if (userMessageId) {
            setIsGrammarLoading(true);
            void fetchGrammarFeedback(session.token, userMessageId)
              .then((data) => {
                ...
              })
              ...
          }
```

Replace the entire block (lines 178–237) with:

```typescript
          // Grammar is returned inline in the chat response — no follow-up fetch needed
          setIsGrammarLoading(true);
          const grammarPayload = data.grammar_detail ?? null;
          if (grammarPayload) {
            const items = grammarPayload.errors ?? [];
            setGrammarCorrectedSentence(grammarPayload.corrected_sentence ?? '');
            const grammarMistakes = items.reduce<Mistake[]>((acc, item) => {
              const raw = item as Record<string, unknown>;
              const wrong = String(
                item.wrong ??
                item.original_text ??
                item.original ??
                raw.original ??
                raw.text ??
                raw.error_text ??
                raw.incorrect ??
                '',
              ).trim();
              const correct = String(
                item.correct ??
                item.corrected_text ??
                item.corrected ??
                raw.corrected ??
                raw.suggestion ??
                raw.fix ??
                '',
              ).trim();
              const note = String(
                item.note ?? item.explanation ?? raw.reason ?? raw.detail ?? raw.message ?? '',
              ).trim();
              acc.push({
                wrong: wrong || '—',
                correct: correct || '—',
                type: 'Grammar' as const,
                note: note || undefined,
              });
              return acc;
            }, []);
            setGrammarErrors(grammarMistakes);
            setMessages((prev) =>
              prev.map((message) => {
                if (message.id !== userId) return message;
                const existing = message.mistakes ?? [];
                const nonGrammar = existing.filter((m) => m.type !== 'Grammar');
                return {
                  ...message,
                  mistakes: [...nonGrammar, ...grammarMistakes],
                  grammarChecked: true,
                };
              }),
            );
          } else {
            setGrammarErrors([]);
            setGrammarCorrectedSentence('');
            setMessages((prev) =>
              prev.map((message) =>
                message.id === userId ? { ...message, grammarChecked: true } : message,
              ),
            );
          }
          setIsGrammarLoading(false);
```

- [ ] **Step 2: Build frontend**

```bash
cd D:/work/projects/English-Speaking-Agent/frontend
npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd D:/work/projects/English-Speaking-Agent
git add frontend/src/hooks/useSendChatMessage.ts
git commit -m "feat(frontend): read grammar_detail inline from chat response, remove fetchGrammarFeedback call"
```

---

## Task 11: Frontend — `VoiceAgent.tsx` — cache-check and topic-switch guard

**Files:**
- Modify: `frontend/src/pages/VoiceAgent.tsx`

- [ ] **Step 1: Add grammar cache-check before fetch (around line 774)**

In the `useEffect` that calls `fetchGrammarFeedback` on message expand, add a cache check after the early returns. Find the block that starts with:

```typescript
  useEffect(() => {
    grammarAbortRef.current?.abort();

    if (!displayMsg || displayMsg.role !== 'user') {
      setIsGrammarLoading(false);
      return;
    }
```

Add the cache-check immediately after the role check:

```typescript
  useEffect(() => {
    grammarAbortRef.current?.abort();

    if (!displayMsg || displayMsg.role !== 'user') {
      setIsGrammarLoading(false);
      return;
    }

    // Skip network fetch if grammar was already loaded for this message
    if (displayMsg.grammarChecked) {
      const cached = displayMsg.mistakes?.filter((m) => m.type === 'Grammar') ?? [];
      setGrammarErrors(cached);
      setIsGrammarLoading(false);
      return;
    }

    // ... rest of existing fetchGrammarFeedback logic unchanged
```

- [ ] **Step 2: Add `convsLoading` guard on auto-load (around line 718)**

Find the auto-load effect:

```typescript
  useEffect(() => {
    if (hasAutoLoadedRef.current) return;
    const latest = conversations[0];
    if (latest) {
      hasAutoLoadedRef.current = true;
      loadConversationInPlace(latest.id, topic);
    }
  }, [conversations, topic, convsLoading, loadConversationInPlace]);
```

Add the `convsLoading` guard:

```typescript
  useEffect(() => {
    if (convsLoading || hasAutoLoadedRef.current) return;
    const latest = conversations[0];
    if (latest) {
      hasAutoLoadedRef.current = true;
      loadConversationInPlace(latest.id, topic);
    }
  }, [conversations, topic, convsLoading, loadConversationInPlace]);
```

- [ ] **Step 3: Build frontend**

```bash
cd D:/work/projects/English-Speaking-Agent/frontend
npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Run backend tests one final time**

```bash
cd D:/work/projects/English-Speaking-Agent
python -m pytest tests/test_ai_services/ tests/test_grammar_parser/ -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd D:/work/projects/English-Speaking-Agent
git add frontend/src/pages/VoiceAgent.tsx
git commit -m "feat(frontend): skip grammar fetch if cached; guard topic-switch auto-load"
```
