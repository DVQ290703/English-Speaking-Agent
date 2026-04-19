# ── Stage 1: builder ────────────────────────────────────────────────────────
FROM python:3.10-slim AS builder

# Build tools needed by cffi (pulled by passlib[bcrypt]) and any packages that
# fall back to source compilation on non-manylinux platforms (e.g. arm64).
# These are ONLY in this stage and never copied to the runtime image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gcc \
        build-essential \
        libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# A virtualenv is the cleanest unit to transplant between stages.
RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"

# Copy requirements before app code — this layer is cached as long as
# requirements.txt is unchanged, so code-only rebuilds cost zero pip time.
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /tmp/requirements.txt


# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM python:3.10-slim AS runtime

# Create non-root user before any COPY so ownership is correct from the start.
RUN addgroup --system app \
    && adduser --system --ingroup app app \
    && mkdir -p /app/outputs \
    && chown -R app:app /app

# Transplant the pre-built virtualenv — no gcc, no apt cache, no pip cache
# lands in the final image.
COPY --from=builder /venv /venv

WORKDIR /app

COPY app /app/app

ENV PATH="/venv/bin:$PATH" \
    PYTHONPATH=/app \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

EXPOSE 8000

USER app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
