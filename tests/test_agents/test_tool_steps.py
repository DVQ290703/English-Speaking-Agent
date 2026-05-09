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
