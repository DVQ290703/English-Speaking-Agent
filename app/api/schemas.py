import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator, model_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class _EmailValidatedModel(BaseModel):
    @staticmethod
    def _normalize_and_validate_email(value: str) -> str:
        normalized = value.strip().lower()
        if not _EMAIL_RE.match(normalized):
            raise ValueError("Invalid email address")
        return normalized


class LoginRequest(_EmailValidatedModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return cls._normalize_and_validate_email(value)


class RegisterRequest(_EmailValidatedModel):
    email: str
    password: str
    display_name: str | None = None
    english_level: str | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return cls._normalize_and_validate_email(value)


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str | None
    english_level: str | None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class ChatResponse(BaseModel):
    user_input: str
    response_text: str
    audio_base64: str = ""
    audio_mime: str = "audio/mpeg"
    user_audio_url: str | None = None
    assistant_audio_url: str | None = None
    conversation_id: str
    user_message_id: str | None = None


class MessageOut(BaseModel):
    id: str
    role: str
    input_mode: str | None
    text_content: str | None
    created_at: datetime
    audio_url: str | None = None


class ConversationOut(BaseModel):
    id: str
    title: str | None
    status: str
    started_at: datetime
    ended_at: datetime | None
    topic_id: str | None
    topic_code: str | None = None
    cleared_at: datetime | None = None


class ConversationListResponse(BaseModel):
    conversations: list[ConversationOut]


class ForTopicConversationOut(BaseModel):
    id: str
    title: str | None
    status: str
    session_number: int
    started_at: datetime
    updated_at: datetime


class ForTopicResponse(BaseModel):
    topic_code: str
    topic_title: str
    conversations: list[ForTopicConversationOut]
    total: int
    limit_reached: bool


class ConversationMessagesResponse(BaseModel):
    conversation_id: str
    messages: list[MessageOut]


class WordDetail(BaseModel):
    word_index: int
    word: str
    accuracy_score: float | None = None
    error_type: str | None = None
    start_ms: int | None = None
    duration_ms: int | None = None


class MessageScoreOut(BaseModel):
    overall_score: float | None = None
    accuracy_score: float | None = None
    fluency_score: float | None = None
    completeness_score: float | None = None
    prosody_score: float | None = None
    words: list[WordDetail] = []


class MessageWithScoreOut(BaseModel):
    id: str
    role: str
    input_mode: str | None = None
    text_content: str | None = None
    created_at: datetime
    audio_url: str | None = None
    score: MessageScoreOut | None = None


class ConversationWithScoresResponse(BaseModel):
    conversation_id: str
    messages: list[MessageWithScoreOut]


class SyllableResult(BaseModel):
    syllable: str
    accuracy_score: float

    @model_validator(mode="before")
    @classmethod
    def normalize_azure_shape(cls, value):
        if isinstance(value, dict) and "Syllable" in value:
            return {
                "syllable": value.get("Syllable", ""),
                "accuracy_score": value.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0),
            }
        return value


class PhonemeResult(BaseModel):
    phoneme: str
    accuracy_score: float

    @model_validator(mode="before")
    @classmethod
    def normalize_azure_shape(cls, value):
        if isinstance(value, dict) and "Phoneme" in value:
            return {
                "phoneme": value.get("Phoneme", ""),
                "accuracy_score": value.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0),
            }
        return value


class WordResult(BaseModel):
    word: str
    accuracy_score: float
    error_type: Literal["None", "Omission", "Insertion", "Mispronunciation", "UnexpectedBreak", "MissingBreak", "Monotone"]
    syllables: list[SyllableResult]
    phonemes: list[PhonemeResult]


class AssessmentResponse(BaseModel):
    assessment_id: str | None = None
    mode: Literal["scripted", "unscripted"]
    recognized_text: str
    pron_score: float
    accuracy_score: float
    fluency_score: float
    completeness_score: float | None
    prosody_score: float | None
    words: list[WordResult]
