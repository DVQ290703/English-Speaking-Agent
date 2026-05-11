# tests/test_agents/test_pipeline_voice_accent.py
"""Tests that voice_accent is threaded through the pipeline into the TTS call."""

import os
import sys
import types
from unittest.mock import MagicMock, patch

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")

# Stub langchain_groq before any app import touches it
_lc_groq = types.ModuleType("langchain_groq")
_lc_groq.ChatGroq = MagicMock  # type: ignore[attr-defined]
sys.modules.setdefault("langchain_groq", _lc_groq)


class TestPipelineVoiceAccent:
    def _make_pipeline(self):
        from langchain_core.messages import AIMessage
        mock_llm = MagicMock()
        ai_msg = AIMessage(content="Hello!")
        mock_llm.client.invoke.return_value = ai_msg
        mock_llm.tool_client.invoke.return_value = ai_msg
        mock_llm.model_name = "test-model"
        mock_tts = MagicMock()
        mock_tts.convert_text_to_speech.return_value = b"mp3"

        from app.agents.pipeline import VoiceAgentPipeline
        pipeline = VoiceAgentPipeline.__new__(VoiceAgentPipeline)
        pipeline.llm_service = mock_llm
        pipeline.tts_service = mock_tts
        pipeline.app = pipeline._build_graph()
        return pipeline, mock_tts

    def test_voice_accent_uk_passed_to_tts(self):
        pipeline, mock_tts = self._make_pipeline()
        pipeline.run(user_input="Hi", voice_gender="female", voice_accent="uk")
        mock_tts.convert_text_to_speech.assert_called_once()
        _, kwargs = mock_tts.convert_text_to_speech.call_args
        assert kwargs.get("voice_accent") == "uk"

    def test_voice_accent_none_passed_to_tts(self):
        pipeline, mock_tts = self._make_pipeline()
        pipeline.run(user_input="Hi", voice_gender="male", voice_accent=None)
        mock_tts.convert_text_to_speech.assert_called_once()
        _, kwargs = mock_tts.convert_text_to_speech.call_args
        assert kwargs.get("voice_accent") is None
