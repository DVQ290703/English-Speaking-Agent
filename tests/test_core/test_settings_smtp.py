import os
from importlib import reload

import pytest

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")

import app.core.settings as settings_module
from app.core.settings import validate_smtp_settings


@pytest.fixture(autouse=True)
def restore_settings_module():
    yield
    reload(settings_module)


def test_production_requires_smtp_host_username_password_and_from_email():
    with pytest.raises(RuntimeError, match="SMTP_HOST"):
        validate_smtp_settings(
            app_env="production",
            smtp_host="",
            smtp_port=587,
            smtp_username="",
            smtp_password="",
            smtp_from_email="",
            smtp_use_starttls=True,
            smtp_use_ssl=False,
        )


def test_staging_rejects_non_positive_smtp_port():
    with pytest.raises(RuntimeError, match="SMTP_PORT must be greater than 0"):
        validate_smtp_settings(
            app_env="staging",
            smtp_host="smtp.example.com",
            smtp_port=0,
            smtp_username="user",
            smtp_password="pass",
            smtp_from_email="noreply@example.com",
            smtp_use_starttls=True,
            smtp_use_ssl=False,
        )


def test_development_allows_missing_smtp_config():
    validate_smtp_settings(
        app_env="development",
        smtp_host="",
        smtp_port=587,
        smtp_username="",
        smtp_password="",
        smtp_from_email="",
        smtp_use_starttls=False,
        smtp_use_ssl=False,
    )


def test_smtp_use_ssl_and_starttls_cannot_both_be_true():
    with pytest.raises(RuntimeError, match="SMTP_USE_SSL and SMTP_USE_STARTTLS cannot both be true"):
        validate_smtp_settings(
            app_env="development",
            smtp_host="smtp.example.com",
            smtp_port=465,
            smtp_username="user",
            smtp_password="pass",
            smtp_from_email="noreply@example.com",
            smtp_use_starttls=True,
            smtp_use_ssl=True,
        )


def test_smtp_use_starttls_defaults_to_true(monkeypatch):
    monkeypatch.delenv("SMTP_USE_STARTTLS", raising=False)
    monkeypatch.setenv("SMTP_HOST", "")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "")

    settings = reload(settings_module)

    assert settings.SMTP_USE_STARTTLS is True


def test_smtp_enabled_is_true_when_required_delivery_fields_are_present(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "noreply@example.com")

    settings = reload(settings_module)

    assert settings.SMTP_ENABLED is True


def test_smtp_enabled_is_false_when_required_delivery_fields_are_missing(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "")

    settings = reload(settings_module)

    assert settings.SMTP_ENABLED is False
