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
