# Azure Pronunciation Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone Azure pronunciation assessment service and `POST /api/assess` endpoint that evaluates speech pronunciation in scripted or unscripted mode.

**Architecture:** A class-based `AzureAssessmentService` (matching existing service patterns) wraps the Azure Cognitive Services Speech SDK. A `get_assessment_service()` factory in `ai_services.py` provides a cached singleton. A new authenticated `POST /api/assess` route calls the service and returns structured scores.

**Tech Stack:** `azure-cognitiveservices-speech` (already in requirements.txt), FastAPI, Pydantic, pytest + unittest.mock

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/api/schemas.py` | Modify | Add `WordResult` and `AssessmentResponse` |
| `app/services/azure_assessment.py` | Create | `AzureAssessmentService` class |
| `app/core/ai_services.py` | Modify | Add `get_assessment_service()` cached factory |
| `app/api/routes.py` | Modify | Add `POST /api/assess` route |
| `tests/test_api/test_schemas.py` | Modify | Tests for `WordResult`, `AssessmentResponse` |
| `tests/test_services/__init__.py` | Create | Empty, makes directory a package |
| `tests/test_services/test_azure_assessment.py` | Create | Tests for `AzureAssessmentService` |
| `tests/test_api/test_routes.py` | Modify | Tests for `POST /api/assess` |

---

## Task 1: Add Assessment Schemas

**Files:**
- Modify: `app/api/schemas.py`
- Modify: `tests/test_api/test_schemas.py`

- [ ] **Step 1: Write failing tests for `WordResult` and `AssessmentResponse`**

Append to `tests/test_api/test_schemas.py` (after all existing imports and existing tests):

```python
from app.api.schemas import AssessmentResponse, WordResult


# ---------------------------------------------------------------------------
# WordResult
# ---------------------------------------------------------------------------

class TestWordResult:
    def test_word_result_valid(self):
        w = WordResult(
            word="hello",
            accuracy_score=95.0,
            error_type="None",
            syllables=[],
            phonemes=[],
        )
        assert w.word == "hello"
        assert w.accuracy_score == 95.0
        assert w.error_type == "None"

    def test_word_result_with_syllables_and_phonemes(self):
        w = WordResult(
            word="hello",
            accuracy_score=80.0,
            error_type="Mispronunciation",
            syllables=[{"Syllable": "hɛ", "PronunciationAssessment": {"AccuracyScore": 70.0}}],
            phonemes=[{"Phoneme": "h", "PronunciationAssessment": {"AccuracyScore": 98.0}}],
        )
        assert len(w.syllables) == 1
        assert len(w.phonemes) == 1

    def test_word_result_missing_required_raises(self):
        with pytest.raises(ValidationError):
            WordResult(accuracy_score=90.0, error_type="None", syllables=[], phonemes=[])


# ---------------------------------------------------------------------------
# AssessmentResponse
# ---------------------------------------------------------------------------

class TestAssessmentResponse:
    def _word(self):
        return WordResult(word="hi", accuracy_score=90.0, error_type="None", syllables=[], phonemes=[])

    def test_assessment_response_unscripted(self):
        r = AssessmentResponse(
            mode="unscripted",
            recognized_text="Hello.",
            pron_score=91.5,
            accuracy_score=95.0,
            fluency_score=90.0,
            completeness_score=None,
            prosody_score=85.0,
            words=[self._word()],
        )
        assert r.mode == "unscripted"
        assert r.completeness_score is None
        assert r.prosody_score == 85.0

    def test_assessment_response_scripted_includes_completeness(self):
        r = AssessmentResponse(
            mode="scripted",
            recognized_text="Hello.",
            pron_score=91.5,
            accuracy_score=95.0,
            fluency_score=90.0,
            completeness_score=100.0,
            prosody_score=None,
            words=[],
        )
        assert r.completeness_score == 100.0
        assert r.prosody_score is None

    def test_assessment_response_missing_required_raises(self):
        with pytest.raises(ValidationError):
            AssessmentResponse(
                mode="unscripted",
                pron_score=91.5,
                accuracy_score=95.0,
                fluency_score=90.0,
                words=[],
            )
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pytest tests/test_api/test_schemas.py::TestWordResult tests/test_api/test_schemas.py::TestAssessmentResponse -v
```

Expected: `ImportError` — `WordResult` and `AssessmentResponse` don't exist yet.

- [ ] **Step 3: Add schemas to `app/api/schemas.py`**

Append after the last existing class in `app/api/schemas.py`:

```python
class WordResult(BaseModel):
    word: str
    accuracy_score: float
    error_type: str
    syllables: list[dict]
    phonemes: list[dict]


