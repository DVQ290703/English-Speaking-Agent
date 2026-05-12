import os
from importlib import reload

import pytest

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")

import app.core.settings as settings_module
from app.core.settings import validate_email_settings


@pytest.fixture(autouse=True)
def restore_settings_module():
    yield
    reload(settings_module)


def test_production_requires_resend_api_key_and_email_from():
    with pytest.raises(RuntimeError, match="RESEND_API_KEY"):
        validate_email_settings(app_env="production", resend_api_key="", email_from="")


def test_staging_requires_resend_api_key_and_email_from():
    with pytest.raises(RuntimeError, match="RESEND_API_KEY"):
        validate_email_settings(app_env="staging", resend_api_key="", email_from="noreply@example.com")


def test_production_requires_email_from():
    with pytest.raises(RuntimeError, match="EMAIL_FROM"):
        validate_email_settings(app_env="production", resend_api_key="re_test_key", email_from="")


def test_development_allows_missing_config():
    validate_email_settings(app_env="development", resend_api_key="", email_from="")


def test_email_enabled_is_true_when_api_key_and_from_are_set(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")

    settings = reload(settings_module)

    assert settings.EMAIL_ENABLED is True


def test_email_enabled_is_false_when_api_key_is_missing(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")

    settings = reload(settings_module)

    assert settings.EMAIL_ENABLED is False


def test_email_from_name_defaults_to_app_name(monkeypatch):
    monkeypatch.delenv("EMAIL_FROM_NAME", raising=False)

    settings = reload(settings_module)

    assert settings.EMAIL_FROM_NAME == "English Speaking Agent"
