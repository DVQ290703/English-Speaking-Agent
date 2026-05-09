# Reasoning Steps UI Component — Design Spec

**Date:** 2026-05-10  
**Status:** Approved

## Overview

Add a collapsible UI component that displays the agent's tool-calling steps below each agent message bubble. Serves two audiences: learners (trust/transparency) and developers (debugging). Full-stack change — backend exposes tool step data, frontend renders it.

---

## Data Model

### Backend (`app/api/schemas.py`)

```python
class ToolCallStep(BaseModel):
    tool_name: str
    input_summary: str    # key=val pairs, truncated at 80 chars
    output_summary: str   # human-readable result summary
    duration_ms: int | None = None
    status: Literal["completed", "failed"] = "completed"
    error: str | None = None

# Added to ChatResponse:
tool_steps: list[ToolCallStep] = Field(default_factory=list)
```

### Backend extraction (`app/agents/pipeline.py`)

After the LangGraph pipeline completes, walk `AgentState.messages` to pair `AIMessage.tool_calls` with subsequent `ToolMessage` results. Compute duration from timestamps where available. Build `ToolCallStep` objects and attach to `ChatResponse.tool_steps`.

### Frontend (`src/types/` or `MessageBubble.tsx`)

```ts
interface ToolCallStep {
  tool_name: string;
  input_summary: string;
  output_summary: string;
  duration_ms?: number;
  status: 'completed' | 'failed';
  error?: string;
}
```

The existing `Message` interface gains:
```ts
toolSteps?: ToolCallStep[];
```

---

## Component

**File:** `frontend/src/components/voice-agent/ReasoningSteps.tsx`

```ts
interface ReasoningStepsProps {
  steps: ToolCallStep[];
  defaultOpen?: boolean;  // false by default
}
```

### Collapsed state
A single bar below the agent message bubble showing:
- `⚡ N tool calls · Xms` (total duration)
- Chevron toggle button

Only rendered when `steps.length > 0`.

### Expanded state
Animated open/close using `framer-motion` (`AnimatePresence` + `motion.div`).

Timeline layout per step:
- Dot connector (green = completed, red = failed) with vertical line to next step
- Tool name (bold) + duration (muted, right-aligned)
- Compact in/out summary pill:
  - `IN` label + input_summary
  - `OUT` label + output_summary (or error message in red if failed)

### Integration

**`MessageBubble.tsx`:** Render `<ReasoningSteps steps={message.toolSteps} />` below the message text, gated on `message.role === 'agent' && message.toolSteps?.length > 0`.

**`VoiceAgent.tsx`:** When mapping `ChatResponse` into a `Message`, copy `response.tool_steps` → `message.toolSteps`.

---

## Data Flow

```
User sends message
  → POST /respond
  → LangGraph pipeline runs tool calls (up to 5 iterations)
  → Pipeline completes, extract steps from AgentState.messages
  → ChatResponse.tool_steps populated
  → Frontend maps tool_steps → message.toolSteps
  → MessageBubble renders <ReasoningSteps>
```

---

## Edge Cases

| Case | Behaviour |
|------|-----------|
| No tool calls | `tool_steps: []` → component not rendered |
| Tool call fails | `status: "failed"`, red dot, error shown in out row |
| Long output_summary | Truncate at 120 chars with `…` |
| `duration_ms` unavailable | Omit duration label |
| Old API clients | New field ignored — fully backwards compatible |

---

## Testing

**Backend:** Unit test step-extraction logic with mock `AgentState` covering: no tool calls, single tool call, chained tool calls (3+), one failed step.

**Frontend:** Render `<ReasoningSteps>` with fixture data covering: 0 steps (not rendered), 1 step, 3 steps, failed step, toggle open/close animation.

---

## Out of Scope

- SSE streaming of real-time tool call progress
- Raw JSON input/output view (human-readable summaries only)
- Reasoning/thinking blocks (no `<thinking>` tokens in current LLM setup)
