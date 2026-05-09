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
