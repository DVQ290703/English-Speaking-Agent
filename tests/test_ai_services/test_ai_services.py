# tests/test_ai_services/test_ai_services.py
"""
Unit tests for app.core.ai_services
Covers: normalize_history, transcribe_audio, run_langraph_agent,
        _synthesize_audio_bytes, get_voice_agent_pipeline (cache),
        get_stt_service (cache)
"""

import json
import os
from unittest.mock import MagicMock, patch, call

import pytest

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")


# ---------------------------------------------------------------------------
# normalize_history
# ---------------------------------------------------------------------------

class TestNormalizeHistory:
    def _call(self, history_raw, topic=None):
        # Import here to avoid module-level side effects
        from app.core.ai_services import normalize_history
        return normalize_history(history_raw=history_raw, topic=topic)

    def test_normalize_history_no_history_no_topic_returns_empty(self):
        result = self._call(None, topic=None)
        assert result == []

    def test_normalize_history_topic_only_returns_topic_line(self):
        result = self._call(None, topic="IELTS Part 1")
        assert result == ["Topic: IELTS Part 1"]

    def test_normalize_history_topic_whitespace_stripped(self):
        result = self._call(None, topic="  Daily  ")
        assert result == ["Topic: Daily"]

    def test_normalize_history_blank_topic_not_added(self):
        result = self._call(None, topic="   ")
        assert result == []

    def test_normalize_history_valid_json_list_of_dicts(self):
        history = json.dumps([
            {"role": "user", "text": "Hello"},
            {"role": "assistant", "text": "Hi there"},
        ])
        result = self._call(history, topic=None)
        assert "User: Hello" in result
        assert "Assistant: Hi there" in result

    def test_normalize_history_prepends_topic_before_messages(self):
        history = json.dumps([{"role": "user", "text": "Hello"}])
        result = self._call(history, topic="Travel")
        assert result[0] == "Topic: Travel"
        assert "User: Hello" in result

    def test_normalize_history_invalid_json_returns_topic_only(self):
        result = self._call("not valid json {{", topic="Travel")
        assert result == ["Topic: Travel"]

    def test_normalize_history_non_list_json_returns_topic_only(self):
        result = self._call(json.dumps({"key": "value"}), topic="Travel")
        assert result == ["Topic: Travel"]

    def test_normalize_history_limits_to_last_10_items(self):
        items = [{"role": "user", "text": f"msg {i}"} for i in range(20)]
        history = json.dumps(items)
        result = self._call(history, topic=None)
        # 10 items → 10 lines
        assert len(result) == 10

    def test_normalize_history_skips_dict_with_empty_text(self):
        history = json.dumps([
            {"role": "user", "text": ""},
            {"role": "assistant", "text": "Valid reply"},
        ])
        result = self._call(history, topic=None)
        assert "User: " not in result
        assert "Assistant: Valid reply" in result

    def test_normalize_history_string_items_included(self):
        history = json.dumps(["User: hi", "Assistant: hello"])
        result = self._call(history, topic=None)
        assert "User: hi" in result
        assert "Assistant: hello" in result

    def test_normalize_history_empty_string_items_skipped(self):
        history = json.dumps(["", "  ", "User: hello"])
        result = self._call(history, topic=None)
        assert "" not in result
        assert "User: hello" in result


# ---------------------------------------------------------------------------
# transcribe_audio
# ---------------------------------------------------------------------------

class TestTranscribeAudio:
    def test_transcribe_audio_happy_path(self):
        mock_stt = MagicMock()
        mock_stt.transcribe.return_value = "Hello world"

        with patch("app.core.ai_services.get_stt_service", return_value=mock_stt):
            from app.core.ai_services import transcribe_audio
            result = transcribe_audio(b"fake-audio-bytes", filename="test.webm")

        assert result == "Hello world"

    def test_transcribe_audio_stt_exception_returns_empty_string(self):
        mock_stt = MagicMock()
        mock_stt.transcribe.side_effect = RuntimeError("STT down")

        with patch("app.core.ai_services.get_stt_service", return_value=mock_stt):
            from app.core.ai_services import transcribe_audio
            result = transcribe_audio(b"audio", filename="test.webm")

        assert result == ""

    def test_transcribe_audio_passes_filename_to_stt(self):
        mock_stt = MagicMock()
        mock_stt.transcribe.return_value = "transcript"

        with patch("app.core.ai_services.get_stt_service", return_value=mock_stt):
            from app.core.ai_services import transcribe_audio
            transcribe_audio(b"audio", filename="recording.mp3")

        mock_stt.transcribe.assert_called_once_with(b"audio", filename="recording.mp3")


# ---------------------------------------------------------------------------
# _synthesize_audio_bytes
# ---------------------------------------------------------------------------

