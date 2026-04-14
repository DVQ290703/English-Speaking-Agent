from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class UserRead(BaseModel):
    id: int
    username: str
    display_name: str


class AuthRegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=128)


class AuthLoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class StatusResponse(BaseModel):
    status: str = "ok"


class TopicRead(BaseModel):
    id: int
    slug: str
    title: str
    description: str
    system_prompt: str


class ConfigRead(BaseModel):
    model_name: str
    voice_name: str


class ConfigUpdate(BaseModel):
    value: str = Field(min_length=1, max_length=128)


class PracticeSessionCreateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=128)
    topic_id: Optional[int] = None
    notes: str = Field(default="", max_length=2000)


class PracticeSessionRead(BaseModel):
    id: int
    user_id: int
    topic_id: int | None
    title: str
    notes: str
    status: str
    started_at: str
    ended_at: str | None
    created_at: str
    updated_at: str
    message_count: int = 0
    last_message_at: str | None = None


class PracticeSessionListResponse(BaseModel):
    items: list[PracticeSessionRead]


class PracticeSessionDetailResponse(BaseModel):
    practice_session: PracticeSessionRead
    items: list["ChatTurnRead"]


class TextChatRequest(BaseModel):
    topic_id: int
    text: str = Field(min_length=1, max_length=20_000)
    model_name: Optional[str] = Field(default=None, max_length=128)
    voice_name: Optional[str] = Field(default=None, max_length=128)
    practice_session_id: Optional[int] = None


class EvaluationRead(BaseModel):
    message_id: int
    transcript: str | None
    grammar_score: int
    vocabulary_score: int | None
    fluency_score: int | None
    coherence_score: int | None
    lexical_resource_score: int | None
    pronunciation_score: int | None
    corrected_text: str
    feedback: list[str]
    rubric_version: str
    summary: str
    is_mock: bool
    created_at: str


class ChatTurnRead(BaseModel):
    id: int
    user: UserRead
    topic: TopicRead
    practice_session_id: int | None
    role: str
    input_mode: str
    attempt_no: int
    user_input_text: str
    transcript_text: str
    content_text: str
    user_audio_path: str | None
    duration_seconds: int | None
    word_count: int | None
    pause_count: int | None
    audio_path: str | None
    agent_reply_text: str
    agent_audio_path: str | None
    model_name: str
    voice_name: str
    created_at: str
    evaluation: EvaluationRead | None = None


class ChatResponse(BaseModel):
    message: ChatTurnRead
    evaluation: EvaluationRead
    transcript: str | None
    status: str = "ok"


class MessageListResponse(BaseModel):
    items: list[ChatTurnRead]


class MessageDetailResponse(BaseModel):
    message: ChatTurnRead
    evaluation: EvaluationRead


PracticeSessionDetailResponse.model_rebuild()
