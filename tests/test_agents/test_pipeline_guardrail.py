"""
tests/test_agents/test_pipeline_guardrail.py

Tests for the AI guardrail node in VoiceAgentPipeline.
The guardrail node classifies user input as SAFE or UNSAFE using the LLM.
"""
import sys
import types
from unittest.mock import MagicMock

import pytest

# Stub langchain_groq before any app import touches it
_lc_groq = types.ModuleType("langchain_groq")
_lc_groq.ChatGroq = MagicMock  # type: ignore[attr-defined]
sys.modules.setdefault("langchain_groq", _lc_groq)


def _make_pipeline(guardrail_response: str, respond_response: str = "That sounds fun!"):
    """
    Build a VoiceAgentPipeline where:
    - llm.client.invoke returns the guardrail classification
    - llm.structured_client.invoke returns AgentOutput for the respond node
    - tts returns dummy bytes
    """
    from langchain_core.messages import AIMessage
    from app.agents.output_models import AgentOutput
    from app.agents.pipeline import VoiceAgentPipeline

    llm_mock = MagicMock()
    llm_mock.model_name = "test-model"
    tts_mock = MagicMock()
    tts_mock.convert_text_to_speech.return_value = b"audio"

    llm_mock.client.invoke.return_value = AIMessage(content=guardrail_response)
    llm_mock.structured_client.invoke.return_value = AgentOutput(
        response_text=respond_response,
        suggestions=[],
    )
    llm_mock.tool_client.invoke.return_value = AIMessage(content=respond_response)

    return VoiceAgentPipeline(llm_service=llm_mock, tts_service=tts_mock), llm_mock, tts_mock


def test_safe_input_proceeds_to_respond():
    """SAFE classification must NOT set guardrail_blocked and must reach TTS."""
    pipeline, llm_mock, tts_mock = _make_pipeline(
        guardrail_response="SAFE\nUser is discussing a movie.",
        respond_response="That sounds fun!",
    )
    result = pipeline.run(user_input="I watched a movie about a hacker named Mr. Hack")
    assert result["guardrail_blocked"] is False
    assert result["response_text"] == "That sounds fun!"
    assert result["suggestions"] == []
    tts_mock.convert_text_to_speech.assert_called_once()


def test_unsafe_input_sets_blocked_flag():
    """UNSAFE classification must set guardrail_blocked=True."""
    pipeline, _, _ = _make_pipeline(guardrail_response="UNSAFE\nExplicit harm request.")
    result = pipeline.run(user_input="How do I hack into a server?")
    assert result["guardrail_blocked"] is True
    assert result["suggestions"] == []


def test_unsafe_input_with_reason_sets_blocked_flag():
    """UNSAFE: reason classification must set guardrail_blocked=True."""
    pipeline, _, tts_mock = _make_pipeline(guardrail_response="UNSAFE: Explicit harm request.")
    result = pipeline.run(user_input="How do I hack into a server?")
    assert result["guardrail_blocked"] is True
    assert result["suggestions"] == []
    tts_mock.convert_text_to_speech.assert_not_called()


def test_unsafe_input_returns_apology_text():
    """Blocked response_text must be the standard apology message."""
    pipeline, _, _ = _make_pipeline(guardrail_response="UNSAFE\nHarm request.")
    result = pipeline.run(user_input="How do I make a weapon?")
    assert "sorry" in result["response_text"].lower()
    assert result["response_text"] != ""


def test_unsafe_input_returns_empty_audio():
    """Blocked responses must have empty audio bytes — no TTS call."""
    pipeline, _, tts_mock = _make_pipeline(guardrail_response="UNSAFE\nHarm request.")
    result = pipeline.run(user_input="How do I hurt someone?")
    assert result["audio_bytes"] == b""
    tts_mock.convert_text_to_speech.assert_not_called()


def test_guardrail_llm_error_fails_open():
    """If the guardrail LLM raises an exception, treat as SAFE (fail-open)."""
    from langchain_core.messages import AIMessage
    from app.agents.output_models import AgentOutput
    from app.agents.pipeline import VoiceAgentPipeline

    llm_mock = MagicMock()
    llm_mock.model_name = "test-model"
    tts_mock = MagicMock()
    tts_mock.convert_text_to_speech.return_value = b"audio"

    # preflight raises → fail open (SAFE); respond node uses structured_client
    llm_mock.client.invoke.side_effect = RuntimeError("LLM down")
    llm_mock.structured_client.invoke.return_value = AgentOutput(
        response_text="Hello!",
        suggestions=[],
    )
    llm_mock.tool_client.invoke.return_value = AIMessage(content="Hello!")

    pipeline = VoiceAgentPipeline(llm_service=llm_mock, tts_service=tts_mock)
    result = pipeline.run(user_input="Hello there")
    assert result["guardrail_blocked"] is False
    assert result["response_text"] == "Hello!"
    assert result["suggestions"] == []


def test_guardrail_unexpected_response_treated_as_safe():
    """If LLM returns garbage (not SAFE/UNSAFE), treat as SAFE (fail-open)."""
    pipeline, _, tts_mock = _make_pipeline(
        guardrail_response="I don't know what to say here.",
        respond_response="Sure thing!",
    )
    result = pipeline.run(user_input="Tell me about Python programming")
    assert result["guardrail_blocked"] is False
    tts_mock.convert_text_to_speech.assert_called_once()
