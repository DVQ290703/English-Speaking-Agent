# Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured JSON tracing, Prometheus metrics, and trace-context propagation to every LLM/STT/TTS/guardrail call without modifying business logic.

**Architecture:** Python `contextvars` propagates `trace_id`/`session_id`/`user_id` for the lifetime of each request. A `span_context()` context manager wraps service calls, emitting a JSON span log and updating Prometheus counters/histograms on exit. A FastAPI middleware generates `trace_id` and seeds the context.

**Tech Stack:** `prometheus-client`, `prometheus-fastapi-instrumentator`, Python `contextvars`, `contextlib`, existing `IndustryLogger`, LangChain `usage_metadata`

---

## File Map

**New files:**
- `app/core/telemetry.py` — TraceContext via contextvars, `span_context()` CM, `_emit_span()`, cost lookup
- `app/core/metrics.py` — All Prometheus counters and histograms, `record_span_metrics()`

**Modified files:**
- `requirements.txt` — add `prometheus-client`, `prometheus-fastapi-instrumentator`
- `app/main.py` — add trace middleware + Prometheus instrumentator
- `app/services/groq_llm.py` — wrap LLM invoke calls in `span_context`
- `app/services/groq_stt.py` — wrap `transcribe()` in `span_context`
- `app/services/elevenlabs_tts.py` — wrap `convert_text_to_speech()` in `span_context`
- `app/services/azure_assessment.py` — wrap `assess()` in `span_context`
- `app/guardrails/audit/logger.py` — inject `trace_id`, `session_id` into audit events
- `app/guardrails/input/__init__.py` — wrap `InputGuardrails.check()` in `span_context`
- `app/guardrails/output/__init__.py` — wrap `OutputGuardrails.check()` in `span_context`
- `app/api/chat.py` — call `update_session_id(conv_id)` once conversation is resolved

---

## Task 1: Add dependencies

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add the two new packages**

In `requirements.txt`, add two lines at the end:

```
prometheus-client
prometheus-fastapi-instrumentator
```

- [ ] **Step 2: Commit**

```bash
git add requirements.txt
git commit -m "chore: add prometheus-client and prometheus-fastapi-instrumentator"
```

---

## Task 2: Create `app/core/telemetry.py`

**Files:**
- Create: `app/core/telemetry.py`

- [ ] **Step 1: Create the file**

```python
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


def set_trace_context(trace_id: str, user_id: str = "anonymous") -> None:
    """Called by middleware at request start. session_id defaults to trace_id."""
    _trace_id_var.set(trace_id)
    _session_id_var.set(trace_id)
    _user_id_var.set(user_id)


def update_session_id(session_id: str) -> None:
    """Called in the route handler once conversation_id is resolved."""
    _session_id_var.set(session_id)


def get_trace_context() -> dict:
    return {
        "trace_id": _trace_id_var.get() or str(uuid.uuid4()),
        "session_id": _session_id_var.get() or "",
        "user_id": _user_id_var.get() or "anonymous",
        "environment": APP_ENV,
    }


def clear_trace_context() -> None:
    _trace_id_var.set("")
    _session_id_var.set("")
    _user_id_var.set("anonymous")


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

    def set(self, **kwargs) -> None:
        """Set span-specific fields: model, prompt_tokens, completion_tokens, etc."""
        self.extra.update(kwargs)


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
```

- [ ] **Step 2: Commit**

```bash
git add app/core/telemetry.py
git commit -m "feat(observability): add telemetry module with trace context and span_context"
```

---

## Task 3: Create `app/core/metrics.py`

**Files:**
- Create: `app/core/metrics.py`

- [ ] **Step 1: Create the file**

