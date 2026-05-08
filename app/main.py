from contextlib import asynccontextmanager

import jwt as pyjwt
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.api.router import router
from app.core.database import init_db_pool
from app.core.logger import logger
from app.core.logging_middleware import LoggingMiddleware
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


@app.middleware("http")
async def log_requests(request: Request, call_next):
    middleware = LoggingMiddleware(app=app)
    return await middleware.dispatch(request, call_next)



@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(router)
