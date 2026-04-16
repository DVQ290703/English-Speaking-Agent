import io
import os

from groq import Groq


class GroqSTTService:
    """Transcribe audio bytes into text using Groq's speech API."""

    def __init__(self, model_name: str = "whisper-large-v3-turbo"):
        """Initialize the Groq client and selected transcription model."""
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY is missing. Set it in your environment or .env file.")

        self.client = Groq(api_key=api_key)
        self.model_name = model_name

    def transcribe_audio_bytes(self, audio_bytes: bytes, filename: str = "recording.wav") -> str:
        """Send in-memory audio to Groq and return the extracted transcript."""
        if not audio_bytes:
            return ""

        file_obj = io.BytesIO(audio_bytes)
        file_obj.name = filename

        # Use verbose JSON so timing and metadata can be consumed later if needed.
        transcription = self.client.audio.transcriptions.create(
            file=file_obj,
            model=self.model_name,
            response_format="verbose_json",
            temperature=0.0,
        )

        if hasattr(transcription, "text"):
            return transcription.text.strip()

        if isinstance(transcription, dict):
            return str(transcription.get("text", "")).strip()

        return ""

    def transcribe(self, audio_bytes: bytes, filename: str = "recording.wav") -> str:
        """Compatibility wrapper matching the interface expected by the API layer."""
        return self.transcribe_audio_bytes(audio_bytes, filename=filename)
