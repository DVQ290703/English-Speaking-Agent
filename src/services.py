from __future__ import annotations

import hashlib
import re
import wave
from datetime import datetime, timezone
from typing import Any

from .config import DEFAULT_VOICE, GENERATED_AUDIO_DIR

RUBRIC_VERSION = "v2.0"
COMMON_FILLERS = {"um", "uh", "erm", "like", "you know", "actually"}
SAMPLE_TRANSCRIPTS = [
    "I think learning English every day helps me become more confident when I speak.",
    "My hometown is a peaceful place with many trees and friendly people.",
    "In my opinion, technology makes studying easier but also more distracting.",
    "I enjoy traveling because it gives me a chance to meet new people and try new food.",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def clamp(value: int, min_value: int = 0, max_value: int = 100) -> int:
    return max(min_value, min(max_value, value))


def tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z']+", text.lower())


def count_fillers(text: str) -> int:
    lowered = text.lower()
    return sum(lowered.count(filler) for filler in COMMON_FILLERS)


def pick_sample_transcript(seed_text: str) -> str:
    digest = hashlib.sha256(seed_text.encode("utf-8")).digest()
    index = digest[0] % len(SAMPLE_TRANSCRIPTS)
    return SAMPLE_TRANSCRIPTS[index]


def normalize_text(text: str) -> str:
    compact = re.sub(r"\s+", " ", text.strip())
    if not compact:
        return compact
    compact = compact[0].upper() + compact[1:]
    compact = re.sub(r"\bi\b", "I", compact)
    compact = re.sub(r"\bi'm\b", "I'm", compact, flags=re.IGNORECASE)
    if compact[-1] not in ".!?":
        compact += "."
    return compact


def estimate_text_duration_seconds(word_count: int, pause_count: int) -> int:
    estimated = max(5, round(word_count / 2.4) + pause_count)
    return clamp(estimated, 5, 240)


def read_audio_duration_seconds(audio_path: str) -> int | None:
    try:
        with wave.open(audio_path, "rb") as wav_file:
            frame_count = wav_file.getnframes()
            frame_rate = wav_file.getframerate() or 0
            if frame_rate <= 0:
                return None
            return clamp(max(1, round(frame_count / frame_rate)), 1, 3600)
    except Exception:
        return None


def detect_feedback(text: str, unique_ratio: float, word_count: int) -> list[str]:
    feedback: list[str] = []
    lowered = text.lower().strip()

    if not lowered:
        return ["Hãy nhập nội dung để hệ thống có thể đánh giá."]

    if text and text[0].islower():
        feedback.append("Viết hoa chữ cái đầu câu.")
    if text and text[-1] not in ".!?":
        feedback.append("Thêm dấu câu ở cuối câu.")
    if word_count < 20:
        feedback.append("Mở rộng câu trả lời bằng một ví dụ hoặc giải thích ngắn.")
    if unique_ratio < 0.45:
        feedback.append("Tăng độ đa dạng từ vựng, tránh lặp từ quá nhiều.")

    if any(filler in lowered for filler in COMMON_FILLERS):
        feedback.append("Giảm các từ đệm như um, uh, like để tăng độ trôi chảy.")

    if not feedback:
        feedback.append("Câu trả lời tốt, hãy thử thêm ví dụ cụ thể để tăng độ tự nhiên.")

    return feedback


def score_text(text: str) -> dict[str, Any]:
    tokens = tokenize(text)
    word_count = len(tokens)
    unique_ratio = len(set(tokens)) / word_count if word_count else 0.0
    pause_count = count_fillers(text)
    sentence_count = max(1, len(re.findall(r"[.!?]+", text)))

    grammar_score = 96
    if not text.strip():
        grammar_score = 0
    else:
        if text and text[0].islower():
            grammar_score -= 4
        if text and text[-1] not in ".!?":
            grammar_score -= 4
        if re.search(r"\b(\w+)\s+\1\b", text, flags=re.IGNORECASE):
            grammar_score -= 6
        if word_count < 20:
            grammar_score -= 5
        if any(filler in text.lower() for filler in COMMON_FILLERS):
            grammar_score -= 4

    vocabulary_score = 58 + int(unique_ratio * 34)
    if word_count < 8:
        vocabulary_score -= 8

    grammar_score = clamp(grammar_score, 40, 100)
    vocabulary_score = clamp(vocabulary_score, 40, 100)
    fluency_score = clamp(72 + min(word_count, 40) // 2 - pause_count * 4, 40, 100)
    coherence_score = clamp(70 + sentence_count * 3 + (8 if word_count >= 20 else -6), 40, 100)
    lexical_resource_score = clamp(60 + int(unique_ratio * 36), 40, 100)

    corrected_text = normalize_text(text)
    feedback = detect_feedback(text, unique_ratio, word_count)
    summary = (
        f"Grammar {grammar_score}/100, vocabulary {vocabulary_score}/100, "
        f"fluency {fluency_score}/100, coherence {coherence_score}/100, "
        f"lexical resource {lexical_resource_score}/100. "
        f"Focus on clearer structure and more specific examples."
    )

    return {
        "transcript": text,
        "grammar_score": grammar_score,
        "vocabulary_score": vocabulary_score,
        "fluency_score": fluency_score,
        "coherence_score": coherence_score,
        "lexical_resource_score": lexical_resource_score,
        "pronunciation_score": None,
        "corrected_text": corrected_text,
        "feedback": feedback,
        "summary": summary,
        "is_mock": True,
        "rubric_version": RUBRIC_VERSION,
        "word_count": word_count,
        "pause_count": pause_count,
        "duration_seconds": estimate_text_duration_seconds(word_count, pause_count),
    }


def estimate_pronunciation_score(source_text: str, file_size: int) -> int:
    digest = hashlib.sha256(source_text.encode("utf-8")).digest()
    base = 72 + digest[0] % 18
    if file_size < 2048:
        base -= 4
    if file_size > 1_000_000:
        base += 2
    return clamp(base, 40, 98)


def score_audio(seed_text: str, audio_path: str, file_size: int) -> dict[str, Any]:
    transcript = pick_sample_transcript(seed_text)
    text_result = score_text(transcript)
    pronunciation_score = estimate_pronunciation_score(audio_path, file_size)
    audio_duration_seconds = read_audio_duration_seconds(audio_path) or text_result["duration_seconds"]

    feedback = list(text_result["feedback"])
    feedback.insert(
        0,
        "Đây là bản mock STT/TTS cho MVP; hãy kết nối Whisper và TTS thật ở phase sau.",
    )
    feedback.append(f"Phát âm hiện được mô phỏng ở mức {pronunciation_score}/100.")

    summary = (
        f"Transcript generated from mock STT. Grammar {text_result['grammar_score']}/100, "
        f"vocabulary {text_result['vocabulary_score']}/100, pronunciation {pronunciation_score}/100."
    )

    return {
        "transcript": transcript,
        "grammar_score": text_result["grammar_score"],
        "vocabulary_score": text_result["vocabulary_score"],
        "fluency_score": text_result["fluency_score"],
        "coherence_score": text_result["coherence_score"],
        "lexical_resource_score": text_result["lexical_resource_score"],
        "pronunciation_score": pronunciation_score,
        "corrected_text": text_result["corrected_text"],
        "feedback": feedback,
        "summary": summary,
        "is_mock": True,
        "rubric_version": RUBRIC_VERSION,
        "word_count": text_result["word_count"],
        "pause_count": text_result["pause_count"],
        "duration_seconds": audio_duration_seconds,
    }


def build_agent_reply(topic_title: str, evaluation: dict[str, Any]) -> str:
    feedback_line = evaluation["feedback"][0]
    return f"Topic '{topic_title}': {evaluation['summary']} Top tip: {feedback_line}"


def ensure_audio_dir() -> None:
    GENERATED_AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def _create_silent_wav(filename: str) -> str:
    ensure_audio_dir()
    path = GENERATED_AUDIO_DIR / filename
    if path.exists():
        return str(path)

    sample_rate = 16_000
    duration_seconds = 1.2
    frame_count = int(sample_rate * duration_seconds)
    with wave.open(str(path), "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        silence_frame = (0).to_bytes(2, byteorder="little", signed=True)
        wav_file.writeframes(silence_frame * frame_count)
    return str(path)


def create_mock_agent_audio(message_id: int, topic_slug: str, voice_name: str = DEFAULT_VOICE) -> str:
    safe_voice = re.sub(r"[^A-Za-z0-9_-]+", "_", voice_name)
    safe_topic = re.sub(r"[^A-Za-z0-9_-]+", "_", topic_slug)
    filename = f"agent_{message_id}_{safe_topic}_{safe_voice}.wav"
    return _create_silent_wav(filename)


def create_mock_user_audio(message_id: int, topic_slug: str) -> str:
    safe_topic = re.sub(r"[^A-Za-z0-9_-]+", "_", topic_slug)
    filename = f"user_{message_id}_{safe_topic}.wav"
    return _create_silent_wav(filename)


def make_analysis_payload(
    message_id: int,
    topic_title: str,
    topic_slug: str,
    audio_path: str | None,
    evaluation: dict[str, Any],
    voice_name: str,
) -> dict[str, Any]:
    agent_audio_path = create_mock_agent_audio(message_id, topic_slug, voice_name)
    return {
        "message_id": message_id,
        "topic_title": topic_title,
        "topic_slug": topic_slug,
        "audio_path": audio_path,
        "agent_audio_path": agent_audio_path,
        "evaluation": evaluation,
        "agent_reply_text": build_agent_reply(topic_title, evaluation),
    }
