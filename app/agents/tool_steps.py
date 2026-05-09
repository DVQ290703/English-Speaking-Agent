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
