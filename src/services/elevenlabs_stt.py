import os
import uuid
from pathlib import Path

import requests


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

        if not api_key or not voice_id or not text.strip():
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

        response = requests.post(url, headers=headers, json=payload, timeout=60)
        if response.status_code != 200:
            return ""

        # Persist audio locally so the API layer can stream or encode it later.
        audio_path = self.output_dir / f"tts_{uuid.uuid4().hex}.mp3"
        audio_path.write_bytes(response.content)
        return str(audio_path)


# Backward-compatible alias for older imports.
ElevenLabsSTT = ElevenLabsTTS