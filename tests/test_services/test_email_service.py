import os
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")

from app.services.email_service import PasswordResetEmailDeliveryError, send_password_reset_email


def test_starttls_path_logs_in_and_sends_a_message():
    with patch("app.services.email_service.SMTP_HOST", "smtp.example.com"), \
        patch("app.services.email_service.SMTP_PORT", 587), \
        patch("app.services.email_service.SMTP_USERNAME", "smtp-user"), \
        patch("app.services.email_service.SMTP_PASSWORD", "smtp-pass"), \
        patch("app.services.email_service.SMTP_FROM_EMAIL", "noreply@example.com"), \
        patch("app.services.email_service.SMTP_FROM_NAME", "English Speaking Agent"), \
        patch("app.services.email_service.SMTP_USE_STARTTLS", True), \
        patch("app.services.email_service.SMTP_USE_SSL", False), \
        patch("app.services.email_service.SMTP_TIMEOUT_SECONDS", 15), \
        patch("app.services.email_service.ssl.create_default_context", return_value="tls-context"), \
        patch("app.services.email_service.smtplib.SMTP") as smtp_cls:
        client = MagicMock()
        smtp_cls.return_value.__enter__.return_value = client

        send_password_reset_email(
            to_email="learner@example.com",
            reset_url="https://frontend.example.com/reset-password?token=abc123",
            expires_minutes=5,
        )

    smtp_cls.assert_called_once_with("smtp.example.com", 587, timeout=15)
    client.starttls.assert_called_once_with(context="tls-context")
    client.login.assert_called_once_with("smtp-user", "smtp-pass")
    client.send_message.assert_called_once()

    message = client.send_message.call_args.args[0]
    assert message["Subject"] == "Reset your English Speaking Agent password"
    plain_body = message.get_body(preferencelist=("plain",)).get_content()
    html_body = message.get_body(preferencelist=("html",)).get_content()
    assert "5 minutes" in plain_body
    assert "/reset-password?token=abc123" in html_body


def test_ssl_path_uses_smtp_ssl_and_does_not_call_starttls():
    with patch("app.services.email_service.SMTP_HOST", "smtp.example.com"), \
        patch("app.services.email_service.SMTP_PORT", 465), \
        patch("app.services.email_service.SMTP_USERNAME", "smtp-user"), \
        patch("app.services.email_service.SMTP_PASSWORD", "smtp-pass"), \
        patch("app.services.email_service.SMTP_FROM_EMAIL", "noreply@example.com"), \
        patch("app.services.email_service.SMTP_FROM_NAME", "English Speaking Agent"), \
        patch("app.services.email_service.SMTP_USE_STARTTLS", False), \
        patch("app.services.email_service.SMTP_USE_SSL", True), \
        patch("app.services.email_service.SMTP_TIMEOUT_SECONDS", 20), \
        patch("app.services.email_service.ssl.create_default_context", return_value="ssl-context"), \
        patch("app.services.email_service.smtplib.SMTP_SSL") as smtp_ssl_cls, \
        patch("app.services.email_service.smtplib.SMTP") as smtp_cls:
        client = MagicMock()
        smtp_ssl_cls.return_value.__enter__.return_value = client

        send_password_reset_email(
            to_email="learner@example.com",
            reset_url="https://frontend.example.com/reset-password?token=def456",
            expires_minutes=5,
        )

    smtp_ssl_cls.assert_called_once_with("smtp.example.com", 465, timeout=20, context="ssl-context")
    smtp_cls.assert_not_called()
    client.starttls.assert_not_called()
    client.login.assert_called_once_with("smtp-user", "smtp-pass")
    client.send_message.assert_called_once()

    message = client.send_message.call_args.args[0]
    assert message["Subject"] == "Reset your English Speaking Agent password"
    plain_body = message.get_body(preferencelist=("plain",)).get_content()
    html_body = message.get_body(preferencelist=("html",)).get_content()
    assert "5 minutes" in plain_body
    assert "/reset-password?token=def456" in html_body


