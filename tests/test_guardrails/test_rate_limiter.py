import pytest

from app.guardrails.exceptions import GuardrailException
from app.guardrails.input.rate_limiter import RateLimiter


def test_first_request_passes(fake_redis, monkeypatch):
    import app.core.settings as s
    monkeypatch.setattr(s, "RATE_LIMIT_RPM", 5)
    limiter = RateLimiter(redis_client=fake_redis)
    limiter.check("user-1")  # should not raise


def test_requests_within_limit_pass(fake_redis, monkeypatch):
    import app.core.settings as s
    monkeypatch.setattr(s, "RATE_LIMIT_RPM", 3)
    limiter = RateLimiter(redis_client=fake_redis)
    limiter.check("user-2")
    limiter.check("user-2")
    limiter.check("user-2")  # 3rd — exactly at limit, should pass


def test_exceeding_limit_raises_rate_limited(fake_redis, monkeypatch):
    import app.core.settings as s
    monkeypatch.setattr(s, "RATE_LIMIT_RPM", 2)
    limiter = RateLimiter(redis_client=fake_redis)
    limiter.check("user-3")
    limiter.check("user-3")
    with pytest.raises(GuardrailException) as exc_info:
        limiter.check("user-3")  # 3rd request, limit is 2
    assert exc_info.value.code == "RATE_LIMITED"
    assert exc_info.value.retry_after is not None


def test_different_users_have_independent_limits(fake_redis, monkeypatch):
    import app.core.settings as s
    monkeypatch.setattr(s, "RATE_LIMIT_RPM", 1)
    limiter = RateLimiter(redis_client=fake_redis)
    limiter.check("user-a")  # user-a: 1st request, passes
    limiter.check("user-b")  # user-b: 1st request, passes
    with pytest.raises(GuardrailException):
        limiter.check("user-a")  # user-a: 2nd request, blocked


def test_redis_key_is_user_scoped(fake_redis, monkeypatch):
    import app.core.settings as s
    monkeypatch.setattr(s, "RATE_LIMIT_RPM", 10)
    limiter = RateLimiter(redis_client=fake_redis)
    limiter.check("user-x")
    assert fake_redis.get("ratelimit:user-x") == "1"
