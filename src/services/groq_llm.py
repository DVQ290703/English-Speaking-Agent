"""Compatibility wrapper for the Groq LLM service."""

from .groq_lm import GroqLLMService, SYSTEM_PROMPT, load_system_prompt

__all__ = ["GroqLLMService", "SYSTEM_PROMPT", "load_system_prompt"]
