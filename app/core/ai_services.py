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


@lru_cache(maxsize=1)
def get_assessment_service():
    """Lazily initialize and cache the Azure pronunciation assessment service."""
    from app.services.azure_assessment import AzureAssessmentService

    language = os.getenv("AZURE_SPEECH_LANGUAGE", "en-US")
    logger.info("Initializing AzureAssessmentService language=%s", language)
    service = AzureAssessmentService(language=language)
    logger.info("AzureAssessmentService initialized and cached")
    return service


def normalize_history(history_raw: str | None, category: str | None, topic: str | None = None) -> list[str]:
    """Convert raw UI history JSON into a compact list of prompt-ready conversation lines."""
    history_lines: list[str] = []

    if category and category.strip():
        history_lines.append(f"Category: {category.strip()}")
    if topic and topic.strip():
        history_lines.append(f"Topic: {topic.strip()}")

    if not history_raw:
        logger.debug("normalize_history no history provided category_present=%s", bool(category and category.strip()))
        return history_lines

    try:
        parsed = json.loads(history_raw)
    except json.JSONDecodeError:
        logger.warning("normalize_history failed to parse history JSON len=%d", len(history_raw))
        return history_lines

    if not isinstance(parsed, list):
        logger.warning("normalize_history history JSON is not a list got=%s", type(parsed).__name__)
        return history_lines

    for item in parsed[-10:]:
        if isinstance(item, dict):
            role = str(item.get("role", "user")).strip().title()
            text = str(item.get("text", "")).strip()
            if text:
                history_lines.append(f"{role}: {text}")
        elif isinstance(item, str) and item.strip():
            history_lines.append(item.strip())

    logger.debug("normalize_history produced_lines=%d source_items=%d", len(history_lines), len(parsed))
    return history_lines


def transcribe_audio(audio_bytes: bytes, filename: str) -> str:
    """Transcribe uploaded audio; return empty string on any provider error."""
    logger.info("transcribe_audio start filename=%r size=%d bytes", filename, len(audio_bytes))
    try:
        transcript = get_stt_service().transcribe(audio_bytes, filename=filename)
        logger.info("transcribe_audio done transcript_length=%d", len(transcript))
        return transcript
    except Exception:
        logger.exception("STT transcription failed filename=%r size=%d", filename, len(audio_bytes))
        return ""


def _synthesize_audio_bytes(text: str, voice_gender: str | None = None) -> bytes:
    """Synthesize *text* via the cached pipeline's TTS service and return raw bytes."""
    logger.info("_synthesize_audio_bytes start text_length=%d", len(text))
    try:
        audio = get_voice_agent_pipeline().tts_service.convert_text_to_speech(
            text,
            voice_gender=voice_gender,
        )
        if audio is None:
            logger.warning("_synthesize_audio_bytes received None from TTS")
            return b""
        if not audio:
            logger.warning("_synthesize_audio_bytes returned empty bytes")
            return b""

        logger.info("_synthesize_audio_bytes done size=%d bytes", len(audio))
        return audio
    except Exception:
        logger.exception("Direct TTS synthesis failed text_length=%d", len(text))
        return b""


def run_langraph_agent(
    user_input: str,
    history: list[str] | None = None,
    voice_gender: str | None = None,
) -> tuple[str, bytes, str | None]:
    """Run the conversation pipeline and return (response_text, audio_bytes, grammar_json)."""
    history = history or []
    logger.info("run_langraph_agent start user_input_length=%d history_lines=%d", len(user_input), len(history))
    try:
        pipeline = get_voice_agent_pipeline()
        result = pipeline.run(user_input=user_input, history=history, voice_gender=voice_gender)
        response_text = str(result.get("response_text", "")).strip()
        audio_bytes: bytes = result.get("audio_bytes") or b""
        grammar_json: str | None = result.get("grammar_json")

        logger.info(
            "Pipeline run complete response_text_length=%d audio_bytes=%d grammar_present=%s",
            len(response_text),
            len(audio_bytes),
            grammar_json is not None,
        )

        if response_text:
            if not audio_bytes:
                logger.warning("Pipeline returned text but empty audio - retrying TTS directly")
                audio_bytes = _synthesize_audio_bytes(response_text, voice_gender=voice_gender)
            return response_text, audio_bytes, grammar_json

        logger.warning("Pipeline returned empty response_text - using fallback")
    except Exception:
        logger.exception("LangGraph agent pipeline failed user_input_length=%d", len(user_input))

    fallback_text = "Sorry, I couldn't process your request right now."
    logger.info("Returning fallback response")
    return fallback_text, _synthesize_audio_bytes(fallback_text, voice_gender=voice_gender), None
