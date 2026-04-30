# ── Stage 1: builder ────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

# uv: self-contained binary copied directly from the official image.
# No apt install needed; it drops one layer and keeps the builder lean.
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv

# gcc + libffi-dev: compile-time only — cffi (pulled by passlib[bcrypt]) needs
# them to build its C extension. They never land in the runtime image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libffi-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /venv

# Activating the venv via ENV lets uv (and pip) detect it automatically in all
# subsequent RUN steps without needing to repeat the path inline.
ENV VIRTUAL_ENV=/venv PATH="/venv/bin:$PATH"

# Copy requirements before app code so this layer is cached on code-only changes.
COPY requirements.txt /tmp/requirements.txt

# --compile-bytecode: pre-generates .pyc files inside /venv so the runtime
# image never re-compiles a dependency on first import (faster cold start).
RUN uv pip install --no-cache --compile-bytecode -r /tmp/requirements.txt


# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# libasound2: the Azure Cognitive Services Speech SDK links against ALSA at
# load time — the container will crash on the first /assess call without it.
# libgstreamer-plugins-base1.0-0: required for the SDK's internal audio pipeline.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libasound2 \
        libgstreamer-plugins-base1.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system app \
    && adduser --system --ingroup app app

# Transplant the pre-built, pre-compiled venv — no gcc, no apt cache, no pip
# cache in the final image.
COPY --from=builder /venv /venv

WORKDIR /app

# --chown on COPY avoids a separate RUN chown layer.
COPY --chown=app:app app ./app

ENV PATH="/venv/bin:$PATH" \
    PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1

# Pre-compile app source so each module's .pyc exists before first import.
RUN python -m compileall -q app/

EXPOSE 8000

USER app

# Orchestrators (K8s, ECS) use this to gate readiness and restart unhealthy pods.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# --no-access-log: per-request logs belong at the reverse-proxy/LB layer.
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--no-access-log"]
