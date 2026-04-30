import os

import fakeredis
import pytest

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only!")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")


@pytest.fixture()
def fake_redis():
    """In-memory Redis client for testing — no real Redis needed."""
    return fakeredis.FakeRedis(decode_responses=True)
