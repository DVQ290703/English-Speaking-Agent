"""Azure Cognitive Services pronunciation assessment service."""

from __future__ import annotations

import json
import os

from app.core.logger import logger

try:
    import azure.cognitiveservices.speech as speechsdk
except ModuleNotFoundError:
    speechsdk = None


class AzureAssessmentService:
    """Evaluate speech pronunciation using Azure Cognitive Services Speech SDK.

    Supports scripted mode (reference text provided) and unscripted mode (free speech).
    Returns the raw NBest[0] dict from Azure augmented with 'mode' and 'display_text' keys.
    """

    @staticmethod
    def _first_env_value(*keys: str) -> str:
        for key in keys:
            value = os.getenv(key, "").strip()
            if value:
                return value
        return ""

    def __init__(self, language: str = "en-US"):
        self._key = self._first_env_value("AZURE_SPEECH_KEY", "AZURE_SUBSCRIPTION_ID")
        self._region = self._first_env_value("AZURE_SPEECH_REGION", "AZURE_SERVICE_REGION")
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
        """Assess pronunciation of audio_bytes."""
        if not audio_bytes:
            raise ValueError("audio_bytes must not be empty")
        if speechsdk is None:
            raise RuntimeError(
                "azure-cognitiveservices-speech is not installed. "
                "Install dependencies from requirements.txt to enable pronunciation assessment."
            )

        locale = language or self.default_language
        is_scripted = bool(reference_text and reference_text.strip())
        mode = "scripted" if is_scripted else "unscripted"

        logger.info(
            "AzureAssessment assess start mode=%s locale=%s granularity=%s size=%d",
            mode, locale, granularity, len(audio_bytes),
        )

        stream = speechsdk.audio.PushAudioInputStream()
        try:
            stream.write(audio_bytes)
            stream.close()
            audio_config = speechsdk.audio.AudioConfig(stream=stream)

            granularity_map = {
                "Phoneme": speechsdk.PronunciationAssessmentGranularity.Phoneme,
                "Word": speechsdk.PronunciationAssessmentGranularity.Word,
                "FullText": speechsdk.PronunciationAssessmentGranularity.FullText,
            }
            gran = granularity_map.get(granularity)
            if gran is None:
                logger.warning("AzureAssessment unknown granularity=%r - falling back to Phoneme", granularity)
                gran = speechsdk.PronunciationAssessmentGranularity.Phoneme

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

            try:
                result = recognizer.recognize_once()
            finally:
                del recognizer
                del audio_config
                del speech_config
        finally:
            del stream

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            json_str = result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
            data = json.loads(json_str)
            nbest = data.get("NBest", [])
            if not nbest:
                raise RuntimeError("Azure returned an empty NBest list")
            display_text = data.get("DisplayText", "")
            logger.info("AzureAssessment done mode=%s display_text_length=%d", mode, len(display_text))
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
