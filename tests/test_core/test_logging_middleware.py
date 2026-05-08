import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _make_app(raise_exc: bool = False) -> FastAPI:
    """Minimal FastAPI app with LoggingMiddleware for testing."""
    from app.core.logging_middleware import LoggingMiddleware

    app = FastAPI()
    app.add_middleware(LoggingMiddleware)

    @app.get("/ok")
    def ok():
        return {"status": "ok"}

    @app.get("/boom")
    def boom():
        raise RuntimeError("intentional test error")

    return app


def test_request_start_logged(caplog):
    import logging
    with caplog.at_level(logging.INFO, logger="AI-Lab-Agent.api"):
        client = TestClient(_make_app(), raise_server_exceptions=False)
        client.get("/ok")

    messages = [r.message for r in caplog.records if "AI-Lab-Agent.api" in r.name]
    start = [m for m in messages if "request_start" in m]
    assert len(start) == 1
    import json
    data = json.loads(start[0])
    assert data["event"] == "request_start"
    assert data["method"] == "GET"
    assert data["path"] == "/ok"


def test_request_end_logged(caplog):
    import logging, json
    with caplog.at_level(logging.INFO, logger="AI-Lab-Agent.api"):
        client = TestClient(_make_app(), raise_server_exceptions=False)
        client.get("/ok")

    messages = [r.message for r in caplog.records if "AI-Lab-Agent.api" in r.name]
    end = [m for m in messages if "request_end" in m]
    assert len(end) == 1
    data = json.loads(end[0])
    assert data["event"] == "request_end"
    assert data["status_code"] == 200
    assert isinstance(data["latency_ms"], int)
    assert data["latency_ms"] >= 0


def test_exception_logged_at_error(caplog):
    import logging, json
    with caplog.at_level(logging.ERROR, logger="AI-Lab-Agent.api"):
        client = TestClient(_make_app(), raise_server_exceptions=False)
        client.get("/boom")

    error_records = [
        r for r in caplog.records
        if r.levelno == logging.ERROR and "AI-Lab-Agent.api" in r.name
    ]
    assert len(error_records) == 1
    data = json.loads(error_records[0].message)
    assert data["event"] == "request_error"
    assert data["exc_type"] == "RuntimeError"


def test_logger_name_is_api():
    from app.core.logging_middleware import LoggingMiddleware
    import logging
    mw = LoggingMiddleware(app=FastAPI())
    assert mw._log.name == "AI-Lab-Agent.api"
