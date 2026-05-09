# Reasoning Steps UI Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible timeline UI that shows the agent's tool-calling steps below each agent message bubble, backed by a new `tool_steps` field in `ChatResponse`.

**Architecture:** Extract tool call steps from `AgentState.messages` after the LangGraph pipeline completes; surface them through a new `ToolCallStep` Pydantic model on `ChatResponse`; render them in a new `ReasoningSteps.tsx` React component mounted below the agent bubble in `MessageBubble.tsx`.

**Tech Stack:** Python/FastAPI/Pydantic (backend), React 18/TypeScript/Tailwind CSS/framer-motion/Lucide React (frontend)

---

### Task 1: Add `ToolCallStep` Pydantic schema

**Files:**
- Modify: `app/api/schemas.py` (after line 80, before `class MessageOut`)

- [ ] **Step 1: Write the failing test**

Create `tests/test_api/test_tool_call_step_schema.py`:

```python
from app.api.schemas import ToolCallStep, ChatResponse


def test_tool_call_step_defaults():
    step = ToolCallStep(
        tool_name="get_due_cards",
        input_summary="limit=10",
        output_summary="3 cards returned",
    )
    assert step.status == "completed"
    assert step.duration_ms is None
    assert step.error is None


def test_tool_call_step_failed():
    step = ToolCallStep(
        tool_name="create_deck",
        input_summary="name=Vocab",
        output_summary="",
        status="failed",
        error="DB connection timeout",
    )
    assert step.status == "failed"
    assert step.error == "DB connection timeout"


def test_chat_response_has_tool_steps_default():
    resp = ChatResponse(
        user_input="hi",
        response_text="hello",
        conversation_id="abc",
        user_message_id="xyz",
    )
    assert resp.tool_steps == []


def test_chat_response_serializes_tool_steps():
    step = ToolCallStep(
        tool_name="list_decks",
        input_summary="",
        output_summary="2 decks found",
    )
    resp = ChatResponse(
        user_input="hi",
        response_text="hello",
        conversation_id="abc",
        user_message_id="xyz",
        tool_steps=[step],
    )
    data = resp.model_dump()
    assert len(data["tool_steps"]) == 1
    assert data["tool_steps"][0]["tool_name"] == "list_decks"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_api/test_tool_call_step_schema.py -v
```

Expected: FAIL — `ToolCallStep` not yet defined, `ChatResponse` has no `tool_steps`.

- [ ] **Step 3: Add `ToolCallStep` and update `ChatResponse` in `app/api/schemas.py`**

Insert after the closing brace of `GrammarSummary` (after line 65), before `class ChatResponse`:

```python
class ToolCallStep(BaseModel):
    tool_name: str
    input_summary: str
    output_summary: str
    duration_ms: int | None = None
    status: Literal["completed", "failed"] = "completed"
    error: str | None = None
```

Then add `tool_steps` field to `ChatResponse` (after line 78, inside `ChatResponse`):

```python
tool_steps: list[ToolCallStep] = Field(default_factory=list)
```

Also add `ToolCallStep` to the import in `app/api/chat.py` line 17:

```python
from app.api.schemas import ChatResponse, GrammarSummary, GrammarSpan, ToolCallStep
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_api/test_tool_call_step_schema.py -v
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/schemas.py tests/test_api/test_tool_call_step_schema.py
git commit -m "feat(schema): add ToolCallStep model and tool_steps field to ChatResponse"
```

---

### Task 2: Add tool step extraction logic

**Files:**
- Create: `app/agents/tool_steps.py`
- Create: `tests/test_agents/test_tool_steps.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_agents/test_tool_steps.py`:

