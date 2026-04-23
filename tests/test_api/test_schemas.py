# tests/test_api/test_schemas.py
"""
Unit tests for app.api.schemas
Covers: LoginRequest, RegisterRequest, UserOut, LoginResponse,
        ChatResponse, MessageOut, ConversationOut,
        ConversationListResponse, ConversationMessagesResponse,
        AssessmentResponse, WordResult
"""

import os
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password")

from app.api.schemas import (
    AssessmentResponse,
    ChatResponse,
    ConversationListResponse,
    ConversationMessagesResponse,
    ConversationOut,
    LoginRequest,
    LoginResponse,
    MessageOut,
    RegisterRequest,
    UserOut,
    WordResult,
)

# ---------------------------------------------------------------------------
# LoginRequest
# ---------------------------------------------------------------------------

class TestLoginRequest:
    def test_login_request_valid(self):
        r = LoginRequest(email="user@example.com", password="pass")
        assert r.email == "user@example.com"

    def test_login_request_invalid_email_raises(self):
        with pytest.raises(ValidationError):
            LoginRequest(email="bad-email", password="pass")

    def test_login_request_missing_password_raises(self):
        with pytest.raises(ValidationError):
            LoginRequest(email="user@example.com")


# ---------------------------------------------------------------------------
# RegisterRequest
# ---------------------------------------------------------------------------

class TestRegisterRequest:
    def test_register_request_minimal_valid(self):
        r = RegisterRequest(email="new@example.com", password="secret")
        assert r.display_name is None
        assert r.english_level is None

    def test_register_request_full_valid(self):
        r = RegisterRequest(
            email="new@example.com",
            password="secret",
            display_name="Alice",
            english_level="B2",
        )
        assert r.display_name == "Alice"
        assert r.english_level == "B2"

    def test_register_request_invalid_email_raises(self):
        with pytest.raises(ValidationError):
            RegisterRequest(email="@@bad", password="secret")


# ---------------------------------------------------------------------------
# UserOut
# ---------------------------------------------------------------------------

class TestUserOut:
    def test_user_out_full(self):
        u = UserOut(id="uid-1", email="u@x.com", display_name="U", english_level="C1")
        assert u.id == "uid-1"

    def test_user_out_nullable_fields(self):
        u = UserOut(id="uid-1", email="u@x.com", display_name=None, english_level=None)
        assert u.display_name is None
        assert u.english_level is None

    def test_user_out_missing_required_raises(self):
        with pytest.raises(ValidationError):
            UserOut(email="u@x.com", display_name=None, english_level=None)


# ---------------------------------------------------------------------------
# LoginResponse
# ---------------------------------------------------------------------------

class TestLoginResponse:
    def _user(self):
        return UserOut(id="u1", email="a@b.com", display_name="A", english_level=None)

    def test_login_response_defaults_token_type_to_bearer(self):
        r = LoginResponse(access_token="tok", expires_in=3600, user=self._user())
        assert r.token_type == "bearer"

    def test_login_response_valid(self):
        r = LoginResponse(access_token="tok", expires_in=3600, user=self._user())
        assert r.access_token == "tok"
        assert r.expires_in == 3600

    def test_login_response_missing_user_raises(self):
        with pytest.raises(ValidationError):
            LoginResponse(access_token="tok", expires_in=3600)


# ---------------------------------------------------------------------------
# ChatResponse
# ---------------------------------------------------------------------------

class TestChatResponse:
    def test_chat_response_defaults(self):
        r = ChatResponse(
            user_input="hi",
            response_text="hello",
            conversation_id="conv-1",
        )
        assert r.audio_base64 == ""
        assert r.audio_mime == "audio/mpeg"
        assert r.user_audio_url is None
        assert r.assistant_audio_url is None

    def test_chat_response_with_audio(self):
        r = ChatResponse(
            user_input="hi",
            response_text="hello",
            audio_base64="base64data",
            conversation_id="conv-1",
        )
        assert r.audio_base64 == "base64data"

    def test_chat_response_missing_conversation_id_raises(self):
        with pytest.raises(ValidationError):
            ChatResponse(user_input="hi", response_text="hello")


# ---------------------------------------------------------------------------
# MessageOut
# ---------------------------------------------------------------------------

