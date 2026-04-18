import logging
import os
import uuid
from pathlib import Path

import requests

logger = logging.getLogger(__name__)


class ElevenLabsTTS:
    """Generate speech audio from text using the ElevenLabs API."""

    def __init__(self, output_dir: str = "outputs"):
        """Create the output directory used to persist generated audio files."""
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def convert_text_to_speech(self, text: str) -> str:
        """Synthesize the provided text into speech and return the saved file path."""
        api_key = os.getenv("ELEVENLABS_API_KEY")
        voice_id = os.getenv("ELEVENLABS_VOICE_ID")
        model_id = os.getenv("ELEVENLABS_MODEL_ID", "eleven_flash_v2_5")

        if not api_key:
            logger.error("ElevenLabs: ELEVENLABS_API_KEY is not set")
            return ""
        if not voice_id:
            logger.error("ElevenLabs: ELEVENLABS_VOICE_ID is not set")
            return ""
        if not text.strip():
            return ""

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {
            "xi-api-key": api_key,
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
        }

        payload = {
            "text": text,
            "model_id": model_id,
        }

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=60)
        except requests.RequestException as exc:
            logger.error("ElevenLabs: request failed: %s", exc)
            return ""

        if response.status_code != 200:
            logger.error(
                "ElevenLabs: API returned %d for voice_id=%s model=%s — %s",
                response.status_code,
                voice_id,
                model_id,
                response.text[:200],
            )
            return ""

        # Persist audio locally so the API layer can stream or encode it later.
        audio_path = self.output_dir / f"tts_{uuid.uuid4().hex}.mp3"
        audio_path.write_bytes(response.content)
        logger.debug("ElevenLabs: wrote %d bytes → %s", len(response.content), audio_path)
        return str(audio_path)


# Backward-compatible alias for older imports.
ElevenLabsSTT = ElevenLabsTTS