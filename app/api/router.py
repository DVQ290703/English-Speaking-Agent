from __future__ import annotations

from fastapi import APIRouter

from app.api.assess import router as assess_router
from app.api.audio import router as audio_router
from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.conversations import router as conversations_router
from app.api.flashcards import router as flashcards_router
from app.api.grammar import router as grammar_router
from app.api.oauth import router as oauth_router
from app.api.topics import router as topics_router

router = APIRouter(prefix="/api")
router.include_router(auth_router)
router.include_router(oauth_router)
router.include_router(chat_router)
router.include_router(assess_router)
router.include_router(conversations_router)
router.include_router(audio_router)
router.include_router(grammar_router)
router.include_router(topics_router)
router.include_router(flashcards_router)