```python
"""
Prometheus metrics registry.

All counters and histograms are registered once at import time.
`record_span_metrics()` is called by telemetry.span_context on every span exit.
"""

from prometheus_client import Counter, Histogram

# ---------------------------------------------------------------------------
# LLM metrics
# ---------------------------------------------------------------------------

llm_requests_total = Counter(
    "llm_requests_total",
    "Total LLM API requests",
    ["model", "endpoint", "status"],
)
llm_tokens_total = Counter(
    "llm_tokens_total",
    "Total LLM tokens processed",
    ["model", "token_type"],  # token_type: input | output
)
llm_cost_usd_total = Counter(
    "llm_cost_usd_total",
    "Cumulative estimated LLM cost in USD",
    ["model", "endpoint"],
)
llm_latency_seconds = Histogram(
    "llm_latency_seconds",
    "LLM call end-to-end latency in seconds",
    ["model", "endpoint"],
    buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0],
)

# ---------------------------------------------------------------------------
# STT metrics
# ---------------------------------------------------------------------------

stt_requests_total = Counter(
    "stt_requests_total",
    "Total speech-to-text requests",
    ["model", "status"],
)
stt_latency_seconds = Histogram(
    "stt_latency_seconds",
    "STT call latency in seconds",
    ["model"],
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
)

# ---------------------------------------------------------------------------
# TTS metrics
# ---------------------------------------------------------------------------

tts_requests_total = Counter(
    "tts_requests_total",
    "Total text-to-speech requests",
    ["model", "status"],
)
tts_latency_seconds = Histogram(
    "tts_latency_seconds",
    "TTS call latency in seconds",
    ["model"],
    buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 15.0],
)

# ---------------------------------------------------------------------------
# Guardrail metrics
# ---------------------------------------------------------------------------

guardrail_decisions_total = Counter(
    "guardrail_decisions_total",
    "Guardrail check outcomes",
    ["check_name", "decision"],  # decision: allowed | blocked
)

# ---------------------------------------------------------------------------
# Placeholder metrics — registered but never updated until feature ships
# ---------------------------------------------------------------------------

answer_relevance_score = Histogram(
    "answer_relevance_score",
    "[PLACEHOLDER] LLM-as-judge answer relevance score (0-1)",
    ["model"],
    buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
)
hallucination_rate_total = Counter(
    "hallucination_rate_total",
    "[PLACEHOLDER] Hallucination detections (LLM-as-judge)",
    ["model"],
)


# ---------------------------------------------------------------------------
# Metrics update — called by telemetry.span_context on every span exit
# ---------------------------------------------------------------------------

def record_span_metrics(name: str, kind: str, duration_ms: int, status: str, extra: dict) -> None:
    """Update the appropriate Prometheus metrics for a completed span."""
    duration_s = duration_ms / 1000.0
    model = extra.get("model", "unknown") or "unknown"

    if kind == "llm":
        llm_requests_total.labels(model=model, endpoint=name, status=status).inc()
        llm_latency_seconds.labels(model=model, endpoint=name).observe(duration_s)
        prompt_tokens = extra.get("prompt_tokens") or 0
        completion_tokens = extra.get("completion_tokens") or 0
        if prompt_tokens:
            llm_tokens_total.labels(model=model, token_type="input").inc(prompt_tokens)
        if completion_tokens:
            llm_tokens_total.labels(model=model, token_type="output").inc(completion_tokens)
        cost = extra.get("estimated_cost_usd") or 0.0
        if cost:
            llm_cost_usd_total.labels(model=model, endpoint=name).inc(cost)

    elif kind == "stt":
        stt_requests_total.labels(model=model, status=status).inc()
        stt_latency_seconds.labels(model=model).observe(duration_s)

    elif kind == "tts":
        tts_requests_total.labels(model=model, status=status).inc()
        tts_latency_seconds.labels(model=model).observe(duration_s)

    elif kind == "guardrail":
        check_name = name.split(".")[-1]  # e.g. "guardrail.input" → "input"
        decision = "blocked" if status == "error" else "allowed"
        guardrail_decisions_total.labels(check_name=check_name, decision=decision).inc()
```

- [ ] **Step 2: Commit**

```bash
git add app/core/metrics.py
git commit -m "feat(observability): add Prometheus metrics registry"
```

---

## Task 4: Add trace middleware and Prometheus to `app/main.py`

**Files:**
- Modify: `app/main.py`

- [ ] **Step 1: Replace the contents of `app/main.py`**

The full new file (adds trace middleware before security headers, and Prometheus instrumentator after app creation):

