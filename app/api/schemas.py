import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

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


class GrammarSpan(BaseModel):
    original: str
    corrected: str
    start_char: int
    end_char: int


class GrammarSummary(BaseModel):
    error_count: int
    has_errors: bool
    flagged_spans: list[GrammarSpan]


class GrammarErrorDetail(BaseModel):
    id: int
    original: str
    corrected: str
    start_char: int
    end_char: int
    category: str
    severity: str
    explanation: str
    rule: str | None = None
    example: str | None = None


class GrammarDetailResponse(BaseModel):
    message_id: str
    user_input: str
    errors: list[GrammarErrorDetail]
    corrected_sentence: str | None
    overall_score: int


class ToolCallStep(BaseModel):
    tool_name: str
    input_summary: str
    output_summary: str
    result_label: str = ""
    duration_ms: int | None = None
    status: Literal["completed", "failed"] = "completed"
    error: str | None = None


class ChatResponse(BaseModel):
    user_input: str
    response_text: str
    audio_base64: str = ""
    audio_mime: str = "audio/mpeg"
    user_audio_url: str | None = None
    assistant_audio_url: str | None = None
    conversation_id: str
    user_message_id: str | None = None
    grammar_summary: GrammarSummary = Field(
        default_factory=lambda: GrammarSummary(error_count=0, has_errors=False, flagged_spans=[])
    )
    grammar_detail: GrammarDetailResponse | None = None
    tool_steps: list[ToolCallStep] = Field(default_factory=list)


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


class ConversationScoresOut(BaseModel):
    pronunciation: float | None = None
    fluency: float | None = None
    accuracy: float | None = None


class ConversationStatOut(BaseModel):
    id: str
    topic: str
    topic_code: str | None = None
    started_at: datetime
    duration_ms: float | None = None
    avg_score: float | None = None
    user_message_count: int = 0
    scores: ConversationScoresOut | None = None


class ConversationStatsResponse(BaseModel):
    sessions: list[ConversationStatOut]


class PhonemeDetail(BaseModel):
    phoneme: str
    accuracy_score: float | None = None


class WordDetail(BaseModel):
    word_index: int
    word: str
    accuracy_score: float | None = None
    error_type: str | None = None
    start_ms: int | None = None
    duration_ms: int | None = None
    phonemes: list[PhonemeDetail] = []


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
    assistant_audio_url: str | None = None
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


class TopicOut(BaseModel):
    code: str
    title: str
    description: str | None
    difficulty_level: str | None
    sort_order: int


class CategoryWithTopicsOut(BaseModel):
    code: str
    title: str
    sort_order: int
    topics: list[TopicOut]


# ── Flashcard schemas ──────────────────────────────────────────────────────────

from datetime import date as _date


class DeckCreate(BaseModel):
    name: str
    description: str | None = None


class DeckUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class DeckOut(BaseModel):
    id: str
    name: str
    description: str | None
    card_count: int
    due_count: int
    created_at: datetime


class MediaOut(BaseModel):
    id: str
    side: str
    media_type: str
    public_url: str | None
    mime_type: str | None


class CardCreate(BaseModel):
    front_text: str
    back_text: str
    tags: list[str] = []


class CardUpdate(BaseModel):
    front_text: str | None = None
    back_text: str | None = None
    tags: list[str] | None = None


class CardOut(BaseModel):
    id: str
    deck_id: str
    front_text: str
    back_text: str
    tags: list[str]
    created_at: datetime
    media: list[MediaOut] = []


class ReviewSubmit(BaseModel):
    rating: Literal["again", "hard", "good", "easy"]


class ReviewStateOut(BaseModel):
    card_id: str
    due_date: _date
    interval_days: int
    ease_factor: float
    repetitions: int


class DueCardOut(BaseModel):
    id: str
    front_text: str
    back_text: str
    deck_name: str
    due_date: _date
    media: list[MediaOut] = []


class DeckStatsOut(BaseModel):
    total_cards: int
    due_today: int
    learned: int
    retention_rate: float
