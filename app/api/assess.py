from __future__ import annotations

import json
import uuid as _uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError

from app.api._audio import (
    _SUPPORTED_AUDIO_CONTENT_TYPES,
    _MAX_AUDIO_BYTES,
    _read_and_close_upload,
    _validate_uploaded_audio,
)
from app.api._validators import _enforce_max_length, _validate_uuid
from app.api.schemas import (
    AssessmentResponse,
    PhonemeResult,
    SyllableResult,
    WordResult,
)
from app.core.ai_services import get_assessment_service
from app.core.database import get_connection
from app.core.logger import logger
from app.core.security import get_current_user_id

router = APIRouter(tags=["assessment"])

_MAX_REFERENCE_TEXT_CHARS = 500
_ALLOWED_LANGUAGE_CODES = frozenset({"en-US", "en-GB"})


def _normalize_language(language: str | None) -> str | None:
    if language is None:
        return None
    candidate = language.strip()
    if not candidate:
        return None
    if candidate not in _ALLOWED_LANGUAGE_CODES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported language '{candidate}'. Allowed values: en-US, en-GB.",
        )
    return candidate


@router.post("/assess", response_model=AssessmentResponse)
def assess_pronunciation(
    audio_file: UploadFile = File(...),
    reference_text: str | None = Form(default=None),
    language: str | None = Form(default=None),
    message_id: str | None = Form(default=None),
    user_id: str = Depends(get_current_user_id),
):
    """Score pronunciation via Azure. Scripted mode (with reference_text) gives word/phoneme error detail;
    unscripted mode freely recognizes speech. Result is persisted and linked to message_id when provided.
    """
    language = _normalize_language(_enforce_max_length(language, field="language", max_chars=10))
    reference_text = _enforce_max_length(
        reference_text,
        field="reference_text",
        max_chars=_MAX_REFERENCE_TEXT_CHARS,
    )
    if message_id:
        _validate_uuid(message_id, "message_id")
    logger.info(
        "assess_pronunciation start user_id=%s mode=%s language=%s",
        user_id,
        "scripted" if reference_text else "unscripted",
        language,
    )

    audio_bytes = _read_and_close_upload(audio_file)

    if not audio_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Audio file is empty")
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio file exceeds 25 MB limit",
        )

    content_type = _validate_uploaded_audio(
        audio_file=audio_file,
        audio_bytes=audio_bytes,
        allowed_content_types=_SUPPORTED_AUDIO_CONTENT_TYPES,
        endpoint_label="Assessment",
    )
    logger.info("Assessment audio accepted content_type=%s size=%d", content_type, len(audio_bytes))

    try:
        service = get_assessment_service()
    except ValueError as exc:
        logger.error("AzureAssessmentService misconfigured: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pronunciation assessment service is not available",
        ) from exc

    try:
        result = service.assess(
            audio_bytes=audio_bytes,
            reference_text=reference_text,
            language=language,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("AzureAssessment failed user_id=%s error=%s", user_id, exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    pron = result.get("PronunciationAssessment", {})
    try:
        words = [
            WordResult(
                word=w.get("Word", ""),
                accuracy_score=w.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0),
                error_type=w.get("PronunciationAssessment", {}).get("ErrorType", "None"),
                syllables=[
                    SyllableResult(
                        syllable=s.get("Syllable", ""),
                        accuracy_score=s.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0),
                    )
                    for s in (w.get("Syllables") or [])
                ],
                phonemes=[
                    PhonemeResult(
                        phoneme=p.get("Phoneme", ""),
                        accuracy_score=p.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0),
                    )
                    for p in (w.get("Phonemes") or [])
                ],
            )
            for w in result.get("Words", [])
        ]
    except ValidationError as exc:
        logger.error("AzureAssessment schema validation failed user_id=%s error=%s", user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Azure returned an unrecognised response format",
        ) from exc

    assessment_id = str(_uuid.uuid4())
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO pronunciation_assessments
                        (id, message_id, user_id, reference_text, recognized_text,
                         recognition_status, overall_score, accuracy_score, fluency_score,
                         completeness_score, prosody_score,
                         nbest_confidence, snr, offset_ticks, duration_ticks,
                         raw_result_json)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        assessment_id,
                        message_id or None,
                        user_id,
                        reference_text,
                        result.get("display_text", ""),
                        result.get("recognition_status"),
                        pron.get("PronScore"),
                        pron.get("AccuracyScore"),
                        pron.get("FluencyScore"),
                        pron.get("CompletenessScore"),
                        pron.get("ProsodyScore"),
                        result.get("Confidence"),
                        result.get("snr"),
                        result.get("offset_ticks"),
                        result.get("duration_ticks"),
                        json.dumps(result),
                    ),
                )
                for idx, w in enumerate(result.get("Words", [])):
                    w_pron = w.get("PronunciationAssessment", {})
                    feedback = w_pron.get("Feedback", {}).get("Prosody", {})
                    break_fb = feedback.get("Break", {})
                    intonation_fb = feedback.get("Intonation", {})
                    monotone = intonation_fb.get("Monotone", {})
                    cur.execute(
                        """
                        INSERT INTO pronunciation_word_details
                            (assessment_id, word_index, word, accuracy_score, error_type,
                             offset_ticks, duration_ticks,
                             break_error_types, unexpected_break_confidence,
                             missing_break_confidence, break_length_ticks,
                             intonation_error_types, monotone_confidence)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                        """,
                        (
                            assessment_id,
                            idx,
                            w.get("Word", ""),
                            w_pron.get("AccuracyScore"),
                            w_pron.get("ErrorType", "None"),
                            w.get("Offset"),
                            w.get("Duration"),
                            break_fb.get("ErrorTypes") or [],
                            (break_fb.get("UnexpectedBreak") or {}).get("Confidence"),
                            (break_fb.get("MissingBreak") or {}).get("Confidence"),
                            break_fb.get("BreakLength"),
                            intonation_fb.get("ErrorTypes") or [],
                            monotone.get("SyllablePitchDeltaConfidence"),
                        ),
                    )
                    word_detail_id = cur.fetchone()[0]

                    for s_idx, s in enumerate(w.get("Syllables") or []):
                        s_pron = s.get("PronunciationAssessment", {})
                        cur.execute(
                            """
                            INSERT INTO pronunciation_syllable_details
                                (word_detail_id, syllable_index, syllable, grapheme,
                                 accuracy_score, offset_ticks, duration_ticks)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                word_detail_id,
                                s_idx,
                                s.get("Syllable", ""),
                                s.get("Grapheme"),
                                s_pron.get("AccuracyScore"),
                                s.get("Offset"),
                                s.get("Duration"),
                            ),
                        )

                    for p_idx, p in enumerate(w.get("Phonemes") or []):
                        p_pron = p.get("PronunciationAssessment", {})
                        cur.execute(
                            """
                            INSERT INTO pronunciation_phoneme_details
                                (word_detail_id, phoneme_index, phoneme,
                                 accuracy_score, offset_ticks, duration_ticks)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            """,
                            (
                                word_detail_id,
                                p_idx,
                                p.get("Phoneme", ""),
                                p_pron.get("AccuracyScore"),
                                p.get("Offset"),
                                p.get("Duration"),
                            ),
                        )
        logger.info(
            "assess_pronunciation persisted assessment_id=%s user_id=%s message_id=%s words=%d",
            assessment_id, user_id, message_id, len(result.get("Words", [])),
        )
    except Exception:
        logger.exception(
            "Failed to persist assessment assessment_id=%s user_id=%s", assessment_id, user_id
        )

    logger.info(
        "assess_pronunciation done user_id=%s mode=%s pron_score=%s recognized_length=%d",
        user_id,
        result.get("mode"),
        pron.get("PronScore"),
        len(result.get("display_text", "")),
    )

    return AssessmentResponse(
        assessment_id=assessment_id,
        mode=result.get("mode", "unscripted"),
        recognized_text=result.get("display_text", ""),
        pron_score=pron.get("PronScore", 0.0),
        accuracy_score=pron.get("AccuracyScore", 0.0),
        fluency_score=pron.get("FluencyScore", 0.0),
        completeness_score=pron.get("CompletenessScore"),
        prosody_score=pron.get("ProsodyScore"),
        words=words,
    )
