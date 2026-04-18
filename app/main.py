from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.settings import CORS_ORIGINS
from app.core.logger import logger
from app.core.database import init_db_pool
from app.core.storage import init_storage
from app.api.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks before accepting requests."""
    logger.info("Initializing DB pool and storage...")
    init_db_pool()
    init_storage()
    logger.info("Startup complete — ready to accept requests")
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


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(router)
