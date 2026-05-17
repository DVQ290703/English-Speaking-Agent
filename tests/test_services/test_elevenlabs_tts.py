# tests/test_services/test_elevenlabs_tts.py
"""Unit tests for ElevenLabsTTS accent-aware voice resolution."""

import os
from unittest.mock import patch, MagicMock

import pytest

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")


class TestResolveVoiceId:
    def _make_tts(self):
        from app.services.elevenlabs_tts import ElevenLabsTTS
        return ElevenLabsTTS()

    def _env(self, **kwargs):
        defaults = {
            "ELEVENLABS_US_MALE_VOICE_ID": "us-male-id",
            "ELEVENLABS_US_FEMALE_VOICE_ID": "us-female-id",
            "ELEVENLABS_UK_MALE_VOICE_ID": "uk-male-id",
            "ELEVENLABS_UK_FEMALE_VOICE_ID": "uk-female-id",
            "ELEVENLABS_VOICE_ID": "default-id",
        }
        defaults.update(kwargs)
        return defaults

    def test_male_us_returns_us_male_voice(self):
        with patch.dict(os.environ, self._env(), clear=False):
            tts = self._make_tts()
            assert tts._resolve_voice_id("male", "us") == "us-male-id"

    def test_female_us_returns_us_female_voice(self):
        with patch.dict(os.environ, self._env(), clear=False):
            tts = self._make_tts()
            assert tts._resolve_voice_id("female", "us") == "us-female-id"

    def test_male_uk_returns_uk_male_voice(self):
        with patch.dict(os.environ, self._env(), clear=False):
            tts = self._make_tts()
            assert tts._resolve_voice_id("male", "uk") == "uk-male-id"

    def test_female_uk_returns_uk_female_voice(self):
        with patch.dict(os.environ, self._env(), clear=False):
            tts = self._make_tts()
            assert tts._resolve_voice_id("female", "uk") == "uk-female-id"

    def test_no_accent_defaults_to_us(self):
        with patch.dict(os.environ, self._env(), clear=False):
            tts = self._make_tts()
            assert tts._resolve_voice_id("male", None) == "us-male-id"

    def test_empty_accent_defaults_to_us(self):
        with patch.dict(os.environ, self._env(), clear=False):
            tts = self._make_tts()
            assert tts._resolve_voice_id("female", "  ") == "us-female-id"

    def test_case_insensitive_accent(self):
        with patch.dict(os.environ, self._env(), clear=False):
            tts = self._make_tts()
            assert tts._resolve_voice_id("Male", "UK") == "uk-male-id"

    def test_unknown_accent_falls_back_to_default_voice(self):
        with patch.dict(os.environ, self._env(), clear=False):
            tts = self._make_tts()
            assert tts._resolve_voice_id("male", "au") == "default-id"

    def test_missing_env_var_falls_back_to_default_voice(self):
        env = self._env(ELEVENLABS_US_MALE_VOICE_ID="")
        with patch.dict(os.environ, env, clear=False):
            tts = self._make_tts()
            assert tts._resolve_voice_id("male", "us") == "default-id"

    def test_no_gender_no_accent_returns_default_voice(self):
        with patch.dict(os.environ, self._env(), clear=False):
            tts = self._make_tts()
            assert tts._resolve_voice_id(None, None) == "default-id"
