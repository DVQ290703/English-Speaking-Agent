# tests/test_services/test_azure_assessment.py
"""
Unit tests for app.services.azure_assessment.AzureAssessmentService
All Azure SDK calls are mocked — no real network or audio hardware required.
"""

import json
import os
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("AZURE_SPEECH_KEY", "test-azure-key")
os.environ.setdefault("AZURE_SPEECH_REGION", "eastus")

from app.services.azure_assessment import AzureAssessmentService

# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

_AZURE_JSON = json.dumps({
    "DisplayText": "Hello.",
    "NBest": [
        {
            "Confidence": 0.975,
            "Lexical": "hello",
            "Display": "Hello.",
            "PronunciationAssessment": {
                "AccuracyScore": 95.0,
                "FluencyScore": 90.0,
                "CompletenessScore": 100.0,
                "PronScore": 91.5,
                "ProsodyScore": 85.0,
            },
            "Words": [
                {
                    "Word": "hello",
                    "PronunciationAssessment": {"AccuracyScore": 95.0, "ErrorType": "None"},
                    "Syllables": [],
                    "Phonemes": [],
                }
            ],
        }
    ],
})


def _make_mock_sdk(reason: str = "RecognizedSpeech"):
    """Return (mock_sdk, mock_result, mock_recognizer) with the given ResultReason."""
    sdk = MagicMock()
    sdk.ResultReason.RecognizedSpeech = "RecognizedSpeech"
    sdk.ResultReason.NoMatch = "NoMatch"
    sdk.ResultReason.Canceled = "Canceled"
    sdk.PronunciationAssessmentGranularity.Phoneme = "Phoneme"
    sdk.PronunciationAssessmentGranularity.Word = "Word"
    sdk.PronunciationAssessmentGranularity.FullText = "FullText"
    sdk.PronunciationAssessmentGradingSystem.HundredMark = "HundredMark"
    sdk.PropertyId.SpeechServiceResponse_JsonResult = "SpeechServiceResponse_JsonResult"

    result = MagicMock()
    result.reason = reason
    result.properties.get.return_value = _AZURE_JSON

    recognizer = MagicMock()
    recognizer.recognize_once.return_value = result
    sdk.SpeechRecognizer.return_value = recognizer

    return sdk, result, recognizer


# ---------------------------------------------------------------------------
# Init tests
# ---------------------------------------------------------------------------

class TestAzureAssessmentServiceInit:
    def test_raises_when_key_missing(self, monkeypatch):
        monkeypatch.delenv("AZURE_SPEECH_KEY", raising=False)
        monkeypatch.delenv("AZURE_SUBSCRIPTION_ID", raising=False)
        with pytest.raises(ValueError, match="AZURE_SPEECH_KEY"):
            AzureAssessmentService()

    def test_raises_when_region_missing(self, monkeypatch):
        monkeypatch.setenv("AZURE_SPEECH_KEY", "key")
        monkeypatch.delenv("AZURE_SPEECH_REGION", raising=False)
        monkeypatch.delenv("AZURE_SERVICE_REGION", raising=False)
        with pytest.raises(ValueError, match="AZURE_SPEECH_REGION"):
            AzureAssessmentService()

    def test_legacy_env_names_still_work(self, monkeypatch):
        monkeypatch.delenv("AZURE_SPEECH_KEY", raising=False)
        monkeypatch.delenv("AZURE_SPEECH_REGION", raising=False)
        monkeypatch.setenv("AZURE_SUBSCRIPTION_ID", "legacy-key")
        monkeypatch.setenv("AZURE_SERVICE_REGION", "eastus")
        svc = AzureAssessmentService()
        assert svc.default_language == "en-US"

    def test_default_language_is_en_us(self, monkeypatch):
        monkeypatch.setenv("AZURE_SPEECH_KEY", "key")
        monkeypatch.setenv("AZURE_SPEECH_REGION", "eastus")
        svc = AzureAssessmentService()
        assert svc.default_language == "en-US"

    def test_custom_language_stored(self, monkeypatch):
        monkeypatch.setenv("AZURE_SPEECH_KEY", "key")
        monkeypatch.setenv("AZURE_SPEECH_REGION", "uksouth")
        svc = AzureAssessmentService(language="en-GB")
        assert svc.default_language == "en-GB"


# ---------------------------------------------------------------------------
# assess() tests
# ---------------------------------------------------------------------------

