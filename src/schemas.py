from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


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


class TextChatRequest(BaseModel):
    topic_id: int
    text: str = Field(min_length=1, max_length=20_000)
    model_name: Optional[str] = Field(default=None, max_length=128)
    voice_name: Optional[str] = Field(default=None, max_length=128)


class EvaluationRead(BaseModel):
    message_id: int
    transcript: str | None
    grammar_score: int
    vocabulary_score: int | None
    pronunciation_score: int | None
    corrected_text: str
    feedback: list[str]
    summary: str
    is_mock: bool
    created_at: str


class ChatTurnRead(BaseModel):
    id: int
    user: UserRead
    topic: TopicRead
    role: str
    input_mode: str
    user_input_text: str
    transcript_text: str
    content_text: str
    user_audio_path: str | None
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


class HistoryResponse(BaseModel):
    items: list[ChatTurnRead]


class MessageDetailResponse(BaseModel):
    message: ChatTurnRead
    evaluation: EvaluationRead


class AILogEventIngestRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    tool: str = Field(min_length=1, max_length=64)
    event: str = Field(min_length=1, max_length=128)
    session_id: str = ""
    model: str = ""
    repo: str = ""
    branch: str = ""
    commit: str = ""
    student: str = ""
    payload: dict = Field(default_factory=dict)


class AILogEventRead(BaseModel):
    id: int
    tool: str
    event: str
    session_id: str | None
    model: str | None
    repo: str | None
    branch: str | None
    commit: str | None
    student: str | None
    payload: dict
    created_at: str