class AssessmentResponse(BaseModel):
    mode: str
    recognized_text: str
    pron_score: float
    accuracy_score: float
    fluency_score: float
    completeness_score: float | None
    prosody_score: float | None
    words: list[WordResult]
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pytest tests/test_api/test_schemas.py::TestWordResult tests/test_api/test_schemas.py::TestAssessmentResponse -v
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/schemas.py tests/test_api/test_schemas.py
git commit -m "feat: add WordResult and AssessmentResponse schemas"
```

---

## Task 2: Implement `AzureAssessmentService`

**Files:**
- Create: `tests/test_services/__init__.py`
- Create: `tests/test_services/test_azure_assessment.py`
- Create: `app/services/azure_assessment.py`
- Modify: `app/core/ai_services.py`

- [ ] **Step 1: Create the test package init file**

Create `tests/test_services/__init__.py` as an empty file.

- [ ] **Step 2: Write failing tests for `AzureAssessmentService`**

Create `tests/test_services/test_azure_assessment.py`:

```python
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
os.environ.setdefault("POSTGRES_PASSWORD", "test-password")
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
        with pytest.raises(ValueError, match="AZURE_SPEECH_KEY"):
            AzureAssessmentService()

    def test_raises_when_region_missing(self, monkeypatch):
        monkeypatch.setenv("AZURE_SPEECH_KEY", "key")
        monkeypatch.delenv("AZURE_SPEECH_REGION", raising=False)
        with pytest.raises(ValueError, match="AZURE_SPEECH_REGION"):
            AzureAssessmentService()

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
        # SpeechConfig is instantiated; its speech_recognition_language is set to "en-GB"
        sdk.SpeechConfig.return_value.__setattr__.call_args  # config was created
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
```

- [ ] **Step 3: Run tests to confirm they fail**

```
pytest tests/test_services/test_azure_assessment.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` — `azure_assessment.py` doesn't exist yet.

- [ ] **Step 4: Create `app/services/azure_assessment.py`**

```python
"""Azure Cognitive Services pronunciation assessment service."""

import json
import os

import azure.cognitiveservices.speech as speechsdk

from app.core.logger import logger


