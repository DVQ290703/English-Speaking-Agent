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


def _build_result_label(tool_name: str, raw_output: str) -> str:
    """Return a concise human-readable summary of a tool result."""
    try:
        data = json.loads(raw_output)
    except (json.JSONDecodeError, TypeError):
        return raw_output[:60] + "…" if len(raw_output) > 60 else raw_output

    if tool_name == "list_decks":
        if not isinstance(data, list):
            return "No decks"
        n = len(data)
        if n == 0:
            return "No decks yet"
        names = ", ".join(d.get("name", "?") for d in data[:3])
        suffix = f" +{n - 3} more" if n > 3 else ""
        return f"{n} deck{'s' if n != 1 else ''} · {names}{suffix}"

    if tool_name == "create_deck":
        if isinstance(data, dict) and "name" in data:
            return f"Deck \"{data['name']}\" created"
        return "Deck created"

    if tool_name == "create_card":
        if isinstance(data, dict):
            front = data.get("front_text", "")
            deck = data.get("deck_name", "")
            label = f"Card added"
            if front:
                label = f"\"{front[:40]}\" added"
            if deck:
                label += f" → {deck}"
            return label
        return "Card added"

    if tool_name == "update_card":
        if isinstance(data, dict) and "front_text" in data:
            return f"\"{data['front_text'][:40]}\" updated"
        return "Card updated"

    if tool_name == "search_cards":
        if not isinstance(data, list):
            return "No results"
        n = len(data)
        return f"{n} card{'s' if n != 1 else ''} found" if n > 0 else "No cards found"

    if tool_name == "get_due_cards":
        if not isinstance(data, list):
            return "No cards due"
        n = len(data)
        return f"{n} card{'s' if n != 1 else ''} due today" if n > 0 else "No cards due today"

    if tool_name == "submit_card_review":
        if isinstance(data, dict):
            interval = data.get("interval_days")
            if interval is not None:
                return f"Reviewed · next in {interval} day{'s' if interval != 1 else ''}"
        return "Review submitted"

    if tool_name == "get_deck_stats":
        if isinstance(data, dict):
            total = data.get("total_cards", 0)
            due = data.get("due_today", 0)
            retention = data.get("retention_rate", 0)
            return f"{total} cards · {due} due · {round(retention * 100)}% retention"
        return "Stats loaded"

    # Fallback: show first 60 chars of raw output
    flat = raw_output.replace("\n", " ")
    return flat[:60] + "…" if len(flat) > 60 else flat


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
                result_label = _build_result_label(tool_name, raw_output)
            else:
                status = "failed"
                output_summary = ""
                result_label = ""

            steps.append(
                ToolCallStep(
                    tool_name=tool_name,
                    input_summary=input_summary,
                    output_summary=output_summary,
                    result_label=result_label,
                    status=status,  # type: ignore[arg-type]
                )
            )

    return steps