```python
from contextlib import asynccontextmanager

import jwt as pyjwt
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.api.router import router
from app.core.database import init_db_pool
from app.core.logger import logger
from app.core.settings import CORS_ORIGINS, JWT_ALGORITHM, JWT_SECRET_KEY
from app.core.storage import init_storage
from app.core.telemetry import clear_trace_context, set_trace_context


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks before accepting requests."""
    logger.info("Initializing DB pool and storage...")
    init_db_pool()
    init_storage()
    logger.info("Startup complete - ready to accept requests")
    yield
    logger.info("Shutting down")


app = FastAPI(title="Voice Agent API", version="1.0.0", lifespan=lifespan)

# Expose /metrics for Prometheus scraping
Instrumentator().instrument(app).expose(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "microphone=(self)")
    sensitive_prefixes = ("/api/auth/", "/api/chat/")
    if any(request.url.path.startswith(p) for p in sensitive_prefixes):
        response.headers.setdefault("Cache-Control", "no-store")
    if request.url.scheme == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.middleware("http")
async def add_trace_context(request: Request, call_next):
    """Generate trace_id per request and seed trace context. Outermost middleware."""
    import uuid
    trace_id = str(uuid.uuid4())

    # Best-effort user_id extraction from JWT — never blocks the request
    user_id = "anonymous"
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            payload = pyjwt.decode(
                auth[7:], JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM],
                options={"verify_exp": False},
            )
            user_id = payload.get("sub", "anonymous") or "anonymous"
        except Exception:
            pass

    set_trace_context(trace_id=trace_id, user_id=user_id)
    try:
        response = await call_next(request)
        response.headers["X-Trace-ID"] = trace_id
        return response
    finally:
        clear_trace_context()


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(router)
```

- [ ] **Step 2: Commit**

```bash
git add app/main.py
git commit -m "feat(observability): add trace middleware and Prometheus /metrics endpoint"
```

---

## Task 5: Instrument `groq_llm.py`

**Files:**
- Modify: `app/services/groq_llm.py`

- [ ] **Step 1: Replace the contents of `app/services/groq_llm.py`**

