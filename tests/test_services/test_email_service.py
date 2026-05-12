import os
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")

from app.services.email_service import PasswordResetEmailDeliveryError, send_password_reset_email


def _patch_settings(**overrides):
    defaults = {
        "app.services.email_service.RESEND_API_KEY": "re_test_key",
        "app.services.email_service.EMAIL_FROM": "noreply@example.com",
        "app.services.email_service.EMAIL_FROM_NAME": "English Speaking Agent",
    }
    defaults.update(overrides)
    return [patch(k, v) for k, v in defaults.items()]


def test_send_calls_resend_with_correct_fields():
    mock_send = MagicMock(return_value={"id": "abc123"})
    patches = _patch_settings()
    with patch("resend.Emails.send", mock_send):
        for p in patches:
            p.start()
        try:
            send_password_reset_email(
                to_email="learner@example.com",
                reset_url="https://app.example.com/reset-password?token=tok1",
                expires_minutes=5,
            )
        finally:
            for p in patches:
                p.stop()

    mock_send.assert_called_once()
    payload = mock_send.call_args.args[0]
    assert payload["to"] == ["learner@example.com"]
    assert payload["subject"] == "Reset your English Speaking Agent password"
    assert "English Speaking Agent <noreply@example.com>" == payload["from"]
    assert "5 minutes" in payload["text"]
    assert "/reset-password?token=tok1" in payload["html"]


def test_html_body_escapes_reset_url():
    mock_send = MagicMock(return_value={"id": "abc123"})
    patches = _patch_settings()
    with patch("resend.Emails.send", mock_send):
        for p in patches:
            p.start()
        try:
            send_password_reset_email(
                to_email="learner@example.com",
                reset_url='https://app.example.com/reset-password?token="abc"&next=<done>',
                expires_minutes=5,
            )
        finally:
            for p in patches:
                p.stop()

    payload = mock_send.call_args.args[0]
    assert '&quot;abc&quot;' in payload["html"]
    assert "&amp;next=&lt;done&gt;" in payload["html"]


def test_resend_failure_raises_delivery_error():
    patches = _patch_settings()
    with patch("resend.Emails.send", side_effect=Exception("network error")):
        for p in patches:
            p.start()
        try:
            with pytest.raises(PasswordResetEmailDeliveryError, match="Failed to send password reset email"):
                send_password_reset_email(
                    to_email="learner@example.com",
                    reset_url="https://app.example.com/reset-password?token=tok2",
                    expires_minutes=5,
                )
        finally:
            for p in patches:
                p.stop()


def test_failure_does_not_log_recipient_email():
    patches = _patch_settings()
    with patch("resend.Emails.send", side_effect=Exception("rejected")), \
         patch("app.services.email_service.logger") as mock_logger:
        for p in patches:
            p.start()
        try:
            with pytest.raises(PasswordResetEmailDeliveryError):
                send_password_reset_email(
                    to_email="learner@example.com",
                    reset_url="https://app.example.com/reset-password?token=tok3",
                    expires_minutes=5,
                )
        finally:
            for p in patches:
                p.stop()

    mock_logger.warning.assert_called_once()
    logged = " ".join(str(a) for a in mock_logger.warning.call_args.args)
    assert "learner@example.com" not in logged
