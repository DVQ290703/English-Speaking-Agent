"""Tests for TTFT metric recording in record_span_metrics."""
import os
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")


class TestRecordSpanMetricsTTFT:
    def test_llm_span_with_ttft_observes_histogram(self):
        from unittest.mock import patch, MagicMock
        from app.core.metrics import record_span_metrics

        mock_labels = MagicMock()
        with patch("app.core.metrics.llm_ttft_seconds") as mock_hist:
            mock_hist.labels.return_value = mock_labels
            record_span_metrics(
                "llm.generate_response", "llm", 1500, "ok",
                {"model": "llama-3.3-70b-versatile", "ttft_ms": 250.0},
            )

        mock_hist.labels.assert_called_once_with(
            model="llama-3.3-70b-versatile", endpoint="llm.generate_response"
        )
        mock_labels.observe.assert_called_once_with(0.25)  # 250ms → 0.25s

    def test_llm_span_without_ttft_does_not_observe_histogram(self):
        from unittest.mock import patch
        from app.core.metrics import record_span_metrics

        with patch("app.core.metrics.llm_ttft_seconds") as mock_hist:
            record_span_metrics(
                "llm.generate_response", "llm", 1500, "ok",
                {"model": "llama-3.3-70b-versatile"},
            )

        mock_hist.labels.return_value.observe.assert_not_called()

    def test_llm_span_ttft_none_does_not_observe_histogram(self):
        from unittest.mock import patch
        from app.core.metrics import record_span_metrics

        with patch("app.core.metrics.llm_ttft_seconds") as mock_hist:
            record_span_metrics(
                "llm.generate_response", "llm", 1500, "ok",
                {"model": "test-model", "ttft_ms": None},
            )

        mock_hist.labels.return_value.observe.assert_not_called()

    def test_non_llm_span_does_not_touch_ttft_histogram(self):
        from unittest.mock import patch
        from app.core.metrics import record_span_metrics

        with patch("app.core.metrics.llm_ttft_seconds") as mock_hist:
            record_span_metrics(
                "stt.transcribe", "stt", 800, "ok",
                {"model": "whisper-large-v3-turbo", "ttft_ms": 100.0},
            )

        mock_hist.labels.assert_not_called()