```python
"""Groq LLM service — generates speech-friendly responses via ChatGroq."""

import json
import os
from pathlib import Path

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from app.core.logger import logger
from app.core.telemetry import span_context
from app.prompts.prompt_builder import build_system_prompt

_PROMPT_PATH = Path(__file__).resolve().parents[1] / "prompts" / "system_prompt.md"


def load_system_prompt() -> str:
    """Load the assistant system prompt from markdown with a safe inline fallback."""
    try:
        text = _PROMPT_PATH.read_text(encoding="utf-8").strip()
        if text:
            logger.info("System prompt loaded from %s (%d chars)", _PROMPT_PATH, len(text))
            return text
    except OSError:
        logger.warning("System prompt file not found at %s — using inline fallback", _PROMPT_PATH)
    return (
        "You are a helpful English-speaking voice assistant. "
        "Keep responses concise, natural, and easy to speak aloud."
    )


SYSTEM_PROMPT = load_system_prompt()


class GroqLLMService:
    """Wrapper around ChatGroq for short, speech-friendly assistant responses."""

    def __init__(self, model_name: str = "llama-3.3-70b-versatile"):
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY is missing. Set it in your environment or .env file.")
        self.model_name = model_name
        self.client = ChatGroq(api_key=api_key, model=model_name, temperature=0.2)
        logger.info("GroqLLMService ready model=%s", model_name)

    def generate_response(
        self,
        user_input: str,
        history: list[str] | None = None,
        category: str | None = None,
        topic: str | None = None,
    ) -> str:
        """Generate a reply using the system prompt and properly-structured conversation history."""
        history = history or []
        logger.info(
            "GroqLLM generate_response model=%s history_lines=%d input_length=%d",
            self.model_name,
            len(history),
            len(user_input),
        )

        dynamic_prompt = build_system_prompt(category=category, topic=topic)
        messages: list = [SystemMessage(content=dynamic_prompt or SYSTEM_PROMPT)]

        if history:
            if category:
                logger.debug("GroqLLM resolved dynamic prompt category=%s topic_present=%s", category, bool(topic))

            for line in history[-8:]:
                if line.startswith("User:"):
                    messages.append(HumanMessage(content=line[5:].strip()))
                elif line.startswith("Assistant:"):
                    messages.append(AIMessage(content=line[10:].strip()))

        messages.append(HumanMessage(content=user_input))
        logger.debug("GroqLLM sending %d messages to API", len(messages))

        with span_context("llm.generate_response", kind="llm") as span:
            response = self.client.invoke(messages)
            if isinstance(response, AIMessage):
                result = response.content
                usage = getattr(response, "usage_metadata", {}) or {}
                span.set(
                    model=self.model_name,
                    prompt_tokens=usage.get("input_tokens", 0),
                    completion_tokens=usage.get("output_tokens", 0),
                    total_tokens=usage.get("total_tokens", 0),
                )
            else:
                result = str(response)
                span.set(model=self.model_name)

        logger.info("GroqLLM response_length=%d", len(result))
        return result

    def generate_response_with_grammar(
        self,
        user_input: str,
        history: list[str] | None = None,
        category: str | None = None,
        topic: str | None = None,
    ) -> tuple[str, str | None]:
        """Generate a reply with grammar analysis in one JSON-mode LLM call.

        Returns (response_text, raw_json_str).
        Falls back to (plain_response_text, None) when JSON mode fails.
        """
        history = history or []
        logger.info(
            "GroqLLM generate_response_with_grammar model=%s history_lines=%d input_length=%d",
            self.model_name,
            len(history),
            len(user_input),
        )

        dynamic_prompt = build_system_prompt(category=category, topic=topic, include_grammar=True)
        messages: list = [SystemMessage(content=dynamic_prompt or SYSTEM_PROMPT)]

        for line in history[-8:]:
            if line.startswith("User:"):
                messages.append(HumanMessage(content=line[5:].strip()))
            elif line.startswith("Assistant:"):
                messages.append(AIMessage(content=line[10:].strip()))

        messages.append(HumanMessage(content=user_input))

        try:
            with span_context("llm.generate_response_with_grammar", kind="llm") as span:
                json_client = self.client.bind(response_format={"type": "json_object"})
                response = json_client.invoke(messages)
                raw = response.content if isinstance(response, AIMessage) else str(response)

                usage = getattr(response, "usage_metadata", {}) or {}
                span.set(
                    model=self.model_name,
                    prompt_tokens=usage.get("input_tokens", 0),
                    completion_tokens=usage.get("output_tokens", 0),
                    total_tokens=usage.get("total_tokens", 0),
                )

            data = json.loads(raw)
            response_text = data.get("response_text", "").strip()
            if response_text:
                logger.info("GroqLLM grammar response parsed ok response_length=%d", len(response_text))
                return response_text, raw

            logger.warning("GroqLLM grammar response missing response_text key, falling back")
        except Exception:
            logger.exception("GroqLLM generate_response_with_grammar failed, falling back to plain response")

        fallback = self.generate_response(user_input=user_input, history=history, category=category, topic=topic)
        return fallback, None
```

- [ ] **Step 2: Commit**

```bash
git add app/services/groq_llm.py
git commit -m "feat(observability): instrument GroqLLMService with span_context"
```

---

## Task 6: Instrument `groq_stt.py`

**Files:**
- Modify: `app/services/groq_stt.py`

- [ ] **Step 1: Replace the contents of `app/services/groq_stt.py`**

```python
import io
import os

from groq import Groq

from app.core.logger import logger
from app.core.telemetry import span_context


class GroqSTTService:
    """Transcribe audio bytes into text using Groq's speech API."""

    def __init__(self, model_name: str = "whisper-large-v3-turbo"):
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY is missing. Set it in your environment or .env file.")

        self.client = Groq(api_key=api_key)
        self.model_name = model_name
        logger.info("GroqSTTService ready model=%s", self.model_name)

    def transcribe(self, audio_bytes: bytes, filename: str = "recording.wav") -> str:
        """Send in-memory audio to Groq and return the extracted transcript."""
        if not audio_bytes:
            logger.warning("GroqSTT: transcribe called with empty audio bytes")
            return ""

        logger.info("GroqSTT transcribe start filename=%r size=%d bytes model=%s", filename, len(audio_bytes), self.model_name)

        file_obj = io.BytesIO(audio_bytes)
        file_obj.name = filename

        with span_context("stt.transcribe", kind="stt") as span:
            transcription = self.client.audio.transcriptions.create(
                file=file_obj,
                model=self.model_name,
                response_format="verbose_json",
                temperature=0.0,
            )
            span.set(model=self.model_name, audio_bytes=len(audio_bytes))

        if hasattr(transcription, "text"):
            result = transcription.text.strip()
        elif isinstance(transcription, dict):
            result = str(transcription.get("text", "")).strip()
        else:
            logger.warning("GroqSTT: unexpected response type %s", type(transcription).__name__)
            result = ""

        logger.info("GroqSTT transcribe done transcript_length=%d", len(result))
        return result
```

