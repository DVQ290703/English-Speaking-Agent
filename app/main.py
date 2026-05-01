from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import router
from app.core.database import init_db_pool
from app.core.logger import logger
from app.core.settings import CORS_ORIGINS
from app.core.storage import init_storage


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
    # Only force no-store on sensitive endpoints. Audio and health set their own headers.
    sensitive_prefixes = ("/api/auth/", "/api/chat/")
    if any(request.url.path.startswith(p) for p in sensitive_prefixes):
        response.headers.setdefault("Cache-Control", "no-store")
    if request.url.scheme == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(router)