class TestSynthesizeAudioBytes:
    def test_synthesize_returns_bytes_on_success(self):
        mock_pipeline = MagicMock()
        mock_pipeline.tts_service.convert_text_to_speech.return_value = b"mp3data"

        with patch("app.core.ai_services.get_voice_agent_pipeline", return_value=mock_pipeline):
            from app.core.ai_services import _synthesize_audio_bytes
            result = _synthesize_audio_bytes("Hello")

        assert result == b"mp3data"

    def test_synthesize_returns_empty_bytes_on_exception(self):
        mock_pipeline = MagicMock()
        mock_pipeline.tts_service.convert_text_to_speech.side_effect = RuntimeError("TTS down")

        with patch("app.core.ai_services.get_voice_agent_pipeline", return_value=mock_pipeline):
            from app.core.ai_services import _synthesize_audio_bytes
            result = _synthesize_audio_bytes("Hello")

        assert result == b""

    def test_synthesize_returns_empty_bytes_when_tts_returns_none(self):
        mock_pipeline = MagicMock()
        mock_pipeline.tts_service.convert_text_to_speech.return_value = None

        with patch("app.core.ai_services.get_voice_agent_pipeline", return_value=mock_pipeline):
            from app.core.ai_services import _synthesize_audio_bytes
            result = _synthesize_audio_bytes("Hello")

        assert result == b""

    def test_synthesize_returns_empty_bytes_when_tts_returns_empty_bytes(self):
        mock_pipeline = MagicMock()
        mock_pipeline.tts_service.convert_text_to_speech.return_value = b""

        with patch("app.core.ai_services.get_voice_agent_pipeline", return_value=mock_pipeline):
            from app.core.ai_services import _synthesize_audio_bytes
            result = _synthesize_audio_bytes("Hello")

        assert result == b""


# ---------------------------------------------------------------------------
# run_langraph_agent
# ---------------------------------------------------------------------------

class TestRunLangraphAgent:
    def _mock_pipeline(self, response_text="Great answer!", audio_bytes=b"mp3"):
        mock_pipeline = MagicMock()
        mock_pipeline.run.return_value = {
            "response_text": response_text,
            "audio_bytes": audio_bytes,
        }
        return mock_pipeline

    def test_run_langraph_agent_happy_path(self):
        mock_pipeline = self._mock_pipeline("Great answer!", b"mp3data")

        with patch("app.core.ai_services.get_voice_agent_pipeline", return_value=mock_pipeline):
            from app.core.ai_services import run_langraph_agent
            text, audio = run_langraph_agent("Tell me about IELTS", history=[])

        assert text == "Great answer!"
        assert audio == b"mp3data"

    def test_run_langraph_agent_passes_history(self):
        mock_pipeline = self._mock_pipeline()
        history = ["Topic: IELTS", "User: Hello"]

        with patch("app.core.ai_services.get_voice_agent_pipeline", return_value=mock_pipeline):
            from app.core.ai_services import run_langraph_agent
            run_langraph_agent("Next question", history=history)

        mock_pipeline.run.assert_called_once_with(
            user_input="Next question", history=history
        )

    def test_run_langraph_agent_none_history_defaults_to_empty(self):
        mock_pipeline = self._mock_pipeline()

        with patch("app.core.ai_services.get_voice_agent_pipeline", return_value=mock_pipeline):
            from app.core.ai_services import run_langraph_agent
            run_langraph_agent("Hello", history=None)

        mock_pipeline.run.assert_called_once_with(user_input="Hello", history=[])

    def test_run_langraph_agent_empty_response_text_returns_fallback(self):
        mock_pipeline = MagicMock()
        mock_pipeline.run.return_value = {"response_text": "", "audio_bytes": b""}

        mock_tts_pipeline = MagicMock()
        mock_tts_pipeline.tts_service.convert_text_to_speech.return_value = b"fallback-audio"

        with (
            patch("app.core.ai_services.get_voice_agent_pipeline", return_value=mock_pipeline),
            patch("app.core.ai_services._synthesize_audio_bytes", return_value=b"fallback-audio"),
        ):
            from app.core.ai_services import run_langraph_agent
            text, audio = run_langraph_agent("test")

        assert "Sorry" in text
        assert audio == b"fallback-audio"

    def test_run_langraph_agent_pipeline_exception_returns_fallback(self):
        mock_pipeline = MagicMock()
        mock_pipeline.run.side_effect = RuntimeError("LLM crashed")

        with (
            patch("app.core.ai_services.get_voice_agent_pipeline", return_value=mock_pipeline),
            patch("app.core.ai_services._synthesize_audio_bytes", return_value=b"fallback"),
        ):
            from app.core.ai_services import run_langraph_agent
            text, audio = run_langraph_agent("test")

        assert "Sorry" in text
        assert audio == b"fallback"

    def test_run_langraph_agent_text_no_audio_retries_tts(self):
        """When pipeline returns text but empty audio, _synthesize_audio_bytes is called."""
        mock_pipeline = MagicMock()
        mock_pipeline.run.return_value = {"response_text": "Nice job!", "audio_bytes": b""}

        with (
            patch("app.core.ai_services.get_voice_agent_pipeline", return_value=mock_pipeline),
            patch("app.core.ai_services._synthesize_audio_bytes", return_value=b"retry-audio") as mock_synth,
        ):
            from app.core.ai_services import run_langraph_agent
            text, audio = run_langraph_agent("question")

        mock_synth.assert_called_once_with("Nice job!")
        assert text == "Nice job!"
        assert audio == b"retry-audio"
