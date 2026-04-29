from __future__ import annotations

import json

from app.core.database import get_connection
from app.core.logger import logger


class HITLRouter:
    """Insert flagged interactions into hitl_queue for async human review."""

    def route(
        self,
        *,
        flags: list[str],
        conversation_id: str,
        message_id: str,
        user_input: str,
        response_text: str,
    ) -> bool:
        """Insert into hitl_queue if flags is non-empty. Returns True if queued.

        Never raises — a failed insert is logged but does not affect the response.
        """
        if not flags:
            return False
        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO hitl_queue
                            (conversation_id, message_id, user_input, response_text, flags)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (
                            conversation_id,
                            message_id,
                            user_input,
                            response_text,
                            json.dumps(flags),
                        ),
                    )
            logger.info(
                "hitl_queue inserted conversation_id=%s flags=%s",
                conversation_id,
                flags,
            )
            return True
        except Exception:
            logger.exception(
                "hitl_queue insert failed conversation_id=%s flags=%s",
                conversation_id,
                flags,
            )
            return False
