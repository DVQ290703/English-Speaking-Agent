# Agent & Services

The AI LinguAI is powered by a **LangGraph state machine** that orchestrates four external services. This folder documents the pipeline and each service integration.

---

## Contents

| File | Description |
|------|-------------|
| [groq-llm.md](./groq-llm.md) | Groq LLM â€” conversation generation (llama-3.3-70b) |
| [groq-stt.md](./groq-stt.md) | Groq Whisper â€” speech-to-text transcription |
| [elevenlabs-tts.md](./elevenlabs-tts.md) | ElevenLabs â€” text-to-speech synthesis |
| [azure-assessment.md](./azure-assessment.md) | Azure Cognitive Services â€” pronunciation scoring |

---

## LangGraph Pipeline

Every call to `POST /api/chat/respond` runs through this state machine:

```
user_input
    â”‚
    â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     blocked
â”‚  preflight  â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º END
â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”˜
       â”‚ safe
       â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   tool_calls + cap not hit
â”‚   respond   â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º â”Œâ”€â”€â”€â”€â”€â”€â”€â”
â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”˜                             â”‚ tools â”‚
       â”‚                                    â””â”€â”€â”€â”¬â”€â”€â”€â”˜
       â”‚ no tool_calls                          â”‚ (loops back to respond)
       â–¼                                        â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â—„â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
â”‚     tts     â”‚  (skipped if tool calls were made â†’ END)
â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”˜
       â”‚
       â–¼
      END
```

**Max tool iterations:** 5 (`_TOOL_CALL_CAP`). After the cap the `respond` node is forced into plain mode with no further tool calls.

---

## Nodes

### 1. `preflight`
A single lightweight LLM call (Groq) that simultaneously:
- **Safety-checks** the input â€” detects harmful, off-topic, or injection-like content. Fails **open** (treats as SAFE on error).
- **Detects tool intent** â€” classifies whether the user is requesting a flashcard action. Fails **closed** (no tools on error).

Sets `guardrail_blocked: bool` and `tool_intent: bool` on the state.

### 2. `respond`
The main LLM call (Groq). Operates in one of three modes depending on context:

| Condition | Mode | Output |
|-----------|------|--------|
| `tool_intent=True`, `user_id` set, iterations < cap | **Tool client** | `response_text` + optional `tool_calls` |
| Tools disabled | **Structured client** | `response_text`, `grammar_raw`, `suggestions` via Pydantic |
| Fallback | **Plain client** | `response_text` as plain text |

Grammar feedback is extracted from an XML `<grammar>` tag embedded in the LLM response and stored as a JSON string in `grammar_raw`.

### 3. `tools` (ToolNode)
Executes all `tool_calls` from the previous `respond` output using the **flashcard tools**:
- Create / list / update / delete decks
- Add / update / delete cards
- Get due cards, submit SM-2 reviews

Tool results are sanitized (empty content replaced to satisfy Groq's API) and appended to the `messages` accumulator. Control returns to `respond`.

### 4. `tts`
Converts `response_text` to speech via **ElevenLabs**. Skipped when tool calls were made â€” the tool response is text-only.
Output: `audio_bytes` (raw MP3).

---

## State

```python
class AgentState(TypedDict):
    # Inputs
    user_input: str
    history: list[str]          # Prior conversation lines (oldest first)
    voice_gender: str | None    # "male" or "female"
    voice_accent: str | None    # "british" or "american"
    category: str | None        # e.g. "daily_life"
    topic: str | None           # e.g. "hometown"
    user_id: str | None         # UUID; required to enable tools

    # Set by preflight
    guardrail_blocked: bool
    tool_intent: bool

    # Set by respond
    response_text: str
    grammar_raw: str | None     # JSON string of grammar errors
    suggestions: list[str]      # 0â€“3 follow-up suggestions

    # Set by tools â†’ respond loop
    messages: list              # Accumulator for AIMessage + ToolMessages
    _tool_call_iterations: int  # Loop counter (max 5)

    # Set by tts
    audio_bytes: bytes          # Raw MP3, empty b"" if tools were used
```

---

## Service Initialization

All services are **singletons** created once at startup via `@lru_cache(maxsize=1)`:

```python
# app/core/ai_services.py
pipeline = get_voice_agent_pipeline()   # LLM + TTS
stt      = get_stt_service()            # Whisper STT
assess   = get_assessment_service()     # Azure Speech
```

---

## Source Files

| File | Purpose |
|------|---------|
| `app/agents/pipeline.py` | `VoiceAgentPipeline` â€” nodes, graph, routing |
| `app/agents/state.py` | `AgentState` TypedDict |
| `app/agents/output_models.py` | `AgentOutput` Pydantic model (structured mode) |
| `app/agents/tools/flashcard_tools.py` | LangChain tools exposed to the LLM |
| `app/agents/tool_steps.py` | Utilities for extracting tool step results |
| `app/core/ai_services.py` | Service factory + `run_langraph_agent()` wrapper |
| `app/services/groq_llm.py` | Groq LLM wrapper |
| `app/services/groq_stt.py` | Groq Whisper STT wrapper |
| `app/services/elevenlabs_tts.py` | ElevenLabs TTS wrapper |
| `app/services/azure_assessment.py` | Azure Speech pronunciation wrapper |