- [ ] **Step 2: Commit**

```bash
git add app/services/groq_stt.py
git commit -m "feat(observability): instrument GroqSTTService with span_context"
```

---

## Task 7: Instrument `elevenlabs_tts.py`

**Files:**
- Modify: `app/services/elevenlabs_tts.py`

- [ ] **Step 1: Add `span_context` import and wrap `convert_text_to_speech`**

At the top of the file, after the existing imports, add:

```python
from app.core.telemetry import span_context
```

Then in `convert_text_to_speech`, wrap only the HTTP request block. Replace the `try:` block that starts at `with closing(requests.post(...))` through the `except requests.RequestException` handler with:

```python
        with span_context("tts.synthesize", kind="tts") as span:
            span.set(model=model_id, voice_id=voice_id, text_length=len(text))
            try:
                with closing(
                    requests.post(
                        url,
                        headers=headers,
                        json=payload,
                        timeout=_REQUEST_TIMEOUT_SECONDS,
                        stream=True,
                    )
                ) as response:
                    if response.status_code != 200:
                        logger.error(
                            "ElevenLabs: API returned HTTP %d voice_id=%s model_id=%s - %s",
                            response.status_code,
                            voice_id,
                            model_id,
                            response.text[:200],
                        )
                        return b""

                    audio_bytes = self._read_audio_response(response)
            except requests.RequestException as exc:
                logger.error("ElevenLabs: HTTP request failed: %s", exc)
                return b""
```

The full updated `convert_text_to_speech` method:

```python
    def convert_text_to_speech(self, text: str, voice_gender: str | None = None) -> bytes:
        """Synthesize text and return raw MP3 bytes, or empty bytes on failure."""
        if not text.strip():
            logger.debug("ElevenLabs: empty text provided, skipping synthesis")
            return b""

        api_key = self._get_env_value(_ENV_API_KEY)
        if not api_key:
            logger.error("ElevenLabs: %s is not set - cannot synthesize audio", _ENV_API_KEY)
            return b""

        voice_id = self._resolve_voice_id(voice_gender)
        if not voice_id:
            logger.error(
                "ElevenLabs: no voice ID configured for voice_gender=%r - set "
                "%s, %s, or %s",
                voice_gender,
                _ENV_MALE_VOICE_ID,
                _ENV_FEMALE_VOICE_ID,
                _ENV_DEFAULT_VOICE_ID,
            )
            return b""

        model_id = self._get_env_value(_ENV_MODEL_ID) or _DEFAULT_MODEL_ID
        logger.info("ElevenLabs TTS request voice_id=%s model_id=%s text_len=%d", voice_id, model_id, len(text))

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {
            "xi-api-key": api_key,
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
        }
        payload = {"text": text, "model_id": model_id}

        with span_context("tts.synthesize", kind="tts") as span:
            span.set(model=model_id, voice_id=voice_id, text_length=len(text))
            try:
                with closing(
                    requests.post(
                        url,
                        headers=headers,
                        json=payload,
                        timeout=_REQUEST_TIMEOUT_SECONDS,
                        stream=True,
                    )
                ) as response:
                    if response.status_code != 200:
                        logger.error(
                            "ElevenLabs: API returned HTTP %d voice_id=%s model_id=%s - %s",
                            response.status_code,
                            voice_id,
                            model_id,
                            response.text[:200],
                        )
                        return b""

                    audio_bytes = self._read_audio_response(response)
            except requests.RequestException as exc:
                logger.error("ElevenLabs: HTTP request failed: %s", exc)
                return b""

        if not audio_bytes:
            logger.error("ElevenLabs: API returned empty audio body voice_id=%s model_id=%s", voice_id, model_id)
            return b""

        content_length = response.headers.get("Content-Length")
        if content_length:
            try:
                expected_length = int(content_length)
            except ValueError:
                expected_length = None
            if expected_length is not None and len(audio_bytes) != expected_length:
                logger.error(
                    "ElevenLabs: incomplete audio body voice_id=%s model_id=%s expected_bytes=%d received_bytes=%d",
                    voice_id,
                    model_id,
                    expected_length,
                    len(audio_bytes),
                )
                return b""

        content_type = str(response.headers.get("Content-Type", "")).lower()
        if content_type and not content_type.startswith("audio/"):
            logger.error(
                "ElevenLabs: API returned unexpected content type %r voice_id=%s model_id=%s",
                content_type,
                voice_id,
                model_id,
            )
            return b""

        logger.info("ElevenLabs TTS done voice_id=%s received=%d bytes", voice_id, len(audio_bytes))
        return audio_bytes
```