```python
from langchain_core.messages import AIMessage, ToolMessage

from app.agents.tool_steps import extract_tool_steps


def _ai_with_tool_calls(*calls):
    """Build an AIMessage whose tool_calls list matches LangChain's format."""
    tool_calls = [
        {"id": tc["id"], "name": tc["name"], "args": tc.get("args", {})}
        for tc in calls
    ]
    return AIMessage(content="", tool_calls=tool_calls)


def _tool_result(tool_call_id: str, content: str):
    return ToolMessage(content=content, tool_call_id=tool_call_id)


def test_no_messages_returns_empty():
    assert extract_tool_steps([]) == []


def test_no_tool_calls_returns_empty():
    msgs = [AIMessage(content="Hello there")]
    assert extract_tool_steps(msgs) == []


def test_single_completed_step():
    msgs = [
        _ai_with_tool_calls({"id": "tc1", "name": "get_due_cards", "args": {"limit": 10}}),
        _tool_result("tc1", '[{"id":"c1","front":"apple"}]'),
    ]
    steps = extract_tool_steps(msgs)
    assert len(steps) == 1
    assert steps[0].tool_name == "get_due_cards"
    assert steps[0].status == "completed"
    assert "limit" in steps[0].input_summary
    assert steps[0].output_summary != ""


def test_multiple_steps_in_order():
    msgs = [
        _ai_with_tool_calls({"id": "tc1", "name": "list_decks", "args": {}}),
        _tool_result("tc1", '[{"id":"d1","name":"IELTS"}]'),
        _ai_with_tool_calls({"id": "tc2", "name": "get_due_cards", "args": {"limit": 5}}),
        _tool_result("tc2", '[{"id":"c1"}]'),
    ]
    steps = extract_tool_steps(msgs)
    assert len(steps) == 2
    assert steps[0].tool_name == "list_decks"
    assert steps[1].tool_name == "get_due_cards"


def test_failed_step_no_tool_message():
    msgs = [
        _ai_with_tool_calls({"id": "tc1", "name": "create_deck", "args": {"name": "Vocab"}}),
        # No ToolMessage for tc1 — simulates a failed/missing result
    ]
    steps = extract_tool_steps(msgs)
    assert len(steps) == 1
    assert steps[0].status == "failed"


def test_input_summary_truncated_at_80_chars():
    long_val = "x" * 100
    msgs = [
        _ai_with_tool_calls({"id": "tc1", "name": "search_cards", "args": {"query": long_val}}),
        _tool_result("tc1", "ok"),
    ]
    steps = extract_tool_steps(msgs)
    assert len(steps[0].input_summary) <= 81  # 80 chars + optional ellipsis char


def test_output_summary_truncated_at_120_chars():
    long_output = "x" * 200
    msgs = [
        _ai_with_tool_calls({"id": "tc1", "name": "list_decks", "args": {}}),
        _tool_result("tc1", long_output),
    ]
    steps = extract_tool_steps(msgs)
    assert len(steps[0].output_summary) <= 121  # 120 chars + optional ellipsis char
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_agents/test_tool_steps.py -v
```

Expected: FAIL — `app.agents.tool_steps` module does not exist.

- [ ] **Step 3: Create `app/agents/tool_steps.py`**

```python
import json

from langchain_core.messages import AIMessage, ToolMessage

from app.api.schemas import ToolCallStep


def _format_args(args: dict) -> str:
    """Serialize tool call args to a compact 'key=val' string, truncated at 80 chars."""
    parts = []
    for k, v in args.items():
        parts.append(f"{k}={json.dumps(v) if not isinstance(v, str) else v}")
    result = ", ".join(parts)
    return result[:80] + "…" if len(result) > 80 else result


def _truncate(text: str, max_len: int) -> str:
    return text[:max_len] + "…" if len(text) > max_len else text


def extract_tool_steps(messages: list) -> list[ToolCallStep]:
    """Walk AgentState messages and return one ToolCallStep per tool call."""
    # Build a map of tool_call_id -> result content from ToolMessages
    tool_results: dict[str, str] = {}
    for msg in messages:
        if isinstance(msg, ToolMessage):
            content = msg.content
            if isinstance(content, list):
                content = json.dumps(content)
            elif not isinstance(content, str):
                content = str(content)
            tool_results[msg.tool_call_id] = content

    steps: list[ToolCallStep] = []
    for msg in messages:
        if not isinstance(msg, AIMessage) or not msg.tool_calls:
            continue
        for tc in msg.tool_calls:
            tool_call_id = tc.get("id", "")
            tool_name = tc.get("name", "unknown")
            args = tc.get("args", {})

            input_summary = _format_args(args)
            raw_output = tool_results.get(tool_call_id)
            status: str
            output_summary: str

            if raw_output is not None:
                status = "completed"
                output_summary = _truncate(raw_output, 120)
            else:
                status = "failed"
                output_summary = ""

            steps.append(
                ToolCallStep(
                    tool_name=tool_name,
                    input_summary=input_summary,
                    output_summary=output_summary,
                    status=status,  # type: ignore[arg-type]
                )
            )

    return steps
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_agents/test_tool_steps.py -v
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/agents/tool_steps.py tests/test_agents/test_tool_steps.py
git commit -m "feat(agents): add extract_tool_steps utility with tests"
```

