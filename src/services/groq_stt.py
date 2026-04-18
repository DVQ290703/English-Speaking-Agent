import io
import logging
import os

from groq import Groq

logger = logging.getLogger(__name__)


class GroqSTTService:
    """Transcribe audio bytes into text using Groq's speech API."""

    def __init__(self, model_name: str = "whisper-large-v3-turbo"):
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY is missing. Set it in your environment or .env file.")

        self.client = Groq(api_key=api_key)
        self.model_name = model_name
        logger.info("GroqSTTService ready model=%s", self.model_name)

    def transcribe(self, audio_bytes: bytes, filename: str = "recording.wav") -> str:
        """Send in-memory audio to Groq and return the extracted transcript."""
        if not audio_bytes:
            logger.warning("GroqSTT: transcribe called with empty audio bytes")
            return ""

        logger.info("GroqSTT transcribe start filename=%r size=%d bytes model=%s", filename, len(audio_bytes), self.model_name)

        file_obj = io.BytesIO(audio_bytes)
        file_obj.name = filename

        transcription = self.client.audio.transcriptions.create(
            file=file_obj,
            model=self.model_name,
            response_format="verbose_json",
            temperature=0.0,
        )

        if hasattr(transcription, "text"):
            result = transcription.text.strip()
        elif isinstance(transcription, dict):
            result = str(transcription.get("text", "")).strip()
        else:
            logger.warning("GroqSTT: unexpected response type %s", type(transcription).__name__)
            result = ""

        logger.info("GroqSTT transcribe done transcript=%r (len=%d)", result[:80], len(result))
        return result