class TestAzureAssessmentServiceAssess:
    @pytest.fixture()
    def svc(self, monkeypatch):
        monkeypatch.setenv("AZURE_SPEECH_KEY", "test-key")
        monkeypatch.setenv("AZURE_SPEECH_REGION", "eastus")
        return AzureAssessmentService()

    def test_raises_on_empty_audio(self, svc):
        with pytest.raises(ValueError, match="empty"):
            svc.assess(b"")

    def test_unscripted_mode_when_no_reference_text(self, svc):
        sdk, _, _ = _make_mock_sdk("RecognizedSpeech")
        with patch("app.services.azure_assessment.speechsdk", sdk):
            result = svc.assess(b"audio-data")
        assert result["mode"] == "unscripted"

    def test_scripted_mode_when_reference_text_provided(self, svc):
        sdk, _, _ = _make_mock_sdk("RecognizedSpeech")
        with patch("app.services.azure_assessment.speechsdk", sdk):
            result = svc.assess(b"audio-data", reference_text="Hello")
        assert result["mode"] == "scripted"

    def test_result_contains_display_text(self, svc):
        sdk, _, _ = _make_mock_sdk("RecognizedSpeech")
        with patch("app.services.azure_assessment.speechsdk", sdk):
            result = svc.assess(b"audio-data")
        assert result["display_text"] == "Hello."

    def test_result_contains_pron_assessment(self, svc):
        sdk, _, _ = _make_mock_sdk("RecognizedSpeech")
        with patch("app.services.azure_assessment.speechsdk", sdk):
            result = svc.assess(b"audio-data")
        assert result["PronunciationAssessment"]["PronScore"] == 91.5

    def test_result_contains_words(self, svc):
        sdk, _, _ = _make_mock_sdk("RecognizedSpeech")
        with patch("app.services.azure_assessment.speechsdk", sdk):
            result = svc.assess(b"audio-data")
        assert len(result["Words"]) == 1
        assert result["Words"][0]["Word"] == "hello"

    def test_nomatch_raises_runtime_error(self, svc):
        sdk, _, _ = _make_mock_sdk("NoMatch")
        with patch("app.services.azure_assessment.speechsdk", sdk):
            with pytest.raises(RuntimeError, match="not recognized"):
                svc.assess(b"audio-data")

    def test_cancelled_raises_runtime_error(self, svc):
        sdk, mock_result, _ = _make_mock_sdk("Canceled")
        cancellation = MagicMock()
        cancellation.error_details = "AuthenticationFailure: invalid key"
        sdk.CancellationDetails.from_result.return_value = cancellation
        with patch("app.services.azure_assessment.speechsdk", sdk):
            with pytest.raises(RuntimeError, match="cancelled"):
                svc.assess(b"audio-data")

    def test_prosody_enabled_for_en_us(self, svc):
        sdk, _, _ = _make_mock_sdk("RecognizedSpeech")
        with patch("app.services.azure_assessment.speechsdk", sdk):
            svc.assess(b"audio-data", language="en-US", enable_prosody=True)
        sdk.PronunciationAssessmentConfig.return_value.enable_prosody_assessment.assert_called_once()

    def test_prosody_skipped_for_en_gb(self, svc):
        sdk, _, _ = _make_mock_sdk("RecognizedSpeech")
        with patch("app.services.azure_assessment.speechsdk", sdk):
            svc.assess(b"audio-data", language="en-GB", enable_prosody=True)
        sdk.PronunciationAssessmentConfig.return_value.enable_prosody_assessment.assert_not_called()

    def test_language_override_used_in_speech_config(self, svc):
        sdk, _, _ = _make_mock_sdk("RecognizedSpeech")
        with patch("app.services.azure_assessment.speechsdk", sdk):
            svc.assess(b"audio-data", language="en-GB")
        assert sdk.SpeechConfig.called

    def test_default_language_used_when_no_override(self, svc):
        sdk, _, _ = _make_mock_sdk("RecognizedSpeech")
        with patch("app.services.azure_assessment.speechsdk", sdk):
            svc.assess(b"audio-data")
        assert sdk.SpeechConfig.called

    def test_enable_miscue_true_for_scripted(self, svc):
        sdk, _, _ = _make_mock_sdk("RecognizedSpeech")
        with patch("app.services.azure_assessment.speechsdk", sdk):
            svc.assess(b"audio-data", reference_text="Hello")
        _, kwargs = sdk.PronunciationAssessmentConfig.call_args
        assert kwargs["enable_miscue"] is True

    def test_enable_miscue_false_for_unscripted(self, svc):
        sdk, _, _ = _make_mock_sdk("RecognizedSpeech")
        with patch("app.services.azure_assessment.speechsdk", sdk):
            svc.assess(b"audio-data")
        _, kwargs = sdk.PronunciationAssessmentConfig.call_args
        assert kwargs["enable_miscue"] is False
