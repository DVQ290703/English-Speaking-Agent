import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import CORS_ORIGINS
from backend.database import init_db_pool
from backend.routes import router
from backend.storage import init_storage

_LOG_DIR = os.getenv("LOG_DIR", "logs")
_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
os.makedirs(_LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=getattr(logging, _LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(f"{_LOG_DIR}/backend.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)
logger.info("Log level set to %s, writing to %s/backend.log", _LOG_LEVEL, _LOG_DIR)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks before accepting requests."""
    logger.info("Initializing DB pool and storage...")
    init_db_pool()
    init_storage()
    logger.info("Startup complete — ready to accept requests")
    yield
    logger.info("Shutting down")


app = FastAPI(title="Voice Agent Auth API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(router)
