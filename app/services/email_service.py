from __future__ import annotations

import html

import resend

from app.core.logger import logger
from app.core.settings import EMAIL_FROM, EMAIL_FROM_NAME, RESEND_API_KEY


class PasswordResetEmailDeliveryError(RuntimeError):
    pass


def send_password_reset_email(*, to_email: str, reset_url: str, expires_minutes: int) -> None:
    escaped_url = html.escape(reset_url, quote=True)
    plain = (
        "We received a request to reset your English Speaking Agent password.\n\n"
        f"Use this link to continue: {reset_url}\n\n"
        f"This link expires in {expires_minutes} minutes.\n"
        "If you did not request a password reset, you can ignore this email.\n"
    )
    body = (
        "<html><body>"
        "<p>We received a request to reset your English Speaking Agent password.</p>"
        f'<p><a href="{escaped_url}">Reset your password</a></p>'
        f"<p>This link expires in {expires_minutes} minutes.</p>"
        "<p>If you did not request a password reset, you can ignore this email.</p>"
        "</body></html>"
    )

    resend.api_key = RESEND_API_KEY
    try:
        resend.Emails.send({
            "from": f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>",
            "to": [to_email],
            "subject": "Reset your English Speaking Agent password",
            "text": plain,
            "html": body,
        })
    except Exception as exc:
        logger.warning(
            "Failed to send password reset email error_type=%s",
            type(exc).__name__,
        )
        raise PasswordResetEmailDeliveryError("Failed to send password reset email") from exc
