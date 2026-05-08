"""Tests for GroqLLMService streaming with TTFT recording."""
import os
import sys
import types
import json
from unittest.mock import MagicMock, patch

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")

# ---------------------------------------------------------------------------
# Stub langchain packages so groq_llm.py can be imported without them
# ---------------------------------------------------------------------------

def _stub_langchain():
    if "langchain_core" not in sys.modules:
        lc_core = types.ModuleType("langchain_core")
        lc_msgs = types.ModuleType("langchain_core.messages")

        class _Msg:
            def __init__(self, content="", **kw):
                self.content = content
                for k, v in kw.items():
                    setattr(self, k, v)

        class AIMessage(_Msg): pass
        class HumanMessage(_Msg): pass
        class SystemMessage(_Msg): pass

        lc_msgs.AIMessage = AIMessage
        lc_msgs.HumanMessage = HumanMessage
        lc_msgs.SystemMessage = SystemMessage
        lc_core.messages = lc_msgs
        sys.modules["langchain_core"] = lc_core
        sys.modules["langchain_core.messages"] = lc_msgs

    if "langchain_groq" not in sys.modules:
        lg = types.ModuleType("langchain_groq")
        lg.ChatGroq = MagicMock
        sys.modules["langchain_groq"] = lg


_stub_langchain()

# Force a fresh import of groq_llm after stubs are in place
sys.modules.pop("app.services.groq_llm", None)
import app.services.groq_llm as _groq_llm_mod  # noqa: E402
from app.services.groq_llm import GroqLLMService  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_chunk(content: str, input_tokens=None, output_tokens=None):
    chunk = MagicMock()
    chunk.content = content
    if input_tokens is not None:
        chunk.usage_metadata = {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
        }
    else:
        chunk.usage_metadata = None
    return chunk


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestGroqLLMStreaming:
    """generate_response uses .stream() and records ttft_ms on span."""

    def _make_service(self, mock_client):
        """Create a GroqLLMService with the ChatGroq client already replaced."""
        svc = GroqLLMService.__new__(GroqLLMService)
        svc.model_name = "llama-3.3-70b-versatile"
        svc.client = mock_client
        return svc

    def test_generate_response_uses_stream(self):
        """generate_response calls .stream() not .invoke()."""
        mock_client = MagicMock()
        mock_client.stream.return_value = iter([
            _make_chunk("Hello"),
            _make_chunk(" world", input_tokens=10, output_tokens=5),
        ])
        svc = self._make_service(mock_client)
        result = svc.generate_response("Hi")

        mock_client.stream.assert_called_once()
        assert result == "Hello world"

    def test_generate_response_does_not_call_invoke(self):
        """generate_response must not call .invoke()."""
        mock_client = MagicMock()
        mock_client.stream.return_value = iter([
            _make_chunk("Hi there", input_tokens=8, output_tokens=3),
        ])
        svc = self._make_service(mock_client)
        svc.generate_response("Hey")

        mock_client.invoke.assert_not_called()

    def test_generate_response_sets_ttft_ms_on_span(self):
        """span.set receives ttft_ms as a non-negative float."""
        mock_client = MagicMock()
        mock_client.stream.return_value = iter([
            _make_chunk("first"),
            _make_chunk(" second", input_tokens=8, output_tokens=4),
        ])
        svc = self._make_service(mock_client)

        captured_extra = {}

        def fake_span_set(**kwargs):
            captured_extra.update(kwargs)

        with patch.object(_groq_llm_mod, "span_context") as mock_ctx:
            fake_span = MagicMock()
            fake_span.set.side_effect = fake_span_set
            mock_ctx.return_value.__enter__ = MagicMock(return_value=fake_span)
            mock_ctx.return_value.__exit__ = MagicMock(return_value=False)
            svc.generate_response("Hello")

        assert "ttft_ms" in captured_extra
        assert isinstance(captured_extra["ttft_ms"], float)
        assert captured_extra["ttft_ms"] >= 0.0

    def test_generate_response_concatenates_all_chunks(self):
        """All chunk contents are joined into the final response."""
        mock_client = MagicMock()
        mock_client.stream.return_value = iter([
            _make_chunk("Part1 "),
            _make_chunk("Part2 "),
            _make_chunk("Part3", input_tokens=12, output_tokens=6),
        ])
        svc = self._make_service(mock_client)
        result = svc.generate_response("Multi-part response please")

        assert result == "Part1 Part2 Part3"

    def test_generate_response_records_token_usage_from_last_chunk(self):
        """Token counts from the last chunk's usage_metadata are passed to span.set."""
        mock_client = MagicMock()
        mock_client.stream.return_value = iter([
            _make_chunk("hi"),
            _make_chunk(" there", input_tokens=42, output_tokens=7),
        ])
        svc = self._make_service(mock_client)

        captured_extra = {}

        def fake_span_set(**kwargs):
            captured_extra.update(kwargs)

        with patch.object(_groq_llm_mod, "span_context") as mock_ctx:
            fake_span = MagicMock()
            fake_span.set.side_effect = fake_span_set
            mock_ctx.return_value.__enter__ = MagicMock(return_value=fake_span)
            mock_ctx.return_value.__exit__ = MagicMock(return_value=False)
            svc.generate_response("test")

        assert captured_extra.get("prompt_tokens") == 42
        assert captured_extra.get("completion_tokens") == 7

    def test_generate_response_with_grammar_still_uses_invoke(self):
        """generate_response_with_grammar keeps using .invoke() (JSON mode)."""
        mock_client = MagicMock()
        json_client = MagicMock()
        mock_client.bind.return_value = json_client

        # The response must be an instance of the AIMessage stub loaded in the module
        AIMessage = sys.modules["langchain_core.messages"].AIMessage
        fake_response = AIMessage(content=json.dumps({
            "response_text": "Great job!",
            "grammar": {},
        }))
        fake_response.usage_metadata = {
            "input_tokens": 10,
            "output_tokens": 5,
            "total_tokens": 15,
        }
        json_client.invoke.return_value = fake_response

        svc = self._make_service(mock_client)
        text, raw = svc.generate_response_with_grammar("Hello")

        json_client.invoke.assert_called_once()
        assert text == "Great job!"
