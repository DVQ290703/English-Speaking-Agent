"""ElevenLabs text-to-speech service.

Returns raw audio bytes directly from the API; no temp files are written.
"""

import os
from contextlib import closing

import requests

from app.core.logger import logger
from app.core.telemetry import span_context

_ENV_API_KEY = "ELEVENLABS_API_KEY"
_ENV_MODEL_ID = "ELEVENLABS_MODEL_ID"
_ENV_DEFAULT_VOICE_ID = "ELEVENLABS_VOICE_ID"
_ENV_MALE_VOICE_ID = "ELEVENLABS_VOICE_ID_MALE"
_ENV_FEMALE_VOICE_ID = "ELEVENLABS_VOICE_ID_FEMALE"
_DEFAULT_MODEL_ID = "eleven_flash_v2_5"
_REQUEST_TIMEOUT_SECONDS = 60
_CHUNK_SIZE_BYTES = 64 * 1024


class ElevenLabsTTS:
    """Generate MP3 audio from text using the ElevenLabs API."""

    def _get_env_value(self, key: str) -> str:
        return os.getenv(key, "").strip()

    def _resolve_voice_id(self, voice_gender: str | None = None) -> str:
        """Resolve voice ID without crossing explicit male/female requests."""
        gender = (voice_gender or "").strip().lower()
        gender_env_by_name = {
            "male": _ENV_MALE_VOICE_ID,
            "female": _ENV_FEMALE_VOICE_ID,
        }
        requested_env = gender_env_by_name.get(gender)
        if requested_env is not None:
            return self._resolve_requested_gender_voice(requested_env)

        default_voice_id = self._get_env_value(_ENV_DEFAULT_VOICE_ID)
        return self._resolve_unspecified_gender_voice(default_voice_id)

    def _resolve_unspecified_gender_voice(self, default_voice_id: str) -> str:
        if default_voice_id:
            return default_voice_id

        logger.error("%s is not configured and no valid voice_gender was requested", _ENV_DEFAULT_VOICE_ID)
        return ""

    def _resolve_requested_gender_voice(self, requested_env: str) -> str:
        """Resolve an explicit gender request only from its matching voice env."""
        voice_id = self._get_env_value(requested_env)
        if voice_id:
            return voice_id
        logger.error("%s is not configured for explicit voice_gender request", requested_env)
        return ""

    def convert_text_to_speech(self, text: str, voice_gender: str | None = None) -> bytes:
        """Synthesize text and return raw MP3 bytes, or empty bytes on failure."""
        if not text.strip():
            logger.debug("ElevenLabs: empty text provided, skipping synthesis")
            return b""

        api_key = self._get_env_value(_ENV_API_KEY)
        if not api_key:
            logger.error("ElevenLabs: %s is not set - cannot synthesize audio", _ENV_API_KEY)
            return b""

        voice_id = self._resolve_voice_id(voice_gender)
        if not voice_id:
            logger.error(
                "ElevenLabs: no voice ID configured for voice_gender=%r - set "
                "%s, %s, or %s",
                voice_gender,
                _ENV_MALE_VOICE_ID,
                _ENV_FEMALE_VOICE_ID,
                _ENV_DEFAULT_VOICE_ID,
            )
            return b""

        model_id = self._get_env_value(_ENV_MODEL_ID) or _DEFAULT_MODEL_ID
        logger.info("ElevenLabs TTS request voice_id=%s model_id=%s text_len=%d", voice_id, model_id, len(text))

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {
            "xi-api-key": api_key,
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
        }
        payload = {"text": text, "model_id": model_id}

        with span_context("tts.synthesize", kind="tts") as span:
            span.set(model=model_id, voice_id=voice_id, text_length=len(text))
            try:
                with closing(
                    requests.post(
                        url,
                        headers=headers,
                        json=payload,
                        timeout=_REQUEST_TIMEOUT_SECONDS,
                        stream=True,
                    )
                ) as response:
                    if response.status_code != 200:
                        logger.error(
                            "ElevenLabs: API returned HTTP %d voice_id=%s model_id=%s - %s",
                            response.status_code,
                            voice_id,
                            model_id,
                            response.text[:200],
                        )
                        return b""

                    audio_bytes = self._read_audio_response(response)
            except requests.RequestException as exc:
                logger.error("ElevenLabs: HTTP request failed: %s", exc)
                return b""

        if not audio_bytes:
            logger.error("ElevenLabs: API returned empty audio body voice_id=%s model_id=%s", voice_id, model_id)
            return b""

        content_length = response.headers.get("Content-Length")
        if content_length:
            try:
                expected_length = int(content_length)
            except ValueError:
                expected_length = None
            if expected_length is not None and len(audio_bytes) != expected_length:
                logger.error(
                    "ElevenLabs: incomplete audio body voice_id=%s model_id=%s expected_bytes=%d received_bytes=%d",
                    voice_id,
                    model_id,
                    expected_length,
                    len(audio_bytes),
                )
                return b""

        content_type = str(response.headers.get("Content-Type", "")).lower()
        if content_type and not content_type.startswith("audio/"):
            logger.error(
                "ElevenLabs: API returned unexpected content type %r voice_id=%s model_id=%s",
                content_type,
                voice_id,
                model_id,
            )
            return b""

        logger.info("ElevenLabs TTS done voice_id=%s received=%d bytes", voice_id, len(audio_bytes))
        return audio_bytes

    def _read_audio_response(self, response: requests.Response) -> bytes:
        chunks: list[bytes] = []
        for chunk in response.iter_content(chunk_size=_CHUNK_SIZE_BYTES):
            if chunk:
                chunks.append(chunk)
        return b"".join(chunks)
