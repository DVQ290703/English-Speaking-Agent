from datetime import datetime

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str | None = None
    english_level: str | None = None


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
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


class MessageOut(BaseModel):
    id: str
    role: str
    input_mode: str | None
    text_content: str | None
    created_at: datetime
    audio_url: str | None = None  # presigned URL, generated on demand


class ConversationOut(BaseModel):
    id: str
    title: str | None
    status: str
    started_at: datetime
    ended_at: datetime | None
    topic_id: str | None


class ConversationListResponse(BaseModel):
    conversations: list[ConversationOut]


class ConversationMessagesResponse(BaseModel):
    conversation_id: str
    messages: list[MessageOut]
