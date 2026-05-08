from __future__ import annotations

import json
import time
import traceback

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logger import get_logger
from app.core.telemetry import get_trace_context


class LoggingMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, **kwargs):
        super().__init__(app, **kwargs)
        self._log = get_logger("api")

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.monotonic()
        ctx = get_trace_context()

        self._log.info(json.dumps({
            "event": "request_start",
            "method": request.method,
            "path": request.url.path,
            "client_ip": request.client.host if request.client else None,
            "trace_id": ctx["trace_id"],
        }))

        try:
            response = await call_next(request)
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            self._log.error(json.dumps({
                "event": "request_error",
                "method": request.method,
                "path": request.url.path,
                "latency_ms": latency_ms,
                "exc_type": type(exc).__name__,
                "exc_message": str(exc),
                "stack_trace": traceback.format_exc(),
                "trace_id": ctx["trace_id"],
            }))
            raise

        latency_ms = int((time.monotonic() - start) * 1000)
        self._log.info(json.dumps({
            "event": "request_end",
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "latency_ms": latency_ms,
            "trace_id": ctx["trace_id"],
        }))
        return response