- [ ] **Step 2: Commit**

```bash
git add app/services/elevenlabs_tts.py
git commit -m "feat(observability): instrument ElevenLabsTTS with span_context"
```

---

## Task 8: Instrument `azure_assessment.py`

**Files:**
- Modify: `app/services/azure_assessment.py`

- [ ] **Step 1: Add `span_context` import**

After the existing imports (after `from app.core.settings import ...`), add:

```python
from app.core.telemetry import span_context
```

- [ ] **Step 2: Wrap the `assess` method body in `span_context`**

The `assess` method currently runs the recognition logic directly. Wrap the `recognizer.recognize_once()` call and result processing inside `span_context`. Replace the entire `assess` method with:

```python
    def assess(
        self,
        audio_bytes: bytes,
        reference_text: str | None = None,
        language: str | None = None,
        granularity: str = "Phoneme",
        enable_prosody: bool = True,
    ) -> dict:
        """Assess pronunciation of audio_bytes."""
        if not audio_bytes:
            raise ValueError("audio_bytes must not be empty")
        if speechsdk is None:
            raise RuntimeError(
                "azure-cognitiveservices-speech is not installed. "
                "Install dependencies from requirements.txt to enable pronunciation assessment."
            )

        locale = language or self.default_language
        is_scripted = bool(reference_text and reference_text.strip())
        mode = "scripted" if is_scripted else "unscripted"

        logger.info(
            "AzureAssessment assess start mode=%s locale=%s granularity=%s size=%d",
            mode, locale, granularity, len(audio_bytes),
        )

        stream = speechsdk.audio.PushAudioInputStream()
        try:
            stream.write(audio_bytes)
            stream.close()
            audio_config = speechsdk.audio.AudioConfig(stream=stream)

            granularity_map = {
                "Phoneme": speechsdk.PronunciationAssessmentGranularity.Phoneme,
                "Word": speechsdk.PronunciationAssessmentGranularity.Word,
                "FullText": speechsdk.PronunciationAssessmentGranularity.FullText,
            }
            gran = granularity_map.get(granularity)
            if gran is None:
                logger.warning("AzureAssessment unknown granularity=%r - falling back to Phoneme", granularity)
                gran = speechsdk.PronunciationAssessmentGranularity.Phoneme

            pronunciation_config = speechsdk.PronunciationAssessmentConfig(
                reference_text=reference_text.strip() if is_scripted else "",
                grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
                granularity=gran,
                enable_miscue=is_scripted,
            )

            if enable_prosody and locale == "en-US":
                pronunciation_config.enable_prosody_assessment()
                logger.debug("AzureAssessment prosody enabled locale=%s", locale)

            speech_config = speechsdk.SpeechConfig(subscription=self._key, region=self._region)
            speech_config.speech_recognition_language = locale

            recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config,
                audio_config=audio_config,
            )
            pronunciation_config.apply_to(recognizer)

            with span_context("azure.assess", kind="api") as span:
                span.set(model="azure-pronunciation", mode=mode, locale=locale, audio_bytes=len(audio_bytes))
                try:
                    result = recognizer.recognize_once()
                finally:
                    del recognizer
                    del audio_config
                    del speech_config
        finally:
            del stream

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            json_str = result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
            data = json.loads(json_str)
            nbest = data.get("NBest", [])
            if not nbest:
                raise RuntimeError("Azure returned an empty NBest list")
            display_text = data.get("DisplayText", "")
            logger.info("AzureAssessment done mode=%s display_text_length=%d", mode, len(display_text))
            return {
                "mode": mode,
                "display_text": display_text,
                "recognition_status": data.get("RecognitionStatus"),
                "offset_ticks": data.get("Offset"),
                "duration_ticks": data.get("Duration"),
                "snr": data.get("SNR"),
                **nbest[0],
            }

        if result.reason == speechsdk.ResultReason.NoMatch:
            logger.warning("AzureAssessment NoMatch locale=%s", locale)
            raise RuntimeError("Speech was not recognized. Please check audio quality and try again.")

        cancellation = speechsdk.CancellationDetails.from_result(result)
        logger.error(
            "AzureAssessment Canceled reason=%s error=%s",
            cancellation.reason, cancellation.error_details,
        )
        raise RuntimeError(f"Azure assessment cancelled: {cancellation.error_details}")
```

