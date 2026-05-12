from __future__ import annotations

import json

from app.core import settings
from app.core.logger import get_logger
from app.core.telemetry import span_context
from app.guardrails.exceptions import GuardrailException
from app.guardrails.input.rate_limiter import RateLimiter
from app.guardrails.input.validator import InputValidator

_log = get_logger("guardrail")


class InputGuardrails:
    """Orchestrate input guardrail checks: validate → rate-limit.

    Topic safety and injection detection are handled contextually by the
    AI guardrail node inside the LangGraph pipeline (see app/agents/pipeline.py).
    """

    def __init__(
        self,
        validator: InputValidator | None = None,
        rate_limiter: RateLimiter | None = None,
    ):
        self._validator = validator or InputValidator()
        self._rate_limiter = rate_limiter or RateLimiter()

    def check(self, text: str, user_id: str) -> str:
        """Return normalized text or raise GuardrailException. Order: cheapest first."""
        exc_caught: GuardrailException | None = None
        _passed = False
        try:
            with span_context("guardrail.input", kind="guardrail"):
                text = self._validator.check(text)
                self._rate_limiter.check(user_id)
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