def test_network_or_smtp_failure_raises_password_reset_email_delivery_error():
    with patch("app.services.email_service.SMTP_HOST", "smtp.example.com"), \
        patch("app.services.email_service.SMTP_PORT", 587), \
        patch("app.services.email_service.SMTP_USERNAME", "smtp-user"), \
        patch("app.services.email_service.SMTP_PASSWORD", "smtp-pass"), \
        patch("app.services.email_service.SMTP_FROM_EMAIL", "noreply@example.com"), \
        patch("app.services.email_service.SMTP_FROM_NAME", "English Speaking Agent"), \
        patch("app.services.email_service.SMTP_USE_STARTTLS", True), \
        patch("app.services.email_service.SMTP_USE_SSL", False), \
        patch("app.services.email_service.SMTP_TIMEOUT_SECONDS", 15), \
        patch("app.services.email_service.ssl.create_default_context", return_value="tls-context"), \
        patch("app.services.email_service.logger") as logger_mock, \
        patch("app.services.email_service.smtplib.SMTP") as smtp_cls:
        client = MagicMock()
        client.send_message.side_effect = OSError("network down")
        smtp_cls.return_value.__enter__.return_value = client

        with pytest.raises(
            PasswordResetEmailDeliveryError,
            match="Failed to send password reset email",
        ):
            send_password_reset_email(
                to_email="learner@example.com",
                reset_url="https://frontend.example.com/reset-password?token=ghi789",
                expires_minutes=5,
            )

    logger_mock.warning.assert_called_once()
    warning_args = logger_mock.warning.call_args.args
    assert "learner@example.com" not in " ".join(str(arg) for arg in warning_args)


def test_smtp_exception_raises_password_reset_email_delivery_error():
    with patch("app.services.email_service.SMTP_HOST", "smtp.example.com"), \
        patch("app.services.email_service.SMTP_PORT", 587), \
        patch("app.services.email_service.SMTP_USERNAME", "smtp-user"), \
        patch("app.services.email_service.SMTP_PASSWORD", "smtp-pass"), \
        patch("app.services.email_service.SMTP_FROM_EMAIL", "noreply@example.com"), \
        patch("app.services.email_service.SMTP_FROM_NAME", "English Speaking Agent"), \
        patch("app.services.email_service.SMTP_USE_STARTTLS", True), \
        patch("app.services.email_service.SMTP_USE_SSL", False), \
        patch("app.services.email_service.SMTP_TIMEOUT_SECONDS", 15), \
        patch("app.services.email_service.ssl.create_default_context", return_value="tls-context"), \
        patch("app.services.email_service.logger") as logger_mock, \
        patch("app.services.email_service.smtplib.SMTP") as smtp_cls:
        client = MagicMock()
        client.send_message.side_effect = __import__("smtplib").SMTPException("smtp failure")
        smtp_cls.return_value.__enter__.return_value = client

        with pytest.raises(
            PasswordResetEmailDeliveryError,
            match="Failed to send password reset email",
        ):
            send_password_reset_email(
                to_email="learner@example.com",
                reset_url="https://frontend.example.com/reset-password?token=ghi789",
                expires_minutes=5,
            )

    logger_mock.warning.assert_called_once()
    warning_args = logger_mock.warning.call_args.args
    assert "learner@example.com" not in " ".join(str(arg) for arg in warning_args)


