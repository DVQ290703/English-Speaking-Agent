from __future__ import annotations

import json

from app.core import settings
from app.core.logger import get_logger
from app.core.telemetry import span_context
from app.guardrails.exceptions import GuardrailException
from app.guardrails.input.injection import InjectionDetector
from app.guardrails.input.rate_limiter import RateLimiter
from app.guardrails.input.topic_filter import TopicFilter
from app.guardrails.input.validator import InputValidator

_log = get_logger("guardrail")


class InputGuardrails:
    """Orchestrate all input guardrail checks in order: validate → rate-limit → inject → topic."""

    def __init__(
        self,
        validator: InputValidator | None = None,
        rate_limiter: RateLimiter | None = None,
        injection_detector: InjectionDetector | None = None,
        topic_filter: TopicFilter | None = None,
    ):
        self._validator = validator or InputValidator()
        self._rate_limiter = rate_limiter or RateLimiter()
        self._injection_detector = injection_detector or InjectionDetector()
        self._topic_filter = topic_filter or TopicFilter(
            extra_patterns=settings.TOPIC_BLOCKLIST
        )

    def check(self, text: str, user_id: str) -> str:
        """Return normalized text or raise GuardrailException. Order: cheapest first."""
        exc_caught: GuardrailException | None = None
        _passed = False
        try:
            with span_context("guardrail.input", kind="guardrail"):
                text = self._validator.check(text)
                self._rate_limiter.check(user_id)
                self._injection_detector.check(text)
                self._topic_filter.check(text)
            _passed = True
        except GuardrailException as exc:
            exc_caught = exc
            raise
        finally:
            if exc_caught is not None:
                _log.warning(json.dumps({
                    "event": "guardrail.input.check",
                    "result": "block",
                    "code": exc_caught.code,
                    "matched_pattern": exc_caught.reason,
                    "user_id": user_id,
                    "input_length": len(text),
                }))
            elif _passed:
                _log.info(json.dumps({
                    "event": "guardrail.input.check",
                    "result": "pass",
                    "user_id": user_id,
                    "input_length": len(text),
                }))
        return text