class AzureAssessmentService:
    """Evaluate speech pronunciation using Azure Cognitive Services Speech SDK.

    Supports scripted mode (reference text provided) and unscripted mode (free speech).
    Returns the raw NBest[0] dict from Azure augmented with 'mode' and 'display_text' keys.
    """

    def __init__(self, language: str = "en-US"):
        self._key = os.getenv("AZURE_SPEECH_KEY")
        self._region = os.getenv("AZURE_SPEECH_REGION")
        if not self._key:
            raise ValueError("AZURE_SPEECH_KEY is missing. Set it in your environment or .env file.")
        if not self._region:
            raise ValueError("AZURE_SPEECH_REGION is missing. Set it in your environment or .env file.")
        self.default_language = language
        logger.info("AzureAssessmentService ready language=%s region=%s", language, self._region)

    def assess(
        self,
        audio_bytes: bytes,
        reference_text: str | None = None,
        language: str | None = None,
        granularity: str = "Phoneme",
        enable_prosody: bool = True,
    ) -> dict:
        """Assess pronunciation of audio_bytes.

        Args:
            audio_bytes: Raw audio data (WAV, WebM, MP3, or any format Azure accepts).
            reference_text: Target sentence for scripted mode. Omit for unscripted mode.
            language: Locale override (e.g. "en-GB"). Defaults to self.default_language.
            granularity: "Phoneme" (default, full detail), "Word", or "FullText".
            enable_prosody: Enable prosody scoring. Only applied for en-US locale.

        Returns:
            dict — NBest[0] from Azure JSON response, plus "mode" and "display_text" keys.

        Raises:
            ValueError: audio_bytes is empty.
            RuntimeError: Azure did not recognize speech or cancelled the request.
        """
        if not audio_bytes:
            raise ValueError("audio_bytes must not be empty")

        locale = language or self.default_language
        is_scripted = bool(reference_text and reference_text.strip())
        mode = "scripted" if is_scripted else "unscripted"

        logger.info(
            "AzureAssessment assess start mode=%s locale=%s granularity=%s size=%d",
            mode, locale, granularity, len(audio_bytes),
        )

        # Wrap bytes in a push audio stream
        stream = speechsdk.audio.PushAudioInputStream()
        stream.write(audio_bytes)
        stream.close()
        audio_config = speechsdk.audio.AudioConfig(stream=stream)

        # Map granularity string to SDK enum
        granularity_map = {
            "Phoneme": speechsdk.PronunciationAssessmentGranularity.Phoneme,
            "Word": speechsdk.PronunciationAssessmentGranularity.Word,
            "FullText": speechsdk.PronunciationAssessmentGranularity.FullText,
        }
        gran = granularity_map.get(granularity, speechsdk.PronunciationAssessmentGranularity.Phoneme)

        pronunciation_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=reference_text.strip() if is_scripted else "",
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=gran,
            enable_miscue=is_scripted,
        )

        if enable_prosody and locale == "en-US":
            pronunciation_config.enable_prosody_assessment()
            logger.debug("AzureAssessment prosody enabled locale=%s", locale)

        speech_config = speechsdk.SpeechConfig(subscription=self._key, region=self._region)
        speech_config.speech_recognition_language = locale

        recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config,
            audio_config=audio_config,
        )
        pronunciation_config.apply_to(recognizer)

        result = recognizer.recognize_once()

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            json_str = result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
            data = json.loads(json_str)
            nbest = data.get("NBest", [])
            if not nbest:
                raise RuntimeError("Azure returned an empty NBest list")
            display_text = data.get("DisplayText", "")
            logger.info("AzureAssessment done mode=%s display_text=%r", mode, display_text[:80])
            return {"mode": mode, "display_text": display_text, **nbest[0]}

        if result.reason == speechsdk.ResultReason.NoMatch:
            logger.warning("AzureAssessment NoMatch locale=%s", locale)
            raise RuntimeError("Speech was not recognized. Please check audio quality and try again.")

        cancellation = speechsdk.CancellationDetails.from_result(result)
        logger.error(
            "AzureAssessment Canceled reason=%s error=%s",
            cancellation.reason, cancellation.error_details,
        )
        raise RuntimeError(f"Azure assessment cancelled: {cancellation.error_details}")
```

- [ ] **Step 5: Run tests to confirm they pass**

```
pytest tests/test_services/test_azure_assessment.py -v
```

Expected: All 13 tests PASS.

- [ ] **Step 6: Add `get_assessment_service()` to `app/core/ai_services.py`**

Add this function after `get_stt_service()` (after line 34):

```python
@lru_cache(maxsize=1)
def get_assessment_service():
    """Lazily initialize and cache the Azure pronunciation assessment service."""
    from app.services.azure_assessment import AzureAssessmentService

    language = os.getenv("AZURE_SPEECH_LANGUAGE", "en-US")
    logger.info("Initializing AzureAssessmentService language=%s", language)
    service = AzureAssessmentService(language=language)
    logger.info("AzureAssessmentService initialized and cached")
    return service
```

- [ ] **Step 7: Commit**

```bash
git add tests/test_services/__init__.py tests/test_services/test_azure_assessment.py app/services/azure_assessment.py app/core/ai_services.py
git commit -m "feat: implement AzureAssessmentService with scripted/unscripted mode support"
```

---

## Task 3: Add `POST /api/assess` Route

**Files:**
- Modify: `app/api/routes.py`
- Modify: `tests/test_api/test_routes.py`

- [ ] **Step 1: Write failing route tests**

Append to `tests/test_api/test_routes.py` (after all existing imports — `get_assessment_service` and the new schemas must be imported):

At the top of the existing import block in `test_routes.py`, add:
```python
from app.api.schemas import AssessmentResponse
```

Then append the following test class at the bottom of the file:

```python
# ===========================================================================
# POST /api/assess
# ===========================================================================

