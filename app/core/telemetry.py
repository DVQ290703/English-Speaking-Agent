"""
Trace context propagation and span emission.

Usage:
    from app.core.telemetry import span_context, set_trace_context, update_session_id

    # In middleware:
    set_trace_context(trace_id="...", user_id="...")

    # In service methods:
    with span_context("llm.generate_response", kind="llm") as span:
        result = client.invoke(...)
        span.set(model="llama-3.3-70b-versatile", prompt_tokens=50, completion_tokens=100)
"""

from __future__ import annotations

import datetime
import json
import time
import traceback
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Generator

from app.core.settings import APP_ENV

# ---------------------------------------------------------------------------
# Context variables — async-safe, request-scoped
# ---------------------------------------------------------------------------

_trace_id_var: ContextVar[str] = ContextVar("trace_id", default="")
_session_id_var: ContextVar[str] = ContextVar("session_id", default="")
_user_id_var: ContextVar[str] = ContextVar("user_id", default="anonymous")
_msg_id_var: ContextVar[str] = ContextVar("msg_id", default="")


def set_trace_context(trace_id: str, user_id: str = "anonymous") -> None:
    """Called by middleware at request start. session_id defaults to trace_id."""
    _trace_id_var.set(trace_id)
    _session_id_var.set(trace_id)
    _user_id_var.set(user_id)


def update_session_id(session_id: str) -> None:
    """Called in the route handler once conversation_id is resolved."""
    _session_id_var.set(session_id)


def set_msg_id(msg_id: str) -> None:
    """Called before LLM/TTS pipeline to tag spans with the assistant message ID."""
    _msg_id_var.set(msg_id)


def get_trace_context() -> dict:
    return {
        "trace_id": _trace_id_var.get() or str(uuid.uuid4()),
        "session_id": _session_id_var.get() or "",
        "user_id": _user_id_var.get() or "anonymous",
        "msg_id": _msg_id_var.get() or None,
        "environment": APP_ENV,
    }


def clear_trace_context() -> None:
    _trace_id_var.set("")
    _session_id_var.set("")
    _user_id_var.set("anonymous")
    _msg_id_var.set("")


# ---------------------------------------------------------------------------
# Model cost table — USD per 1M tokens (input, output)
# ---------------------------------------------------------------------------

_LLM_PRICING: dict[str, dict[str, float]] = {
    "llama-3.3-70b-versatile": {"input": 0.59, "output": 0.79},
    "llama-3.1-8b-instant": {"input": 0.05, "output": 0.08},
    "llama3-70b-8192": {"input": 0.59, "output": 0.79},
    "llama3-8b-8192": {"input": 0.05, "output": 0.08},
}


def _estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    pricing = _LLM_PRICING.get(model)
    if not pricing:
        return 0.0
    return (prompt_tokens * pricing["input"] + completion_tokens * pricing["output"]) / 1_000_000


# ---------------------------------------------------------------------------
# SpanData — carries extra fields set inside the `with` block
# ---------------------------------------------------------------------------

class _SpanData:
    def __init__(self) -> None:
        self.extra: dict = {}
        self._failed: bool = False
        self._error_message: str = ""

    def set(self, **kwargs) -> None:
        """Set span-specific fields: model, prompt_tokens, completion_tokens, etc."""
        self.extra.update(kwargs)

    def fail(self, message: str = "") -> None:
        """Mark this span as failed without raising an exception."""
        self._failed = True
        self._error_message = message


# ---------------------------------------------------------------------------
# span_context — core instrumentation primitive
# ---------------------------------------------------------------------------

@contextmanager
def span_context(name: str, kind: str) -> Generator[_SpanData, None, None]:
    """
    Context manager that times a block, emits a structured JSON span log,
    and updates Prometheus metrics on exit.

    Args:
        name: Dot-notation span name, e.g. "llm.generate_response"
        kind: One of "llm", "stt", "tts", "guardrail", "api"

    Example:
        with span_context("stt.transcribe", kind="stt") as span:
            result = stt_client.transcribe(audio_bytes)
            span.set(model="whisper-large-v3-turbo", audio_bytes=len(audio_bytes))
    """
    from app.core.metrics import record_span_metrics  # deferred to avoid circular import

    start = time.monotonic()
    span = _SpanData()
    try:
        yield span
        duration_ms = int((time.monotonic() - start) * 1000)
        if span._failed:
            error_extra = {**span.extra, "exception_message": span._error_message}
            _emit_span(name, kind, duration_ms, "error", error_extra)
            record_span_metrics(name, kind, duration_ms, "error", error_extra)
        else:
            _emit_span(name, kind, duration_ms, "ok", span.extra)
            record_span_metrics(name, kind, duration_ms, "ok", span.extra)
    except Exception as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        error_extra = {
            **span.extra,
            "exception_type": type(exc).__name__,
            "exception_message": str(exc),
            "stack_trace": traceback.format_exc(),
        }
        _emit_span(name, kind, duration_ms, "error", error_extra)
        record_span_metrics(name, kind, duration_ms, "error", error_extra)
        raise


# ---------------------------------------------------------------------------
# Internal span emission
# ---------------------------------------------------------------------------

def _emit_span(name: str, kind: str, duration_ms: int, status: str, extra: dict) -> None:
    """Write a single structured JSON span entry via the app logger."""
    import logging  # use stdlib directly to avoid IndustryLogger circular dep

    ctx = get_trace_context()
    model = extra.get("model")
    prompt_tokens = extra.get("prompt_tokens") or 0
    completion_tokens = extra.get("completion_tokens") or 0
    total_tokens = extra.get("total_tokens") or (prompt_tokens + completion_tokens) or None
    cost = _estimate_cost(model or "", prompt_tokens, completion_tokens) if kind == "llm" else None

    # Strip fields already promoted to top-level from extra
    _top_level = {"model", "prompt_tokens", "completion_tokens", "total_tokens",
                  "exception_type", "exception_message", "stack_trace"}
    remaining_extra = {k: v for k, v in extra.items() if k not in _top_level}

    payload = {
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "level": "ERROR" if status == "error" else "INFO",
        "environment": ctx["environment"],
        "trace_id": ctx["trace_id"],
        "session_id": ctx["session_id"],
        "user_id": ctx["user_id"],
        "msg_id": ctx["msg_id"],
        "span_name": name,
        "span_kind": kind,
        "duration_ms": duration_ms,
        "status": status,
        "model": model,
        "prompt_tokens": prompt_tokens or None,
        "completion_tokens": completion_tokens or None,
        "total_tokens": total_tokens,
        "estimated_cost_usd": round(cost, 8) if cost else None,
        "error": extra.get("exception_message") if status == "error" else None,
        "extra": remaining_extra or None,
    }

    _log = logging.getLogger("AI-Lab-Agent")
    level = logging.ERROR if status == "error" else logging.INFO
    _log.log(level, json.dumps(payload, ensure_ascii=False))