def test_smtp_recipients_refused_does_not_log_recipient_pii():
    with patch("app.services.email_service.SMTP_HOST", "smtp.example.com"), \
        patch("app.services.email_service.SMTP_PORT", 587), \
        patch("app.services.email_service.SMTP_USERNAME", "smtp-user"), \
        patch("app.services.email_service.SMTP_PASSWORD", "smtp-pass"), \
        patch("app.services.email_service.SMTP_FROM_EMAIL", "noreply@example.com"), \
        patch("app.services.email_service.SMTP_FROM_NAME", "English Speaking Agent"), \
        patch("app.services.email_service.SMTP_USE_STARTTLS", True), \
        patch("app.services.email_service.SMTP_USE_SSL", False), \
        patch("app.services.email_service.SMTP_TIMEOUT_SECONDS", 15), \
        patch("app.services.email_service.ssl.create_default_context", return_value="tls-context"), \
        patch("app.services.email_service.logger") as logger_mock, \
        patch("app.services.email_service.smtplib.SMTP") as smtp_cls:
        client = MagicMock()
        client.send_message.side_effect = __import__("smtplib").SMTPRecipientsRefused(
            {"learner@example.com": (550, b"user unknown")}
        )
        smtp_cls.return_value.__enter__.return_value = client

        with pytest.raises(
            PasswordResetEmailDeliveryError,
            match="Failed to send password reset email",
        ):
            send_password_reset_email(
                to_email="learner@example.com",
                reset_url="https://frontend.example.com/reset-password?token=ghi789",
                expires_minutes=5,
            )

    logger_mock.warning.assert_called_once()
    warning_args = logger_mock.warning.call_args.args
    assert "learner@example.com" not in " ".join(str(arg) for arg in warning_args)


def test_empty_smtp_username_does_not_call_login():
    with patch("app.services.email_service.SMTP_HOST", "smtp.example.com"), \
        patch("app.services.email_service.SMTP_PORT", 587), \
        patch("app.services.email_service.SMTP_USERNAME", ""), \
        patch("app.services.email_service.SMTP_PASSWORD", "smtp-pass"), \
        patch("app.services.email_service.SMTP_FROM_EMAIL", "noreply@example.com"), \
        patch("app.services.email_service.SMTP_FROM_NAME", "English Speaking Agent"), \
        patch("app.services.email_service.SMTP_USE_STARTTLS", True), \
        patch("app.services.email_service.SMTP_USE_SSL", False), \
        patch("app.services.email_service.SMTP_TIMEOUT_SECONDS", 15), \
        patch("app.services.email_service.ssl.create_default_context", return_value="tls-context"), \
        patch("app.services.email_service.smtplib.SMTP") as smtp_cls:
        client = MagicMock()
        smtp_cls.return_value.__enter__.return_value = client

        send_password_reset_email(
            to_email="learner@example.com",
            reset_url="https://frontend.example.com/reset-password?token=abc123",
            expires_minutes=5,
        )

    client.login.assert_not_called()


def test_html_body_escapes_reset_url_in_anchor_href():
    with patch("app.services.email_service.SMTP_FROM_EMAIL", "noreply@example.com"), \
        patch("app.services.email_service.SMTP_FROM_NAME", "English Speaking Agent"), \
        patch("app.services.email_service.SMTP_HOST", "smtp.example.com"), \
        patch("app.services.email_service.SMTP_PORT", 587), \
        patch("app.services.email_service.SMTP_USERNAME", ""), \
        patch("app.services.email_service.SMTP_PASSWORD", ""), \
        patch("app.services.email_service.SMTP_USE_STARTTLS", True), \
        patch("app.services.email_service.SMTP_USE_SSL", False), \
        patch("app.services.email_service.SMTP_TIMEOUT_SECONDS", 15), \
        patch("app.services.email_service.smtplib.SMTP") as smtp_cls:
        client = MagicMock()
        smtp_cls.return_value.__enter__.return_value = client

        send_password_reset_email(
            to_email="learner@example.com",
            reset_url='https://frontend.example.com/reset-password?token="abc"&next=<done>',
            expires_minutes=5,
        )

    message = client.send_message.call_args.args[0]
    html_body = message.get_body(preferencelist=("html",)).get_content()
    assert 'href="https://frontend.example.com/reset-password?token=&quot;abc&quot;&amp;next=&lt;done&gt;"' in html_body