class TestAssessRoute:
    """Tests for POST /api/assess — pronunciation assessment endpoint."""

    def _headers(self, auth_headers):
        headers, _ = auth_headers()
        return headers

    def _mock_result(self, mode: str = "unscripted", include_completeness: bool = False):
        pron = {
            "AccuracyScore": 95.0,
            "FluencyScore": 90.0,
            "PronScore": 91.5,
            "ProsodyScore": 85.0,
        }
        if include_completeness:
            pron["CompletenessScore"] = 100.0
        return {
            "mode": mode,
            "display_text": "Hello.",
            "PronunciationAssessment": pron,
            "Words": [
                {
                    "Word": "hello",
                    "PronunciationAssessment": {"AccuracyScore": 95.0, "ErrorType": "None"},
                    "Syllables": [],
                    "Phonemes": [],
                }
            ],
        }

    def test_requires_auth(self, client):
        resp = client.post(
            "/api/assess",
            files={"audio_file": ("test.wav", b"fake-audio", "audio/wav")},
        )
        assert resp.status_code == 403

    def test_missing_audio_file_returns_422(self, client, auth_headers):
        resp = client.post("/api/assess", headers=self._headers(auth_headers))
        assert resp.status_code == 422

    def test_empty_audio_returns_400(self, client, auth_headers):
        with patch("app.api.routes.get_assessment_service") as mock_get:
            mock_get.return_value.assess.side_effect = ValueError("audio_bytes must not be empty")
            resp = client.post(
                "/api/assess",
                headers=self._headers(auth_headers),
                files={"audio_file": ("test.wav", b"", "audio/wav")},
            )
        assert resp.status_code == 400

    def test_unscripted_assess_returns_200(self, client, auth_headers):
        with patch("app.api.routes.get_assessment_service") as mock_get:
            mock_get.return_value.assess.return_value = self._mock_result("unscripted")
            resp = client.post(
                "/api/assess",
                headers=self._headers(auth_headers),
                files={"audio_file": ("test.wav", b"fake-audio-bytes", "audio/wav")},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "unscripted"
        assert data["pron_score"] == 91.5
        assert data["accuracy_score"] == 95.0
        assert data["fluency_score"] == 90.0
        assert data["completeness_score"] is None
        assert data["prosody_score"] == 85.0
        assert len(data["words"]) == 1
        assert data["words"][0]["word"] == "hello"

    def test_scripted_assess_returns_completeness_score(self, client, auth_headers):
        with patch("app.api.routes.get_assessment_service") as mock_get:
            mock_get.return_value.assess.return_value = self._mock_result(
                "scripted", include_completeness=True
            )
            resp = client.post(
                "/api/assess",
                headers=self._headers(auth_headers),
                data={"reference_text": "Hello"},
                files={"audio_file": ("test.wav", b"fake-audio-bytes", "audio/wav")},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "scripted"
        assert data["completeness_score"] == 100.0

    def test_assess_passes_reference_text_to_service(self, client, auth_headers):
        with patch("app.api.routes.get_assessment_service") as mock_get:
            mock_get.return_value.assess.return_value = self._mock_result("scripted", include_completeness=True)
            client.post(
                "/api/assess",
                headers=self._headers(auth_headers),
                data={"reference_text": "Good morning"},
                files={"audio_file": ("test.wav", b"fake-audio-bytes", "audio/wav")},
            )
        call_kwargs = mock_get.return_value.assess.call_args
        assert call_kwargs.kwargs["reference_text"] == "Good morning"

    def test_assess_passes_language_override_to_service(self, client, auth_headers):
        with patch("app.api.routes.get_assessment_service") as mock_get:
            mock_get.return_value.assess.return_value = self._mock_result()
            client.post(
                "/api/assess",
                headers=self._headers(auth_headers),
                data={"language": "en-GB"},
                files={"audio_file": ("test.wav", b"fake-audio-bytes", "audio/wav")},
            )
        call_kwargs = mock_get.return_value.assess.call_args
        assert call_kwargs.kwargs["language"] == "en-GB"

    def test_azure_runtime_error_returns_502(self, client, auth_headers):
        with patch("app.api.routes.get_assessment_service") as mock_get:
            mock_get.return_value.assess.side_effect = RuntimeError("Speech not recognized.")
            resp = client.post(
                "/api/assess",
                headers=self._headers(auth_headers),
                files={"audio_file": ("test.wav", b"fake-audio-bytes", "audio/wav")},
            )
        assert resp.status_code == 502
        assert "Speech not recognized" in resp.json()["detail"]
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pytest tests/test_api/test_routes.py::TestAssessRoute -v
```

Expected: All tests FAIL with 404 (route doesn't exist yet) or import errors.

- [ ] **Step 3: Add the route to `app/api/routes.py`**

At the top of `app/api/routes.py`, add the following to the existing imports:

```python
from app.core.ai_services import normalize_history, run_langraph_agent, transcribe_audio, get_assessment_service
from app.api.schemas import (
    AssessmentResponse,
    ChatResponse,
    ConversationListResponse,
    ConversationMessagesResponse,
    ConversationOut,
    LoginRequest,
    LoginResponse,
    MessageOut,
    RegisterRequest,
    UserOut,
    WordResult,
)
```

Then add the following route after the `chat_respond` function (before the Conversations section):

```python
# ---------------------------------------------------------------------------
# Pronunciation assessment
# ---------------------------------------------------------------------------

@router.post("/assess", response_model=AssessmentResponse)
def assess_pronunciation(
    audio_file: UploadFile = File(...),
    reference_text: str | None = Form(default=None),
    language: str | None = Form(default=None),
    user_id: str = Depends(get_current_user_id),
):
    """Evaluate pronunciation from uploaded audio.

    Pass reference_text for scripted (reading) mode.
    Omit reference_text for unscripted (free speech) mode.
    Pass language to override locale (default en-US, supports en-GB).
    """
    logger.info(
        "assess_pronunciation start user_id=%s mode=%s language=%s",
        user_id, "scripted" if reference_text else "unscripted", language,
    )

    audio_bytes = audio_file.file.read(_MAX_AUDIO_BYTES + 1)

    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file is empty",
        )
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Audio file exceeds 25 MB limit",
        )

    try:
        result = get_assessment_service().assess(
            audio_bytes=audio_bytes,
            reference_text=reference_text,
            language=language,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except RuntimeError as exc:
        logger.error("AzureAssessment failed user_id=%s error=%s", user_id, exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    pron = result.get("PronunciationAssessment", {})
    words = [
        WordResult(
            word=w.get("Word", ""),
            accuracy_score=w.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0),
            error_type=w.get("PronunciationAssessment", {}).get("ErrorType", "None"),
            syllables=w.get("Syllables", []),
            phonemes=w.get("Phonemes", []),
        )
        for w in result.get("Words", [])
    ]

    logger.info(
        "assess_pronunciation done user_id=%s mode=%s pron_score=%s recognized=%r",
        user_id, result.get("mode"), pron.get("PronScore"), result.get("display_text", "")[:80],
    )

    return AssessmentResponse(
        mode=result.get("mode", "unscripted"),
        recognized_text=result.get("display_text", ""),
        pron_score=pron.get("PronScore", 0.0),
        accuracy_score=pron.get("AccuracyScore", 0.0),
        fluency_score=pron.get("FluencyScore", 0.0),
        completeness_score=pron.get("CompletenessScore"),
        prosody_score=pron.get("ProsodyScore"),
        words=words,
    )
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pytest tests/test_api/test_routes.py::TestAssessRoute -v
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```
pytest -v
```

Expected: All existing tests PASS alongside the new tests.

- [ ] **Step 6: Commit**

```bash
git add app/api/routes.py tests/test_api/test_routes.py
git commit -m "feat: add POST /api/assess pronunciation assessment endpoint"
```
