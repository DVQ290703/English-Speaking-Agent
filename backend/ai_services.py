import base64
import json
import os
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def get_voice_agent_pipeline():
    """Lazily initialize and cache the expensive voice agent pipeline."""
    from src.agents.pipeline import VoiceAgentPipeline
    from src.services.elevenlabs_tts import ElevenLabsTTS
    from src.services.groq_llm import GroqLLMService

    llm_model = os.getenv("GROQ_LLM_MODEL", "llama-3.3-70b-versatile")
    return VoiceAgentPipeline(
        llm_service=GroqLLMService(model_name=llm_model),
        tts_service=ElevenLabsTTS(output_dir="outputs"),
    )


@lru_cache(maxsize=1)
def get_stt_service():
    """Lazily initialize and cache the speech-to-text service."""
    from src.services.groq_stt import GroqSTTService

    stt_model = os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo")
    return GroqSTTService(model_name=stt_model)


def normalize_history(history_raw: str | None, topic: str | None) -> list[str]:
    """Convert raw UI history into a compact list of prompt-ready conversation lines."""
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
    """Transcribe uploaded audio and fall back safely on provider errors."""
    try:
        stt_service = get_stt_service()
        return stt_service.transcribe(audio_bytes, filename=filename)
    except Exception:
        return ""


def synthesize_audio_base64(response_text: str) -> str:
    """Convert response text to base64-encoded audio for direct frontend playback."""
    try:
        from src.services.elevenlabs_tts import ElevenLabsTTS

        tts_service = ElevenLabsTTS(output_dir="outputs")
        audio_path = tts_service.convert_text_to_speech(response_text)

        if not audio_path:
            return ""

        audio_file = Path(audio_path)
        if not audio_file.exists():
            return ""

        return base64.b64encode(audio_file.read_bytes()).decode("utf-8")
    except Exception:
        return ""


def synthesize_audio_bytes(response_text: str) -> bytes:
    """Generate TTS audio and return raw bytes (for Minio storage)."""
    try:
        from src.services.elevenlabs_tts import ElevenLabsTTS

        tts_service = ElevenLabsTTS(output_dir="outputs")
        audio_path = tts_service.convert_text_to_speech(response_text)

        if not audio_path:
            return b""

        audio_file = Path(audio_path)
        if not audio_file.exists():
            return b""

        return audio_file.read_bytes()
    except Exception:
        return b""


def run_langraph_agent(user_input: str, history: list[str] | None = None) -> tuple[str, str]:
    """Run the main conversation pipeline and always return a text response."""
    try:
        pipeline = get_voice_agent_pipeline()
        result = pipeline.run(user_input=user_input, history=history or [])
        response_text = str(result.get("response_text", "")).strip()
        audio_path = str(result.get("audio_path", "")).strip()

        audio_base64 = ""
        if audio_path:
            audio_file = Path(audio_path)
            if audio_file.exists():
                audio_base64 = base64.b64encode(audio_file.read_bytes()).decode("utf-8")

        if response_text:
            return response_text, audio_base64

    except Exception:
        pass

    fallback_text = "Sorry, I couldn't process your request right now."
    return fallback_text, synthesize_audio_base64(fallback_text)
