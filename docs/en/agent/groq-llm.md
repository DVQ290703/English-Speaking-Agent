# Groq LLM Service

Powers the `preflight` and `respond` nodes of the LangGraph pipeline.

**Source:** `app/services/groq_llm.py`
**Model:** `llama-3.3-70b-versatile` (default)
**Provider:** [Groq](https://console.groq.com) via `langchain_groq.ChatGroq`

---

## Configuration

| Env Var | Required | Default | Description |
|---------|----------|---------|-------------|
| `GROQ_API_KEY` | Yes | — | Groq API key. Raises `ValueError` on startup if missing. |
| `GROQ_LLM_MODEL` | No | `llama-3.3-70b-versatile` | LLM model name. Any Groq-supported chat model works. |

---

## How It's Used

The service is initialized once via `get_voice_agent_pipeline()` in `app/core/ai_services.py`:

```python
llm_service = GroqLLMService(model_name=os.getenv("GROQ_LLM_MODEL", "llama-3.3-70b-versatile"))
```

`ChatGroq` is created with `temperature=0.2` for consistent, low-variance responses.

---

## `generate_response()`

```python
def generate_response(
    user_input: str,
    history: list[str] | None = None,
) -> str
```

Builds a message list and invokes the LLM:

1. **SystemMessage** — IELTS speaking coach persona with topic context injected if found in history
2. **History** — up to the last **8 lines** of conversation (alternating HumanMessage / AIMessage)
3. **HumanMessage** — current `user_input`

Returns the LLM's string response.

---

## Pipeline Usage

The `respond` node uses the LLM in three modes depending on state:

| Mode | When | How |
|------|------|-----|
| **Tool client** | `tool_intent=True`, `user_id` set, iterations < 5 | `llm.bind_tools(FLASHCARD_TOOLS)` — LLM can emit `tool_calls` |
| **Structured client** | Tools disabled | `llm.with_structured_output(AgentOutput)` — returns Pydantic model |
| **Plain client** | Fallback | Raw `llm.invoke()` — returns string |

The `preflight` node always uses the plain client for speed.

---

## Grammar Feedback

When using the **structured client**, the LLM is prompted to include a `<grammar>` XML tag in its response. The `respond` node strips and parses this tag into `grammar_raw` (a JSON string), which is later stored in the `grammar_feedback` DB table.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `GROQ_API_KEY` missing | `ValueError` raised at startup — service won't initialize |
| LLM call fails | Exception caught in `run_langraph_agent()` → fallback text returned, empty audio |
| `preflight` fails | Fails **open** — input treated as safe, `tool_intent` set to false |

---

## Changing the Model

Set `GROQ_LLM_MODEL` to any Groq-supported chat model:

```bash
GROQ_LLM_MODEL=llama-3.1-8b-instant   # Faster, cheaper, less capable
GROQ_LLM_MODEL=llama-3.3-70b-versatile  # Default — balanced
```

See [Groq model docs](https://console.groq.com/docs/models) for available options.
