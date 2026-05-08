You are a senior AI engineer implementing production-grade observability for an AI application. Analyze the entire codebase first, then implement structured tracing, logging, and monitoring without breaking existing functionality (I will use VEK stack for logging and mornitoring - Vector, Elastichserch, Kibana).

## Your job

Implement three observability layers:

**1. Traces** — instrument every LLM call, RAG pipeline step, tool/function call, and agent loop iteration using OpenTelemetry spans. Each span must include: model name, prompt tokens, completion tokens, latency, tool name (if applicable), retrieval doc count and scores (if RAG), and a shared `trace_id` and `session_id` that ties the full request together.

**2. Logs** — emit structured JSON logs (never plain strings) for: full prompt/response pairs (redact PII), token counts, tool call inputs/outputs, guardrail decisions (blocked/allowed + reason), retrieval results, model fallbacks, errors with full context (model, prompt, user_id, exception), and user feedback events. Every log entry must include `trace_id`, `session_id`, `user_id`, `model`, `environment`.

**3. Monitoring metrics** — expose counters and histograms for: token usage (input/output) per model and endpoint, API cost per request, LLM latency (p50/p95/p99, including time-to-first-token), error rate, retry/fallback rate, guardrail trigger rate, answer relevance score (sampled LLM-as-judge), hallucination/faithfulness rate on RAG responses, and user feedback scores.

## Constraints

- Read and understand the existing code before writing anything.
- Do not break existing features or APIs.
- Do not log raw PII — redact or hash sensitive fields.
- Use the project's existing logger/telemetry if one exists; extend it rather than replacing it.
- All new code must be covered by tests.
- Keep instrumentation out of business logic — use decorators, middleware, or wrappers.
- After implementing, run all existing tests and confirm they still pass.

## Deliverables

1. Instrumented code with traces, structured logs, and metrics.
2. A brief summary of what was added, where, and any decisions made.

