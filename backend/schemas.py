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
