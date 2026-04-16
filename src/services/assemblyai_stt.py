import os

import requests


class AssemblyAI:
    """Simple wrapper around the AssemblyAI transcription API."""

    def __init__(self):
        """Load API configuration for transcription requests."""
        self.api_key = os.getenv("ASSEMBLYAI_API_KEY")
        if not self.api_key:
            raise ValueError("ASSEMBLYAI_API_KEY is missing. Set it in your environment or .env file.")

        self.base_url = "https://api.assemblyai.com/v2"

    def transcribe_audio(self, audio_url: str):
        """Submit an audio URL for transcription and return the created job payload."""
        headers = {
            "authorization": self.api_key,
            "content-type": "application/json",
        }

        payload = {
            "audio_url": audio_url,
        }

        response = requests.post(f"{self.base_url}/transcript", headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        return response.json()

    def get_transcription_result(self, transcript_id: str):
        """Fetch the latest status or result for a submitted transcription job."""
        headers = {
            "authorization": self.api_key,
        }

        # Poll this endpoint until the job reaches a completed or failed state.
        response = requests.get(f"{self.base_url}/transcript/{transcript_id}", headers=headers, timeout=60)
        response.raise_for_status()
        return response.json()