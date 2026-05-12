import html
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from app.core.logger import logger
from app.core.settings import (
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_TIMEOUT_SECONDS,
    SMTP_USERNAME,
    SMTP_USE_SSL,
    SMTP_USE_STARTTLS,
)


class PasswordResetEmailDeliveryError(RuntimeError):
    pass


def _build_password_reset_email(*, to_email: str, reset_url: str, expires_minutes: int) -> EmailMessage:
    escaped_reset_url = html.escape(reset_url, quote=True)
    message = EmailMessage()
    message["Subject"] = "Reset your English Speaking Agent password"
    message["From"] = formataddr((SMTP_FROM_NAME, SMTP_FROM_EMAIL))
    message["To"] = to_email

    plain_body = (
        "We received a request to reset your English Speaking Agent password.\n\n"
        f"Use this link to continue: {reset_url}\n\n"
        f"This link expires in {expires_minutes} minutes.\n"
        "If you did not request a password reset, you can ignore this email.\n"
    )
    html_body = (
        "<html><body>"
        "<p>We received a request to reset your English Speaking Agent password.</p>"
        f'<p><a href="{escaped_reset_url}">Reset your password</a></p>'
        f"<p>This link expires in {expires_minutes} minutes.</p>"
        "<p>If you did not request a password reset, you can ignore this email.</p>"
        "</body></html>"
    )

    message.set_content(plain_body)
    message.add_alternative(html_body, subtype="html")
    return message


def _login_if_needed(client: smtplib.SMTP) -> None:
    if SMTP_USERNAME:
        client.login(SMTP_USERNAME, SMTP_PASSWORD)


def send_password_reset_email(*, to_email: str, reset_url: str, expires_minutes: int) -> None:
    message = _build_password_reset_email(
        to_email=to_email,
        reset_url=reset_url,
        expires_minutes=expires_minutes,
    )

    try:
        context = ssl.create_default_context()
        if SMTP_USE_SSL:
            with smtplib.SMTP_SSL(
                SMTP_HOST,
                SMTP_PORT,
                timeout=SMTP_TIMEOUT_SECONDS,
                context=context,
            ) as client:
                _login_if_needed(client)
                client.send_message(message)
            return

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS) as client:
            if SMTP_USE_STARTTLS:
                client.starttls(context=context)
            _login_if_needed(client)
            client.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        transport = "ssl" if SMTP_USE_SSL else "starttls" if SMTP_USE_STARTTLS else "plain"
        logger.warning(
            "Failed to send password reset email provider=%s transport=%s error_type=%s",
            SMTP_HOST,
            transport,
            type(exc).__name__,
        )
        raise PasswordResetEmailDeliveryError("Failed to send password reset email") from exc