- [ ] **Step 3: Commit**

```bash
git add app/services/azure_assessment.py
git commit -m "feat(observability): instrument AzureAssessmentService with span_context"
```

---

## Task 9: Extend `AuditLogger` with trace fields

**Files:**
- Modify: `app/guardrails/audit/logger.py`

- [ ] **Step 1: Add `get_trace_context` import and inject fields into the audit event**

Replace the entire file:

```python
from __future__ import annotations

import datetime
import hashlib
import json
import time
import uuid

from app.core import settings
from app.core.database import get_connection
from app.core.logger import logger as _app_logger
from app.core.telemetry import get_trace_context


class AuditLogger:
    """Emit a structured audit event for every guardrail-checked request."""

    def log(
        self,
        *,
        user_id: str,
        conversation_id: str,
        user_input: str,
        response_text: str,
        guardrail_decisions: dict,
        flags: list[str],
        start_time: float,
    ) -> None:
        latency_ms = int((time.time() - start_time) * 1000)
        ctx = get_trace_context()
        event = {
            "event_id": str(uuid.uuid4()),
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "trace_id": ctx["trace_id"],
            "session_id": ctx["session_id"],
            "user_id": user_id,
            "conversation_id": conversation_id,
            "user_input_length": len(user_input),
            "response_length": len(response_text),
            "user_input_hash": hashlib.sha256(user_input.encode()).hexdigest(),
            "response_text_hash": hashlib.sha256(response_text.encode()).hexdigest(),
            "guardrail_decisions": guardrail_decisions,
            "flags": flags,
            "latency_ms": latency_ms,
        }
        _app_logger.info("audit_event %s", json.dumps(event))

        if settings.AUDIT_DB_ENABLED:
            self._write_to_db(event)

    def _write_to_db(self, event: dict) -> None:
        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO audit_logs
                            (user_id, conversation_id, user_input_hash, response_text_hash,
                             flags, guardrail_decisions, latency_ms)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            event["user_id"],
                            event["conversation_id"],
                            event["user_input_hash"],
                            event["response_text_hash"],
                            json.dumps(event["flags"]),
                            json.dumps(event["guardrail_decisions"]),
                            event["latency_ms"],
                        ),
                    )
        except Exception:
            _app_logger.exception(
                "audit_log DB write failed event_id=%s", event["event_id"]
            )
```

- [ ] **Step 2: Commit**

```bash
git add app/guardrails/audit/logger.py
git commit -m "feat(observability): inject trace_id and session_id into audit log events"
```

---

## Task 10: Instrument `InputGuardrails`

**Files:**
- Modify: `app/guardrails/input/__init__.py`

- [ ] **Step 1: Replace the contents of `app/guardrails/input/__init__.py`**

```python
from __future__ import annotations

from app.core import settings
from app.core.telemetry import span_context
from app.guardrails.input.injection import InjectionDetector
from app.guardrails.input.rate_limiter import RateLimiter
from app.guardrails.input.topic_filter import TopicFilter
from app.guardrails.input.validator import InputValidator


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
        with span_context("guardrail.input", kind="guardrail"):
            text = self._validator.check(text)
            self._rate_limiter.check(user_id)
            self._injection_detector.check(text)
            self._topic_filter.check(text)
            return text
```

