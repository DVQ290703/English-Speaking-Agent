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

    if "langchain_core.runnables" not in sys.modules:
        lc_run = types.ModuleType("langchain_core.runnables")
        lc_run.RunnableConfig = MagicMock
        sys.modules["langchain_core.runnables"] = lc_run

    if "langchain_core.tools" not in sys.modules:
        lc_tools = types.ModuleType("langchain_core.tools")

        def _tool_decorator(f):
            f.name = f.__name__
            return f

        lc_tools.tool = _tool_decorator
        sys.modules["langchain_core.tools"] = lc_tools

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

def _make_service():
    """Build a GroqLLMService with a mocked ChatGroq client."""
    service = GroqLLMService.__new__(GroqLLMService)
    service.model_name = "test-model"
    service.client = MagicMock()
    return service


def _make_chunk(content: str, usage=None):
    chunk = MagicMock()
    chunk.content = content
    chunk.usage_metadata = usage or {}
    return chunk


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestGenerateResponseStreaming:
    def test_uses_stream_not_invoke(self):
        service = _make_service()
        service.client.stream.return_value = iter([
            _make_chunk("Hello"),
            _make_chunk(" world", {"input_tokens": 5, "output_tokens": 3, "total_tokens": 8}),
        ])

        result = service.generate_response("Hi")

        assert result == "Hello world"
        service.client.stream.assert_called_once()
        service.client.invoke.assert_not_called()

    def test_concatenates_all_chunks(self):
        service = _make_service()
        service.client.stream.return_value = iter([
            _make_chunk("One"),
            _make_chunk(" two"),
            _make_chunk(" three"),
        ])

        result = service.generate_response("count")

        assert result == "One two three"

    def test_records_ttft_in_span_extra(self):
        service = _make_service()
        service.client.stream.return_value = iter([
            _make_chunk("Hi"),
            _make_chunk("!", {"input_tokens": 2, "output_tokens": 1, "total_tokens": 3}),
        ])

        with patch("app.core.metrics.record_span_metrics") as mock_record:
            service.generate_response("hello")

        assert mock_record.called
        extra = mock_record.call_args[0][4]
        assert "ttft_ms" in extra
        assert extra["ttft_ms"] > 0

    def test_ttft_is_none_if_all_chunks_empty(self):
        service = _make_service()
        service.client.stream.return_value = iter([
            _make_chunk(""),
            _make_chunk("", {"input_tokens": 1, "output_tokens": 0, "total_tokens": 1}),
        ])

        with patch("app.core.metrics.record_span_metrics") as mock_record:
            service.generate_response("hello")

        extra = mock_record.call_args[0][4]
        assert extra.get("ttft_ms") is None

    def test_token_counts_read_from_last_chunk(self):
        service = _make_service()
        service.client.stream.return_value = iter([
            _make_chunk("Hello"),
            _make_chunk(" world", {"input_tokens": 10, "output_tokens": 7, "total_tokens": 17}),
        ])

        with patch("app.core.metrics.record_span_metrics") as mock_record:
            service.generate_response("hi")

        extra = mock_record.call_args[0][4]
        assert extra.get("prompt_tokens") == 10
        assert extra.get("completion_tokens") == 7


class TestGenerateResponseWithGrammarStreaming:
    def test_uses_stream_not_invoke(self):
        service = _make_service()
        json_response = json.dumps({"response_text": "Nice job!", "grammar": {}})
        service.client.bind.return_value.stream.return_value = iter([
            _make_chunk(json_response),
        ])

        result_text, raw = service.generate_response_with_grammar("How are you?")

        assert result_text == "Nice job!"
        service.client.bind.return_value.stream.assert_called_once()
        service.client.bind.return_value.invoke.assert_not_called()

    def test_records_ttft_in_span_extra(self):
        service = _make_service()
        json_response = json.dumps({"response_text": "Good!"})
        service.client.bind.return_value.stream.return_value = iter([
            _make_chunk(json_response),
        ])

        with patch("app.core.metrics.record_span_metrics") as mock_record:
            service.generate_response_with_grammar("test")

        extra = mock_record.call_args[0][4]
        assert "ttft_ms" in extra
        assert extra["ttft_ms"] > 0

    def test_falls_back_to_plain_on_invalid_json(self):
        service = _make_service()
        # Grammar call returns broken JSON
        service.client.bind.return_value.stream.return_value = iter([
            _make_chunk("{broken json"),
        ])
        # Fallback generate_response uses stream too
        service.client.stream.return_value = iter([
            _make_chunk("Fallback response"),
        ])

        result_text, raw = service.generate_response_with_grammar("test")

        assert result_text == "Fallback response"
        assert raw is None


class TestStructuredClientInit:
    def test_structured_client_is_set_on_init(self):
        """GroqLLMService.__init__ sets structured_client via with_structured_output."""
        from app.agents.output_models import AgentOutput

        service = GroqLLMService(model_name="test-model")

        assert hasattr(service, "structured_client")
        service.client.with_structured_output.assert_called_once_with(
            AgentOutput, method="json_mode"
        )

    def test_structured_client_is_return_value_of_with_structured_output(self):
        """structured_client is the exact object returned by with_structured_output."""
        from app.agents.output_models import AgentOutput

        service = GroqLLMService(model_name="test-model")
        expected = service.client.with_structured_output.return_value

        assert service.structured_client is expected
