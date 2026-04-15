FROM python:3.10-slim

WORKDIR /app

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
	&& addgroup --system app \
	&& adduser --system --ingroup app app \
	&& mkdir -p /app/outputs \
	&& chown -R app:app /app

COPY backend /app/backend
COPY src /app/src

ENV PYTHONPATH=/app

EXPOSE 8000

USER app

CMD ["uvicorn", "backend.auth_api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