- [ ] **Step 2: Commit**

```bash
git add app/guardrails/input/__init__.py
git commit -m "feat(observability): instrument InputGuardrails with span_context"
```

---

## Task 11: Instrument `OutputGuardrails`

**Files:**
- Modify: `app/guardrails/output/__init__.py`

- [ ] **Step 1: Replace the contents of `app/guardrails/output/__init__.py`**

```python
from __future__ import annotations

from dataclasses import dataclass, field

from app.core.telemetry import span_context
from app.guardrails.output.content_filter import ContentFilter


@dataclass
class OutputGuardrailsResult:
    text: str
    flags: list[str] = field(default_factory=list)
    needs_retry: bool = False


class OutputGuardrails:
    """Run output content filter (PII redaction only)."""

    def __init__(self, content_filter: ContentFilter | None = None):
        self._content_filter = content_filter or ContentFilter()

    def check(self, text: str) -> OutputGuardrailsResult:
        """Return PII-redacted text and flags. Never raises."""
        with span_context("guardrail.output", kind="guardrail"):
            cf_result = self._content_filter.check(text)
            return OutputGuardrailsResult(text=cf_result.text, flags=cf_result.flags)
```

- [ ] **Step 2: Commit**

```bash
git add app/guardrails/output/__init__.py
git commit -m "feat(observability): instrument OutputGuardrails with span_context"
```

---

## Task 12: Set `session_id` to `conversation_id` in `chat.py`

**Files:**
- Modify: `app/api/chat.py`

- [ ] **Step 1: Add import at the top of `chat.py`**

After the existing imports block (after `from app.guardrails.output import OutputGuardrails`), add:

```python
from app.core.telemetry import update_session_id
```

- [ ] **Step 2: Call `update_session_id` after `conv_id` is resolved**

In the `chat_respond` function, `conv_id` is resolved at two places:
- When an existing conversation is found: `conv_id = row[0]` (line ~204)
- When a new conversation is created: `conv_id = cur.fetchone()[0]` (line ~252)

After the `with get_connection()` block that resolves `conv_id` (around line 265, just before `user_object_key: str | None = None`), add:

```python
    update_session_id(conv_id)
```

The exact location is after the closing `with conn.cursor() as cur:` block where `conversation_history` is fetched, i.e., after line:
```python
            conversation_history = _fetch_visible_history(cur, conv_id)
```
and the `with` blocks close, and before:
```python
    user_object_key: str | None = None
```

Insert:
```python
    # Enrich trace context with the resolved conversation ID as session_id
    update_session_id(conv_id)
```

- [ ] **Step 3: Commit**

```bash
git add app/api/chat.py
git commit -m "feat(observability): set session_id to conversation_id in chat route"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Traces: every LLM/STT/TTS/guardrail call emits a JSON span with `trace_id`, `session_id`, `user_id`, `model`, tokens, latency, `span_kind`
- ✅ Logs: structured JSON for all service calls; token counts; tool call inputs/outputs via `extra`; guardrail decisions; errors with full context; `trace_id`/`session_id`/`user_id`/`model`/`environment` on every entry
- ✅ Metrics: token usage counters, cost counters, latency histograms for LLM/STT/TTS, guardrail rate counter, `/metrics` endpoint
- ✅ Placeholder metrics: `answer_relevance_score`, `hallucination_rate_total` registered but never updated
- ✅ PII redaction: deferred (per decision)
- ✅ LLM-as-judge: deferred (per decision)
- ✅ Instrumentation via wrappers (`span_context`), not inside business logic
- ✅ `X-Trace-ID` response header
- ✅ Existing features untouched (no API changes)
- ✅ `session_id` = `conversation_id` (enriched after resolution)

**Type consistency:** `span_context`, `set_trace_context`, `update_session_id`, `clear_trace_context`, `get_trace_context` are consistent across all tasks. `record_span_metrics(name, kind, duration_ms, status, extra)` signature is consistent between Tasks 2 and 3.

**No placeholders found.**
