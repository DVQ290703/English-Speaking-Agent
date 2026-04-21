import json
import os
from functools import lru_cache

from app.core.logger import logger


@lru_cache(maxsize=1)
def get_voice_agent_pipeline():
    """Lazily initialize and cache the voice agent pipeline (LLM + TTS)."""
    from app.agents.pipeline import VoiceAgentPipeline
    from app.services.elevenlabs_tts import ElevenLabsTTS
    from app.services.groq_llm import GroqLLMService

    llm_model = os.getenv("GROQ_LLM_MODEL", "llama-3.3-70b-versatile")
    logger.info("Initializing VoiceAgentPipeline llm_model=%s", llm_model)
    pipeline = VoiceAgentPipeline(
        llm_service=GroqLLMService(model_name=llm_model),
        tts_service=ElevenLabsTTS(),
    )
    logger.info("VoiceAgentPipeline initialized and cached")
    return pipeline


@lru_cache(maxsize=1)
def get_stt_service():
    """Lazily initialize and cache the speech-to-text service."""
    from app.services.groq_stt import GroqSTTService

    stt_model = os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo")
    logger.info("Initializing GroqSTTService model=%s", stt_model)
    service = GroqSTTService(model_name=stt_model)
    logger.info("GroqSTTService initialized and cached")
    return service


def normalize_history(history_raw: str | None, topic: str | None) -> list[str]:
    """Convert raw UI history JSON into a compact list of prompt-ready conversation lines."""
    history_lines: list[str] = []

    if topic and topic.strip():
        history_lines.append(f"Topic: {topic.strip()}")

    if not history_raw:
        logger.debug("normalize_history — no history provided topic=%r", topic)
        return history_lines

    try:
        parsed = json.loads(history_raw)
    except json.JSONDecodeError:
        logger.warning("normalize_history — failed to parse history JSON (len=%d)", len(history_raw))
        return history_lines

    if not isinstance(parsed, list):
        logger.warning("normalize_history — history JSON is not a list, got %s", type(parsed).__name__)
        return history_lines

    for item in parsed[-10:]:
        if isinstance(item, dict):
            role = str(item.get("role", "user")).strip().title()
            text = str(item.get("text", "")).strip()
            if text:
                history_lines.append(f"{role}: {text}")
        elif isinstance(item, str) and item.strip():
            history_lines.append(item.strip())

    logger.debug("normalize_history — produced %d lines from %d history items", len(history_lines), len(parsed))
    return history_lines


def transcribe_audio(audio_bytes: bytes, filename: str) -> str:
    """Transcribe uploaded audio; return empty string on any provider error."""
    logger.info("transcribe_audio start filename=%r size=%d bytes", filename, len(audio_bytes))
    try:
        transcript = get_stt_service().transcribe(audio_bytes, filename=filename)
        logger.info("transcribe_audio done transcript=%r (len=%d)", transcript[:80], len(transcript))
        return transcript
    except Exception:
        logger.exception("STT transcription failed filename=%r size=%d", filename, len(audio_bytes))
        return ""


def _synthesize_audio_bytes(text: str) -> bytes:
    """Synthesize *text* via the cached pipeline's TTS service and return raw bytes."""
    logger.info("_synthesize_audio_bytes start text=%r (len=%d)", text[:80], len(text))
    try:
        audio = get_voice_agent_pipeline().tts_service.convert_text_to_speech(text)
        if audio is None:
            logger.warning("_synthesize_audio_bytes received None from TTS for text=%r", text[:80])
            return b""

        if not audio:
            logger.warning("_synthesize_audio_bytes returned empty bytes for text=%r", text[:80])
            return b""

        logger.info("_synthesize_audio_bytes done size=%d bytes", len(audio))
        return audio
    except Exception:
        logger.exception("Direct TTS synthesis failed for text: %.80s", text)
        return b""


def run_langraph_agent(user_input: str, history: list[str] | None = None) -> tuple[str, bytes]:
    """Run the conversation pipeline and return (response_text, audio_bytes)."""
    history = history or []
    logger.info("run_langraph_agent start user_input=%r history_lines=%d", user_input[:80], len(history))
    try:
        pipeline = get_voice_agent_pipeline()
        result = pipeline.run(user_input=user_input, history=history)
        response_text = str(result.get("response_text", "")).strip()
        audio_bytes: bytes = result.get("audio_bytes") or b""

        logger.info(
            "Pipeline run complete response_text=%r (len=%d) audio_bytes=%d",
            response_text[:80], len(response_text), len(audio_bytes),
        )

        if response_text:
            if not audio_bytes:
                logger.warning("Pipeline returned text but empty audio — retrying TTS directly")
                audio_bytes = _synthesize_audio_bytes(response_text)
            return response_text, audio_bytes

        logger.warning("Pipeline returned empty response_text — using fallback")

    except Exception:
        logger.exception("LangGraph agent pipeline failed for user_input=%r", user_input[:80])

    fallback_text = "Sorry, I couldn't process your request right now."
    logger.info("Returning fallback response")
    return fallback_text, _synthesize_audio_bytes(fallback_text)