---

### Task 3: Wire tool steps through `run_langraph_agent` and `chat.py`

**Files:**
- Modify: `app/core/ai_services.py:118-154`
- Modify: `app/api/chat.py:298-304` and `app/api/chat.py:449-459`

- [ ] **Step 1: Update `run_langraph_agent` in `app/core/ai_services.py`**

Change the return type and add extraction. Replace the function signature and return statements:

```python
def run_langraph_agent(
    user_input: str,
    history: list[str] | None = None,
    voice_gender: str | None = None,
    category: str | None = None,
    topic: str | None = None,
) -> tuple[str, bytes, str | None, list]:
    """Run the conversation pipeline and return (response_text, audio_bytes, grammar_json, tool_steps)."""
    from app.agents.tool_steps import extract_tool_steps

    history = history or []
    logger.info("run_langraph_agent start user_input_length=%d history_lines=%d category=%s topic=%s", len(user_input), len(history), category, topic)
    try:
        pipeline = get_voice_agent_pipeline()
        result = pipeline.run(user_input=user_input, history=history, voice_gender=voice_gender, category=category, topic=topic)
        response_text = str(result.get("response_text", "")).strip()
        audio_bytes: bytes = result.get("audio_bytes") or b""
        grammar_json: str | None = result.get("grammar_json")
        tool_steps = extract_tool_steps(result.get("messages", []))

        logger.info(
            "Pipeline run complete response_text_length=%d audio_bytes=%d grammar_present=%s tool_steps=%d",
            len(response_text),
            len(audio_bytes),
            grammar_json is not None,
            len(tool_steps),
        )

        if response_text:
            if not audio_bytes:
                logger.warning("Pipeline returned text but empty audio - retrying TTS directly")
                audio_bytes = _synthesize_audio_bytes(response_text, voice_gender=voice_gender)
            return response_text, audio_bytes, grammar_json, tool_steps

        logger.warning("Pipeline returned empty response_text - using fallback")
    except Exception:
        logger.exception("LangGraph agent pipeline failed user_input_length=%d", len(user_input))

    fallback_text = "Sorry, I couldn't process your request right now."
    logger.info("Returning fallback response")
    return fallback_text, _synthesize_audio_bytes(fallback_text, voice_gender=voice_gender), None, []
```

- [ ] **Step 2: Update `chat.py` to unpack and use `tool_steps`**

In `app/api/chat.py`, line 298, change the unpacking:

```python
response_text, response_audio_bytes, grammar_json, tool_steps = run_langraph_agent(
    user_input=user_input,
    history=history_lines,
    voice_gender=voice_gender,
    category=category,
    topic=topic,
)
```

In `app/api/chat.py`, line 449, update the `return ChatResponse(...)` call by adding `tool_steps=tool_steps`:

```python
return ChatResponse(
    user_input=user_input,
    response_text=response_text,
    audio_base64=inline_audio,
    audio_mime="audio/mpeg",
    user_audio_url=user_audio_url,
    assistant_audio_url=assistant_audio_url,
    conversation_id=conv_id,
    user_message_id=user_message_id,
    grammar_summary=grammar_summary,
    tool_steps=tool_steps,
)
```

- [ ] **Step 3: Verify existing tests still pass**

