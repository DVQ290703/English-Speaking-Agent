import json
import logging
import os
from functools import lru_cache

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_voice_agent_pipeline():
    """Lazily initialize and cache the voice agent pipeline (LLM + TTS)."""
    from src.agents.pipeline import VoiceAgentPipeline
    from src.services.elevenlabs_tts import ElevenLabsTTS
    from src.services.groq_llm import GroqLLMService

    llm_model = os.getenv("GROQ_LLM_MODEL", "llama-3.3-70b-versatile")
    return VoiceAgentPipeline(
        llm_service=GroqLLMService(model_name=llm_model),
        tts_service=ElevenLabsTTS(),
    )


@lru_cache(maxsize=1)
def get_stt_service():
    """Lazily initialize and cache the speech-to-text service."""
    from src.services.groq_stt import GroqSTTService

    stt_model = os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo")
    return GroqSTTService(model_name=stt_model)


def normalize_history(history_raw: str | None, topic: str | None) -> list[str]:
    """Convert raw UI history JSON into a compact list of prompt-ready conversation lines."""
    history_lines: list[str] = []

    if topic and topic.strip():
        history_lines.append(f"Topic: {topic.strip()}")

    if not history_raw:
        return history_lines

    try:
        parsed = json.loads(history_raw)
    except json.JSONDecodeError:
        return history_lines

    if not isinstance(parsed, list):
        return history_lines

    for item in parsed[-10:]:
        if isinstance(item, dict):
            role = str(item.get("role", "user")).strip().title()
            text = str(item.get("text", "")).strip()
            if text:
                history_lines.append(f"{role}: {text}")
        elif isinstance(item, str) and item.strip():
            history_lines.append(item.strip())

    return history_lines


def transcribe_audio(audio_bytes: bytes, filename: str) -> str:
    """Transcribe uploaded audio; return empty string on any provider error."""
    try:
        return get_stt_service().transcribe(audio_bytes, filename=filename)
    except Exception:
        logger.exception("STT transcription failed")
        return ""


def _synthesize_audio_bytes(text: str) -> bytes:
    """Synthesize *text* via the cached pipeline's TTS service and return raw bytes.

    Reuses the already-cached ElevenLabsTTS instance rather than constructing a
    new one on every fallback call.
    """
    try:
        return get_voice_agent_pipeline().tts_service.convert_text_to_speech(text)
    except Exception:
        logger.exception("Direct TTS synthesis failed for text: %.80s", text)
        return b""


def run_langraph_agent(user_input: str, history: list[str] | None = None) -> tuple[str, bytes]:
    """Run the conversation pipeline and return (response_text, audio_bytes).

    audio_bytes is guaranteed to be either valid MP3 data or b"" — never None.
    """
    try:
        pipeline = get_voice_agent_pipeline()
        result = pipeline.run(user_input=user_input, history=history or [])
        response_text = str(result.get("response_text", "")).strip()
        audio_bytes: bytes = result.get("audio_bytes") or b""

        if response_text:
            if not audio_bytes:
                # Pipeline LLM succeeded but TTS node failed — retry TTS directly.
                logger.warning("Pipeline returned empty audio; retrying TTS directly")
                audio_bytes = _synthesize_audio_bytes(response_text)
            return response_text, audio_bytes

    except Exception:
        logger.exception("LangGraph agent pipeline failed")

    fallback_text = "Sorry, I couldn't process your request right now."
    return fallback_text, _synthesize_audio_bytes(fallback_text)
