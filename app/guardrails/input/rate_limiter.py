from __future__ import annotations

from app.core import settings
from app.core.logger import logger
from app.guardrails.exceptions import GuardrailException


class RateLimiter:
    """Sliding-window rate limiter backed by Redis. Fail-open if Redis is unavailable."""

    def __init__(self, redis_client=None):
        # Injected in tests; lazily connected in production.
        self._client = redis_client

    def _get_client(self):
        if self._client is None:
            import redis as redis_lib
            self._client = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
        return self._client

    def check(self, user_id: str) -> None:
        """Raise GuardrailException(RATE_LIMITED) if user exceeds RATE_LIMIT_RPM.
        If Redis is unavailable, log a warning and pass through (fail-open).
        """
        try:
            client = self._get_client()
            key = f"ratelimit:{user_id}"
            pipe = client.pipeline()
            pipe.incr(key)
            pipe.ttl(key)
            count, ttl = pipe.execute()
            if count == 1 or ttl < 0:
                client.expire(key, 60)
                ttl = 60
            if count > settings.RATE_LIMIT_RPM:
                raise GuardrailException(
                    code="RATE_LIMITED",
                    reason=f"Rate limit exceeded: {settings.RATE_LIMIT_RPM} req/min",
                    retry_after=ttl if ttl > 0 else 60,
                )
        except GuardrailException:
            raise
        except Exception:
            logger.warning("RateLimiter Redis unavailable — fail open user_id=%s", user_id)
