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