```bash
pytest tests/ -v --ignore=tests/test_agents/test_tool_steps.py --ignore=tests/test_api/test_tool_call_step_schema.py -x
```

Expected: all existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/core/ai_services.py app/api/chat.py app/api/schemas.py
git commit -m "feat(api): wire tool_steps through run_langraph_agent into ChatResponse"
```

---

### Task 4: Add TypeScript types to frontend

**Files:**
- Modify: `frontend/src/api/chat.ts:15-24`
- Modify: `frontend/src/components/voice-agent/MessageBubble.tsx:20-36`

- [ ] **Step 1: Add `ToolCallStep` interface and update `ChatRespondResult` in `frontend/src/api/chat.ts`**

After line 13 (end of `ChatRespondParams`), add:

```ts
export interface ToolCallStep {
  tool_name: string;
  input_summary: string;
  output_summary: string;
  duration_ms?: number;
  status: 'completed' | 'failed';
  error?: string;
}
```

In `ChatRespondResult` (lines 15-24), add `tool_steps` field:

```ts
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
}
```

- [ ] **Step 2: Add `toolSteps` to the `Message` interface in `frontend/src/components/voice-agent/MessageBubble.tsx`**

In the `Message` interface (lines 20-36), add `toolSteps` after `assessmentNote`:

```ts
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
}
```

Also add the import of `ToolCallStep` at the top of `MessageBubble.tsx`. Since `ToolCallStep` will be defined in `ReasoningSteps.tsx` (created in Task 5), for now re-export it from `chat.ts`:

Add import at the top of `MessageBubble.tsx` (after line 2, with existing imports):

```ts
import type { ToolCallStep } from '../../api/chat';
export type { ToolCallStep };
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors related to `ToolCallStep` or `toolSteps`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/chat.ts frontend/src/components/voice-agent/MessageBubble.tsx
git commit -m "feat(frontend): add ToolCallStep type and toolSteps field to Message"
```

---

### Task 5: Create `ReasoningSteps.tsx` component

**Files:**
- Create: `frontend/src/components/voice-agent/ReasoningSteps.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react';
import { ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import type { ToolCallStep } from '../../api/chat';

interface ReasoningStepsProps {
  steps: ToolCallStep[];
  defaultOpen?: boolean;
}

export default function ReasoningSteps({ steps, defaultOpen = false }: ReasoningStepsProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (steps.length === 0) return null;

  const totalMs = steps.reduce((sum, s) => sum + (s.duration_ms ?? 0), 0);
  const hasAnyDuration = steps.some((s) => s.duration_ms != null);

  return (
    <div className="mt-1.5 w-full text-xs">
      {/* Collapsed bar */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800 dark:text-slate-400"
      >
        <span className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span>
            {steps.length} tool call{steps.length !== 1 ? 's' : ''}
            {hasAnyDuration ? ` · ${totalMs}ms` : ''}
          </span>
        </span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {/* Expanded timeline */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="border border-t-0 border-slate-200 rounded-b-lg bg-white px-3 py-2.5 flex flex-col dark:border-slate-700 dark:bg-slate-900">
              {steps.map((step, i) => (
                <div key={i} className="flex gap-2.5">
                  {/* Timeline dot + connector line */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full mt-0.5 flex-shrink-0',
                        step.status === 'completed' ? 'bg-emerald-400' : 'bg-red-400',
                      )}
                    />
                    {i < steps.length - 1 && (
                      <div className="w-px flex-1 bg-slate-100 mt-1 dark:bg-slate-700" />
                    )}
                  </div>

                  {/* Step content */}
                  <div className={cn('flex-1 min-w-0', i < steps.length - 1 && 'pb-3')}>
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <span className="font-semibold text-slate-700 truncate dark:text-slate-200">
                        {step.tool_name}
                      </span>
                      {step.duration_ms != null && (
                        <span className="text-slate-400 flex-shrink-0">{step.duration_ms}ms</span>
                      )}
                    </div>

                    {/* In / Out summary pill */}
                    <div className="bg-slate-50 rounded border border-slate-100 px-2 py-1 flex flex-col gap-0.5 dark:bg-slate-800 dark:border-slate-700">
                      <div className="flex gap-2 items-baseline min-w-0">
                        <span className="text-[10px] uppercase tracking-wide text-slate-400 w-5 flex-shrink-0">
                          in
                        </span>
                        <span className="text-slate-600 break-words dark:text-slate-300">
                          {step.input_summary || '—'}
                        </span>
                      </div>
                      <div className="flex gap-2 items-baseline min-w-0">
                        <span className="text-[10px] uppercase tracking-wide text-slate-400 w-5 flex-shrink-0">
                          out
                        </span>
                        <span
                          className={cn(
                            'break-words',
                            step.status === 'failed'
                              ? 'text-red-500 dark:text-red-400'
                              : 'text-emerald-600 dark:text-emerald-400',
                          )}
                        >
                          {step.status === 'failed'
                            ? (step.error ?? 'Error')
                            : (step.output_summary || '—')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/voice-agent/ReasoningSteps.tsx
git commit -m "feat(ui): add ReasoningSteps timeline component"
```

---

### Task 6: Render `ReasoningSteps` in `MessageBubble`

**Files:**
- Modify: `frontend/src/components/voice-agent/MessageBubble.tsx:1,208-283`

- [ ] **Step 1: Add import and render `ReasoningSteps` below the bubble**

At the top of `MessageBubble.tsx`, add import after the existing imports (after line 2):

```ts
import ReasoningSteps from './ReasoningSteps';
```

In the `MessageBubble` return, the outer structure is:

```tsx
<div className={`max-w-[75%] flex flex-col gap-1 ${isAgent ? 'items-start' : 'items-end'}`}>
  <div ...>  {/* header row: name, time, replay, score */}
  <button ...>  {/* message bubble */}
  {/* ADD HERE */}
</div>
```

Add `<ReasoningSteps>` after the `<button>` closing tag (after line 279), still inside the outer `<div>`:

```tsx
{isAgent && !message.typing && (message.toolSteps?.length ?? 0) > 0 && (
  <ReasoningSteps steps={message.toolSteps!} />
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/voice-agent/MessageBubble.tsx
git commit -m "feat(ui): render ReasoningSteps below agent message bubble"
```

---

### Task 7: Map `tool_steps` in `useSendChatMessage`

**Files:**
- Modify: `frontend/src/hooks/useSendChatMessage.ts:266-287`

- [ ] **Step 1: Add `toolSteps` to the agent message update**

In `useSendChatMessage.ts`, find the `setMessages` call that resolves the `typingId` message (around line 266). This is inside the `else` branch where `responseText` is truthy.

Change the mapping for `message.id === typingId` to include `toolSteps`:

```ts
setMessages((prev) =>
  prev.map((message) =>
    message.id === userId
      ? {
          ...message,
          backendMessageId: userMessageId ?? message.backendMessageId,
          userAudioUrl: message.userAudioUrl || data.user_audio_url || undefined,
        }
      : message.id === typingId
        ? {
            ...message,
            text: responseText,
            typing: false,
            audioUrl: playedUrl,
            minioUrl: data.assistant_audio_url || undefined,
            toolSteps: data.tool_steps ?? [],
          }
        : message,
  ),
);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Build to verify no runtime issues**

```bash
cd frontend && npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useSendChatMessage.ts
git commit -m "feat(hooks): map tool_steps from API response into agent message toolSteps"
```

---

### Task 8: Run full test suite

- [ ] **Step 1: Run all backend tests**

```bash
pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 2: Verify frontend build**

```bash
cd frontend && npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Manual smoke test**

Start the dev stack, send a message that triggers a tool call (e.g. "show me my flashcard decks"). Verify:
- The agent bubble renders with the `⚡ N tool calls` bar below it
- Clicking the bar expands the timeline
- Each step shows tool name, `in` summary, `out` summary
- Clicking again collapses with smooth animation
- Messages without tool calls show no bar

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: reasoning steps UI component — full-stack implementation complete"
```
