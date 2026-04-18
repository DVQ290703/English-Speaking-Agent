"""ElevenLabs text-to-speech service.

Returns raw audio bytes directly from the API — no temp files written to disk.
"""

import logging
import os

import requests

logger = logging.getLogger(__name__)


class ElevenLabsTTS:
    """Generate MP3 audio from text using the ElevenLabs API."""

    def convert_text_to_speech(self, text: str) -> bytes:
        """Synthesize *text* and return raw MP3 bytes (empty bytes on any failure)."""
        api_key = os.getenv("ELEVENLABS_API_KEY")
        voice_id = os.getenv("ELEVENLABS_VOICE_ID")
        model_id = os.getenv("ELEVENLABS_MODEL_ID", "eleven_flash_v2_5")

        if not api_key:
            logger.error("ElevenLabs: ELEVENLABS_API_KEY is not set — cannot synthesize audio")
            return b""
        if not voice_id:
            logger.error("ElevenLabs: ELEVENLABS_VOICE_ID is not set — cannot synthesize audio")
            return b""
        if not text.strip():
            logger.debug("ElevenLabs: empty text provided, skipping synthesis")
            return b""

        logger.info("ElevenLabs TTS request voice_id=%s model_id=%s text_len=%d", voice_id, model_id, len(text))

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {
            "xi-api-key": api_key,
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
        }
        payload = {"text": text, "model_id": model_id}

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=60)
        except requests.RequestException as exc:
            logger.error("ElevenLabs: HTTP request failed: %s", exc)
            return b""

        if response.status_code != 200:
            logger.error(
                "ElevenLabs: API returned HTTP %d voice_id=%s model_id=%s — %s",
                response.status_code,
                voice_id,
                model_id,
                response.text[:200],
            )
            return b""

        audio_bytes = response.content
        logger.info("ElevenLabs TTS done voice_id=%s received=%d bytes", voice_id, len(audio_bytes))
        return audio_bytes
