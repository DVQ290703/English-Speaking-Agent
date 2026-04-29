from __future__ import annotations

import datetime
import hashlib
import json
import time
import uuid

from app.core import settings
from app.core.database import get_connection
from app.core.logger import logger as _app_logger


class AuditLogger:
    """Emit a structured audit event for every guardrail-checked request."""

    def log(
        self,
        *,
        user_id: str,
        conversation_id: str,
        user_input: str,
        response_text: str,
        guardrail_decisions: dict,
        flags: list[str],
        hitl_queued: bool,
        start_time: float,
    ) -> None:
        latency_ms = int((time.time() - start_time) * 1000)
        event = {
            "event_id": str(uuid.uuid4()),
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "user_id": user_id,
            "conversation_id": conversation_id,
            "user_input_length": len(user_input),
            "response_length": len(response_text),
            "user_input_hash": hashlib.sha256(user_input.encode()).hexdigest(),
            "response_text_hash": hashlib.sha256(response_text.encode()).hexdigest(),
            "guardrail_decisions": guardrail_decisions,
            "flags": flags,
            "hitl_queued": hitl_queued,
            "latency_ms": latency_ms,
        }
        _app_logger.info("audit_event %s", json.dumps(event))

        if settings.AUDIT_DB_ENABLED:
            self._write_to_db(event)

    def _write_to_db(self, event: dict) -> None:
        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO audit_logs
                            (user_id, conversation_id, user_input_hash, response_text_hash,
                             flags, guardrail_decisions, hitl_queued, latency_ms)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            event["user_id"],
                            event["conversation_id"],
                            event["user_input_hash"],
                            event["response_text_hash"],
                            json.dumps(event["flags"]),
                            json.dumps(event["guardrail_decisions"]),
                            event["hitl_queued"],
                            event["latency_ms"],
                        ),
                    )
        except Exception:
            _app_logger.exception(
                "audit_log DB write failed event_id=%s", event["event_id"]
            )