class TestMessageOut:
    _now = datetime.now(timezone.utc)

    def test_message_out_valid(self):
        m = MessageOut(
            id="m1",
            role="user",
            input_mode="text",
            text_content="hello",
            created_at=self._now,
        )
        assert m.role == "user"
        assert m.audio_url is None

    def test_message_out_with_audio_url(self):
        m = MessageOut(
            id="m2",
            role="assistant",
            input_mode="text",
            text_content="reply",
            created_at=self._now,
            audio_url="http://minio/audio.mp3",
        )
        assert m.audio_url == "http://minio/audio.mp3"

    def test_message_out_nullable_fields(self):
        m = MessageOut(
            id="m3",
            role="user",
            input_mode=None,
            text_content=None,
            created_at=self._now,
        )
        assert m.input_mode is None
        assert m.text_content is None


# ---------------------------------------------------------------------------
# ConversationOut
# ---------------------------------------------------------------------------

class TestConversationOut:
    _now = datetime.now(timezone.utc)

    def test_conversation_out_valid(self):
        c = ConversationOut(
            id="c1",
            title="Chat",
            status="active",
            started_at=self._now,
            ended_at=None,
            topic_id=None,
        )
        assert c.status == "active"

    def test_conversation_out_missing_required_raises(self):
        with pytest.raises(ValidationError):
            ConversationOut(id="c1", title="Chat", started_at=self._now)


# ---------------------------------------------------------------------------
# ConversationListResponse
# ---------------------------------------------------------------------------

class TestConversationListResponse:
    def test_conversation_list_response_empty(self):
        r = ConversationListResponse(conversations=[])
        assert r.conversations == []

    def test_conversation_list_response_with_items(self):
        now = datetime.now(timezone.utc)
        conv = ConversationOut(
            id="c1", title="T", status="active",
            started_at=now, ended_at=None, topic_id=None
        )
        r = ConversationListResponse(conversations=[conv])
        assert len(r.conversations) == 1


# ---------------------------------------------------------------------------
# ConversationMessagesResponse
# ---------------------------------------------------------------------------

class TestConversationMessagesResponse:
    def test_conversation_messages_response_valid(self):
        now = datetime.now(timezone.utc)
        msg = MessageOut(id="m1", role="user", input_mode="text", text_content="hi", created_at=now)
        r = ConversationMessagesResponse(conversation_id="c1", messages=[msg])
        assert r.conversation_id == "c1"
        assert len(r.messages) == 1

    def test_conversation_messages_response_empty_messages(self):
        r = ConversationMessagesResponse(conversation_id="c1", messages=[])
        assert r.messages == []



# ---------------------------------------------------------------------------
# WordResult
# ---------------------------------------------------------------------------

class TestWordResult:
    def test_word_result_valid(self):
        w = WordResult(
            word="hello",
            accuracy_score=95.0,
            error_type="None",
            syllables=[],
            phonemes=[],
        )
        assert w.word == "hello"
        assert w.accuracy_score == 95.0
        assert w.error_type == "None"

    def test_word_result_with_syllables_and_phonemes(self):
        w = WordResult(
            word="hello",
            accuracy_score=80.0,
            error_type="Mispronunciation",
            syllables=[{"Syllable": "hɛ", "PronunciationAssessment": {"AccuracyScore": 70.0}}],
            phonemes=[{"Phoneme": "h", "PronunciationAssessment": {"AccuracyScore": 98.0}}],
        )
        assert len(w.syllables) == 1
        assert len(w.phonemes) == 1

    def test_word_result_missing_required_raises(self):
        with pytest.raises(ValidationError):
            WordResult(accuracy_score=90.0, error_type="None", syllables=[], phonemes=[])


# ---------------------------------------------------------------------------
# AssessmentResponse
# ---------------------------------------------------------------------------

class TestAssessmentResponse:
    def _word(self):
        return WordResult(word="hi", accuracy_score=90.0, error_type="None", syllables=[], phonemes=[])

    def test_assessment_response_unscripted(self):
        r = AssessmentResponse(
            mode="unscripted",
            recognized_text="Hello.",
            pron_score=91.5,
            accuracy_score=95.0,
            fluency_score=90.0,
            completeness_score=None,
            prosody_score=85.0,
            words=[self._word()],
        )
        assert r.mode == "unscripted"
        assert r.completeness_score is None
        assert r.prosody_score == 85.0

    def test_assessment_response_scripted_includes_completeness(self):
        r = AssessmentResponse(
            mode="scripted",
            recognized_text="Hello.",
            pron_score=91.5,
            accuracy_score=95.0,
            fluency_score=90.0,
            completeness_score=100.0,
            prosody_score=None,
            words=[],
        )
        assert r.completeness_score == 100.0
        assert r.prosody_score is None

    def test_assessment_response_missing_required_raises(self):
        with pytest.raises(ValidationError):
            AssessmentResponse(
                mode="unscripted",
                pron_score=91.5,
                accuracy_score=95.0,
                fluency_score=90.0,
                words=[],
            )
