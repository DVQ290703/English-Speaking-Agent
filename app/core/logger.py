import logging
import json
import os
from datetime import datetime
from typing import Any, Dict
import sys

from dotenv import load_dotenv

load_dotenv()


class IndustryLogger:
    """
    Structured logger following industry practices.
    - Plain log messages: %(asctime)s %(levelname)s [%(module)s]: %(message)s
    - Structured events (log_event): single-line JSON written at INFO level
    - Writes to both console and a date-stamped file under LOG_DIR
    - Log level controlled by LOG_LEVEL env var (default INFO)
    """

    def __init__(self, name: str = "AI-Lab-Agent", log_dir: str | None = None):
        log_dir = log_dir or os.getenv("LOG_DIR", "logs")
        log_level_name = os.getenv("LOG_LEVEL", "INFO").upper()
        log_level = getattr(logging, log_level_name, logging.INFO)

        self.logger = logging.getLogger(name)
        self.logger.setLevel(log_level)

        # Avoid adding duplicate handlers if the logger is already configured
        # (e.g. module reloaded in tests or interactive sessions).
        if self.logger.handlers:
            return

        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, f"{datetime.now().strftime('%Y-%m-%d')}.log")

        formatter = logging.Formatter(
            "%(asctime)s %(levelname)-8s [%(name)s]: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setFormatter(formatter)

        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)

        self.logger.addHandler(file_handler)
        self.logger.addHandler(console_handler)

        self.logger.info(
            "Logger initialised — level=%s file=%s", log_level_name, log_file
        )

    # ------------------------------------------------------------------
    # Structured event logging
    # ------------------------------------------------------------------

    def log_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Emit a single-line JSON entry for structured/auditable events."""
        payload = {
            "timestamp": datetime.utcnow().isoformat(),
            "event": event_type,
            "data": data,
        }
        self.logger.info(json.dumps(payload, ensure_ascii=False))

    # ------------------------------------------------------------------
    # Standard level helpers — all support %-style format strings
    # ------------------------------------------------------------------

    def debug(self, msg: str, *args: Any, **kwargs: Any) -> None:
        self.logger.debug(msg, *args, **kwargs)

    def info(self, msg: str, *args: Any, **kwargs: Any) -> None:
        self.logger.info(msg, *args, **kwargs)

    def warning(self, msg: str, *args: Any, **kwargs: Any) -> None:
        self.logger.warning(msg, *args, **kwargs)

    def error(self, msg: str, *args: Any, exc_info: bool = False, **kwargs: Any) -> None:
        self.logger.error(msg, *args, exc_info=exc_info, **kwargs)

    def exception(self, msg: str, *args: Any, **kwargs: Any) -> None:
        """Log at ERROR level and automatically attach the current exception traceback."""
        self.logger.exception(msg, *args, **kwargs)


# ---------------------------------------------------------------------------
# Global singleton — import this everywhere:
#   from app.core.logger import logger
# ---------------------------------------------------------------------------
logger = IndustryLogger()


def get_logger(component: str) -> logging.Logger:
    """Return a named child logger: AI-Lab-Agent.<component>"""
    return logging.getLogger(f"AI-Lab-Agent.{component}")
