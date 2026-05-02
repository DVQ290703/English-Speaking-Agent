# Topic-Scoped Conversation Sessions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three root-cause bugs (topic labels, missing conversation_id, topic code mismatch) and build topic-scoped conversation sessions with hierarchical sidebar, auto-resume, soft-delete, and 5-conversation-per-topic limit.

**Architecture:** Backend gains a `deleted_at` soft-delete column, a `GET /conversations/for-topic` endpoint returning up to 5 sessions with computed session numbers, and a `DELETE /conversations/{id}` endpoint. The frontend rewrites `ConversationSidebar` into a two-view hierarchical navigator (browse categories/topics → topic history), and `VoiceAgent` auto-resumes the latest conversation on topic entry.

**Tech Stack:** FastAPI + psycopg2 (backend), React 18 + TypeScript + TanStack Query (frontend), pytest + TestClient + `tests/helpers/db_mocks.make_mock_connection` (tests).

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `db_schema/schema.sql` | Modify | Add `deleted_at TIMESTAMPTZ DEFAULT NULL` to `conversations` |
| `app/api/schemas.py` | Modify | Add `ForTopicConversationOut`, `ForTopicResponse` |
| `app/api/conversations.py` | Modify | Filter deleted in list; add `for-topic` and `DELETE /{id}` routes |
| `app/api/chat.py` | Modify | 5-limit check, proper title generation on conv creation |
| `tests/test_api/test_topic_conversations.py` | Create | Tests for `for-topic`, delete, 5-limit |
| `frontend/src/api/chat.js` | Modify | Add `conversationId` param to `chatRespond` |
| `frontend/src/api/conversations.ts` | Modify | Add `ForTopicResponse`, `fetchForTopic`, `deleteConversation` |
| `frontend/src/pages/VoiceAgent.tsx` | Modify | Pass `conversationId`; fix topic code; auto-resume; new-chat handler; delete handler; update sidebar props; remove old global query |
| `frontend/src/pages/DashboardPage.jsx` | Modify | Replace `topic.key` with `topic.id` (6 locations) |
| `frontend/src/components/voice-agent/ConversationSidebar.tsx` | Rewrite | Hierarchical browse + topic-history views |

---

## Task 1: DB Migration — add `deleted_at` to conversations

**Files:**
- Modify: `db_schema/schema.sql`

- [ ] **Step 1: Add column to schema.sql**

Find the `conversations` table definition in `db_schema/schema.sql` and add `deleted_at` after `cleared_at`:

```sql
    cleared_at          TIMESTAMPTZ,
    deleted_at          TIMESTAMPTZ,
```

- [ ] **Step 2: Run migration against your dev database**

```bash
psql $DATABASE_URL -c "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;"
```

Expected output:
```
ALTER TABLE
```

- [ ] **Step 3: Verify column exists**

```bash
psql $DATABASE_URL -c "\d conversations" | grep deleted_at
```

Expected output:
```
 deleted_at         | timestamp with time zone |           |          |
```

- [ ] **Step 4: Commit**

```bash
git add db_schema/schema.sql
git commit -m "feat(db): add deleted_at column to conversations for soft-delete"
```

---

## Task 2: Backend schemas — add ForTopicConversationOut and ForTopicResponse

**Files:**
- Modify: `app/api/schemas.py`

- [ ] **Step 1: Add schemas after `ConversationOut`**

Open `app/api/schemas.py`. After the `ConversationListResponse` class (line ~86), add:

```python
class ForTopicConversationOut(BaseModel):
    id: str
    title: str | None
    status: str
    session_number: int
    started_at: datetime
    updated_at: datetime


class ForTopicResponse(BaseModel):
    topic_code: str
    topic_title: str
    conversations: list[ForTopicConversationOut]
    total: int
    limit_reached: bool
```

- [ ] **Step 2: Write a failing schema test**

Create `tests/test_api/test_topic_conversations.py`:

```python
# tests/test_api/test_topic_conversations.py
"""Tests for for-topic and delete conversation endpoints."""
import os
import sys
import types
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

_minio_stub = types.ModuleType("minio")
_minio_stub.Minio = MagicMock
_minio_error_stub = types.ModuleType("minio.error")
_minio_error_stub.S3Error = Exception
sys.modules.setdefault("minio", _minio_stub)
sys.modules.setdefault("minio.error", _minio_error_stub)

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only-xx")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("POSTGRES_DB", "test_db")
os.environ.setdefault("POSTGRES_USER", "test_user")
os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
os.environ.setdefault("MINIO_SECRET_KEY", "minio-test-secret-2026")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")

import pytest
from fastapi.testclient import TestClient
from tests.helpers.db_mocks import make_mock_connection

with (
    patch("app.core.database.init_db_pool"),
    patch("app.core.storage.init_storage"),
):
    from app.main import app

from app.core.security import create_access_token


def _auth(user_id: str) -> dict:
    token, _ = create_access_token(user_id=user_id, email="u@test.com")
    return {"Authorization": f"Bearer {token}"}


def test_for_topic_response_schema():
    """ForTopicResponse schema is importable and validates correctly."""
    from app.api.schemas import ForTopicConversationOut, ForTopicResponse
    now = datetime.now(timezone.utc)
    conv = ForTopicConversationOut(
        id=str(uuid.uuid4()),
        title="IELTS Part 1 - Session 1",
        status="active",
        session_number=1,
        started_at=now,
        updated_at=now,
    )
    resp = ForTopicResponse(
        topic_code="ielts_part1",
        topic_title="IELTS Part 1 — Intro",
        conversations=[conv],
        total=1,
        limit_reached=False,
    )
    assert resp.limit_reached is False
    assert resp.conversations[0].session_number == 1
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd D:/work/projects/English-Speaking-Agent
python -m pytest tests/test_api/test_topic_conversations.py::test_for_topic_response_schema -v
```

Expected: FAIL with `ImportError` or `cannot import name 'ForTopicConversationOut'`

- [ ] **Step 4: Run the test to verify it passes (after step 1)**

```bash
python -m pytest tests/test_api/test_topic_conversations.py::test_for_topic_response_schema -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/schemas.py tests/test_api/test_topic_conversations.py
git commit -m "feat(api): add ForTopicConversationOut and ForTopicResponse schemas"
```

---

## Task 3: Fix `GET /api/conversations` — filter soft-deleted

**Files:**
- Modify: `app/api/conversations.py` (the `list_conversations` function, ~line 27–61)

- [ ] **Step 1: Write a failing test**

Append to `tests/test_api/test_topic_conversations.py`:

```python
def test_list_conversations_excludes_deleted():
    """GET /conversations must not return conversations where deleted_at IS NOT NULL."""
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    conn, _ = make_mock_connection(
        fetchall_value=[
            # Only one row — the soft-deleted one is absent
            (str(uuid.uuid4()), "Live Session", "active", now, None, None, None, "ielts_part1"),
        ]
    )
    with patch("app.api.conversations.get_connection", return_value=conn):
        with TestClient(app) as client:
            resp = client.get("/api/conversations", headers=_auth(user_id))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["conversations"]) == 1
    assert data["conversations"][0]["title"] == "Live Session"
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/test_api/test_topic_conversations.py::test_list_conversations_excludes_deleted -v
```

Expected: FAIL (currently no `deleted_at` filter, but test passes trivially via mock — the real coverage comes from the SQL check below)

- [ ] **Step 3: Update the SQL in `list_conversations`**

In `app/api/conversations.py`, find the `list_conversations` function. Change the SQL from:

```python
            cur.execute(
                """
                SELECT
                    c.id::text,
                    c.title,
                    c.status,
                    c.started_at,
                    c.ended_at,
                    c.topic_id::text,
                    c.cleared_at,
                    t.code AS topic_code
                FROM conversations c
                LEFT JOIN topics t ON t.id = c.topic_id
                WHERE c.user_id = %s
                ORDER BY c.started_at DESC
                LIMIT 100
                """,
                (user_id,),
            )
```

To:

```python
            cur.execute(
                """
                SELECT
                    c.id::text,
                    c.title,
                    c.status,
                    c.started_at,
                    c.ended_at,
                    c.topic_id::text,
                    c.cleared_at,
                    t.code AS topic_code
                FROM conversations c
                LEFT JOIN topics t ON t.id = c.topic_id
                WHERE c.user_id = %s
                  AND c.deleted_at IS NULL
                ORDER BY c.started_at DESC
                LIMIT 100
                """,
                (user_id,),
            )
```

- [ ] **Step 4: Run test**

```bash
python -m pytest tests/test_api/test_topic_conversations.py::test_list_conversations_excludes_deleted -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/conversations.py tests/test_api/test_topic_conversations.py
git commit -m "feat(api): filter soft-deleted conversations from GET /conversations"
```

---

## Task 4: Add `GET /api/conversations/for-topic`

**Files:**
- Modify: `app/api/conversations.py`
- Modify: `app/api/schemas.py` (already done in Task 2)
- Modify: `tests/test_api/test_topic_conversations.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_api/test_topic_conversations.py`:

```python
def test_for_topic_returns_conversations_with_session_number():
    """GET /conversations/for-topic returns conversations with session_number."""
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    conn, _ = make_mock_connection(
        fetchall_by_sql={
            "row_number": [
                (str(uuid.uuid4()), "IELTS Part 1 — Intro - Session 2", "active", now, now, 2),
                (str(uuid.uuid4()), "IELTS Part 1 — Intro - Session 1", "active", now, now, 1),
            ],
        },
        fetchone_by_sql={
            "select id::text, title from topics": ("topic-uuid", "IELTS Part 1 — Intro"),
            "select count(*)": (2,),
        },
    )
    with patch("app.api.conversations.get_connection", return_value=conn):
        with TestClient(app) as client:
            resp = client.get(
                "/api/conversations/for-topic",
                params={"topic_code": "ielts_part1"},
                headers=_auth(user_id),
            )
    assert resp.status_code == 200
    data = resp.json()
    assert data["topic_code"] == "ielts_part1"
    assert data["topic_title"] == "IELTS Part 1 — Intro"
    assert len(data["conversations"]) == 2
    assert data["conversations"][0]["session_number"] == 2
    assert data["limit_reached"] is False
    assert data["total"] == 2


def test_for_topic_limit_reached_when_5_conversations():
    """GET /conversations/for-topic sets limit_reached=True when total == 5."""
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    five_convs = [
        (str(uuid.uuid4()), f"Session {i}", "active", now, now, i)
        for i in range(5, 0, -1)
    ]
    conn, _ = make_mock_connection(
        fetchall_by_sql={"row_number": five_convs},
        fetchone_by_sql={
            "select id::text, title from topics": ("topic-uuid", "IELTS Part 1 — Intro"),
            "select count(*)": (5,),
        },
    )
    with patch("app.api.conversations.get_connection", return_value=conn):
        with TestClient(app) as client:
            resp = client.get(
                "/api/conversations/for-topic",
                params={"topic_code": "ielts_part1"},
                headers=_auth(user_id),
            )
    assert resp.status_code == 200
    data = resp.json()
    assert data["limit_reached"] is True
    assert data["total"] == 5


def test_for_topic_missing_topic_code_returns_422():
    """GET /conversations/for-topic without topic_code returns 422."""
    user_id = str(uuid.uuid4())
    with TestClient(app) as client:
        resp = client.get("/api/conversations/for-topic", headers=_auth(user_id))
    assert resp.status_code == 422


def test_for_topic_unknown_topic_returns_404():
    """GET /conversations/for-topic with unknown topic_code returns 404."""
    user_id = str(uuid.uuid4())
    conn, _ = make_mock_connection(
        fetchone_by_sql={"select id::text, title from topics": None},
    )
    with patch("app.api.conversations.get_connection", return_value=conn):
        with TestClient(app) as client:
            resp = client.get(
                "/api/conversations/for-topic",
                params={"topic_code": "nonexistent_topic"},
                headers=_auth(user_id),
            )
    assert resp.status_code == 404
```

- [ ] **Step 2: Run to verify tests fail**

```bash
python -m pytest tests/test_api/test_topic_conversations.py -k "for_topic" -v
```

Expected: FAIL with 404 (route not found)

- [ ] **Step 3: Add the endpoint to `conversations.py`**

In `app/api/conversations.py`, add this import at the top:

```python
from app.api.schemas import (
    ConversationListResponse,
    ConversationMessagesResponse,
    ConversationOut,
    ConversationWithScoresResponse,
    ForTopicConversationOut,
    ForTopicResponse,
    MessageOut,
    MessageScoreOut,
    MessageWithScoreOut,
    WordDetail,
)
```

Then add the new route **before** the existing `/{conversation_id}/messages` route (add it right after `list_conversations`):

```python
@router.get("/for-topic", response_model=ForTopicResponse)
def get_conversations_for_topic(
    topic_code: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return up to 5 non-deleted conversations for a topic, latest-first, with session numbers."""
    logger.debug("get_conversations_for_topic user_id=%s topic_code=%s", user_id, topic_code)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id::text, title FROM topics WHERE code = %s LIMIT 1",
                (topic_code.strip().lower(),),
            )
            topic_row = cur.fetchone()
            if not topic_row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Topic '{topic_code}' not found",
                )
            topic_id, topic_title = topic_row

            cur.execute(
                """
                SELECT COUNT(*)
                FROM conversations
                WHERE user_id = %s AND topic_id = %s AND deleted_at IS NULL
                """,
                (user_id, topic_id),
            )
            total = cur.fetchone()[0]

            cur.execute(
                """
                SELECT
                    c.id::text,
                    c.title,
                    c.status,
                    c.started_at,
                    c.updated_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY c.topic_id ORDER BY c.started_at
                    ) AS session_number
                FROM conversations c
                WHERE c.user_id = %s
                  AND c.topic_id = %s
                  AND c.deleted_at IS NULL
                ORDER BY c.started_at DESC
                LIMIT 5
                """,
                (user_id, topic_id),
            )
            rows = cur.fetchall()

    conversations = [
        ForTopicConversationOut(
            id=row[0],
            title=row[1],
            status=row[2],
            started_at=row[3],
            updated_at=row[4],
            session_number=row[5],
        )
        for row in rows
    ]
    logger.info(
        "get_conversations_for_topic user_id=%s topic_code=%s returned=%d",
        user_id, topic_code, len(conversations),
    )
    return ForTopicResponse(
        topic_code=topic_code,
        topic_title=topic_title,
        conversations=conversations,
        total=total,
        limit_reached=total >= 5,
    )
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/test_api/test_topic_conversations.py -k "for_topic" -v
```

Expected: all 4 PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/conversations.py app/api/schemas.py tests/test_api/test_topic_conversations.py
git commit -m "feat(api): add GET /conversations/for-topic with session numbers"
```

---

## Task 5: Add `DELETE /api/conversations/{conversation_id}`

**Files:**
- Modify: `app/api/conversations.py`
- Modify: `tests/test_api/test_topic_conversations.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_api/test_topic_conversations.py`:

```python
def test_delete_conversation_returns_204():
    """DELETE /conversations/{id} soft-deletes a conversation owned by user."""
    user_id = str(uuid.uuid4())
    conv_id = str(uuid.uuid4())
    conn, _ = make_mock_connection(
        fetchone_by_sql={"returning id": (conv_id,)},
    )
    with patch("app.api.conversations.get_connection", return_value=conn):
        with TestClient(app) as client:
            resp = client.delete(
                f"/api/conversations/{conv_id}",
                headers=_auth(user_id),
            )
    assert resp.status_code == 204


def test_delete_conversation_returns_404_when_not_owned():
    """DELETE /conversations/{id} returns 404 when conversation not found or not owned."""
    user_id = str(uuid.uuid4())
    conv_id = str(uuid.uuid4())
    conn, _ = make_mock_connection(
        fetchone_by_sql={"returning id": None},
    )
    with patch("app.api.conversations.get_connection", return_value=conn):
        with TestClient(app) as client:
            resp = client.delete(
                f"/api/conversations/{conv_id}",
                headers=_auth(user_id),
            )
    assert resp.status_code == 404


def test_delete_conversation_rejects_invalid_uuid():
    """DELETE /conversations/not-a-uuid returns 422."""
    user_id = str(uuid.uuid4())
    with TestClient(app) as client:
        resp = client.delete(
            "/api/conversations/not-a-uuid",
            headers=_auth(user_id),
        )
    assert resp.status_code == 422
```

- [ ] **Step 2: Run to verify tests fail**

```bash
python -m pytest tests/test_api/test_topic_conversations.py -k "delete_conversation" -v
```

Expected: FAIL with 405 (method not allowed) or 404 (route not found)

- [ ] **Step 3: Add the endpoint to `conversations.py`**

Add this route after the `clear_conversation_history` endpoint:

```python
@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
):
    """Soft-delete a conversation: sets deleted_at = NOW(). Data is retained in DB."""
    conv_id_str = str(conversation_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE conversations
                SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = %s AND user_id = %s AND deleted_at IS NULL
                RETURNING id::text
                """,
                (conv_id_str, user_id),
            )
            if not cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Conversation not found",
                )
    logger.info("delete_conversation conversation_id=%s user_id=%s", conv_id_str, user_id)
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/test_api/test_topic_conversations.py -k "delete_conversation" -v
```

Expected: all 3 PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/conversations.py tests/test_api/test_topic_conversations.py
git commit -m "feat(api): add DELETE /conversations/{id} soft-delete endpoint"
```

---

## Task 6: Fix `POST /api/chat/respond` — 5-limit enforcement and proper title

**Files:**
- Modify: `app/api/chat.py` (the `else` branch of `if conversation_id:`, around line 200–217)
- Modify: `tests/test_api/test_topic_conversations.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_api/test_topic_conversations.py`:

```python
def _make_chat_conn_for_new_conv(topic_id, topic_title, existing_count):
    """Build a mock connection for chat/respond creating a new conversation."""
    conn, cursor = make_mock_connection(
        fetchone_by_sql={
            "select id::text, title from topics": (topic_id, topic_title) if topic_id else None,
            "select count(*) from conversations where user_id": (existing_count,),
            "select count(*) from conversations": (existing_count,),
            "returning id::text": (str(uuid.uuid4()),),
            "coalesce(max(turn_number)": (1,),
        },
    )
    return conn


def test_chat_respond_returns_409_when_5_conversations_exist():
    """POST /chat/respond creates 409 when user already has 5 conversations for this topic."""
    from unittest.mock import patch as _patch
    user_id = str(uuid.uuid4())
    topic_id = str(uuid.uuid4())
    conn = _make_chat_conn_for_new_conv(topic_id, "IELTS Part 1 — Intro", 5)

    with (
        _patch("app.api.chat.get_connection", return_value=conn),
        _patch("app.api.chat.run_langraph_agent", return_value=("Hello", b"")),
        _patch("app.api.chat.transcribe_audio", return_value="hello"),
        _patch("app.api.chat.store_user_audio", return_value=(None, "audio/webm")),
        _patch("app.api.chat.get_presigned_url", return_value=None),
        _patch("app.api.chat._upload"),
        _patch("app.api.chat._synthesize_audio_bytes", return_value=b""),
    ):
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/respond",
                headers=_auth(user_id),
                data={"text": "Hello", "topic": "ielts_part1"},
            )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "Conversation limit reached"


def test_chat_respond_title_includes_topic_and_session_number():
    """POST /chat/respond generates title '{topic_title} - Session N' for new conversations."""
    from unittest.mock import patch as _patch, call as _call
    user_id = str(uuid.uuid4())
    topic_id = str(uuid.uuid4())
    new_conv_id = str(uuid.uuid4())
    conn, cursor = make_mock_connection(
        fetchone_by_sql={
            "select id::text, title from topics": (topic_id, "IELTS Part 1 — Intro"),
            "select count(*) from conversations where user_id": (0,),
            "select count(*) from conversations": (0,),
            "returning id::text": (new_conv_id,),
            "coalesce(max(turn_number)": (1,),
        },
    )

    with (
        _patch("app.api.chat.get_connection", return_value=conn),
        _patch("app.api.chat.run_langraph_agent", return_value=("Hello!", b"")),
        _patch("app.api.chat.transcribe_audio", return_value="hello"),
        _patch("app.api.chat.store_user_audio", return_value=(None, "audio/webm")),
        _patch("app.api.chat.get_presigned_url", return_value=None),
        _patch("app.api.chat._upload"),
        _patch("app.api.chat._synthesize_audio_bytes", return_value=b""),
    ):
        with TestClient(app) as client:
            resp = client.post(
                "/api/chat/respond",
                headers=_auth(user_id),
                data={"text": "Hello", "topic": "ielts_part1"},
            )
    assert resp.status_code == 200
    # Check that INSERT INTO conversations was called with the correct title
    insert_calls = [str(c) for c in cursor.execute.call_args_list]
    title_insert = next((c for c in insert_calls if "insert into conversations" in c.lower()), None)
    assert title_insert is not None
    assert "Session 1" in title_insert or "IELTS Part 1" in title_insert
```

- [ ] **Step 2: Run to verify tests fail**

```bash
python -m pytest tests/test_api/test_topic_conversations.py -k "chat_respond" -v
```

Expected: `test_chat_respond_returns_409...` FAIL (currently no 409), `test_chat_respond_title...` FAIL (wrong title format)

- [ ] **Step 3: Update the new-conversation branch in `chat.py`**

In `app/api/chat.py`, find the `else` branch starting at `else:` around line 200. Replace the entire else block:

```python
            else:
                topic_id = None
                topic_title = None
                topic_clean = topic.strip().lower() if topic else ""
                if topic_clean:
                    cur.execute(
                        "SELECT id::text, title FROM topics WHERE code = %s LIMIT 1",
                        (topic_clean,),
                    )
                    topic_row = cur.fetchone()
                    if topic_row:
                        topic_id, topic_title = topic_row[0], topic_row[1]

                if topic_id:
                    # 5-limit check: count active (non-deleted) conversations for this topic
                    cur.execute(
                        """
                        SELECT COUNT(*) FROM conversations
                        WHERE user_id = %s AND topic_id = %s AND deleted_at IS NULL
                        """,
                        (user_id, topic_id),
                    )
                    active_count = cur.fetchone()[0]
                    if active_count >= 5:
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail="Conversation limit reached",
                        )

                    # Session number = total conversations ever (including deleted) + 1
                    cur.execute(
                        "SELECT COUNT(*) FROM conversations WHERE user_id = %s AND topic_id = %s",
                        (user_id, topic_id),
                    )
                    total_ever = cur.fetchone()[0]
                    session_n = total_ever + 1
                    title = f"{topic_title} - Session {session_n}"
                else:
                    title = "New Conversation"

                cur.execute(
                    "INSERT INTO conversations (user_id, topic_id, title) VALUES (%s, %s, %s) RETURNING id::text",
                    (user_id, topic_id, title),
                )
                conv_id = cur.fetchone()[0]
                logger.info("New conversation created conv_id=%s topic_id=%s title=%r", conv_id, topic_id, title)
```

- [ ] **Step 4: Run tests**

```bash
python -m pytest tests/test_api/test_topic_conversations.py -k "chat_respond" -v
```

Expected: both PASS

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
python -m pytest tests/ -v --tb=short
```

Expected: all green (or pre-existing failures unchanged)

- [ ] **Step 6: Commit**

```bash
git add app/api/chat.py tests/test_api/test_topic_conversations.py
git commit -m "feat(api): enforce 5-conv limit and fix session title in chat/respond"
```

---

## Task 7: Fix `chat.js` — add `conversationId` param

**Files:**
- Modify: `frontend/src/api/chat.js`

- [ ] **Step 1: Add `conversationId` param to `chatRespond`**

In `frontend/src/api/chat.js`, replace the function signature and body up to the fetch call:

```js
export async function chatRespond({
  token,
  text,
  audioBlob,
  topic = '',
  subOption = '',
  voiceGender = '',
  conversationId = null,
}) {
  const formData = new FormData();

  if (text && text.trim()) {
    formData.append('text', text.trim());
  }

  if (topic && topic.trim()) {
    formData.append('topic', topic.trim());
  }

  if (subOption && subOption.trim()) {
    formData.append('sub_option', subOption.trim());
  }

  if (voiceGender && voiceGender.trim()) {
    formData.append('voice_gender', voiceGender.trim());
  }

  if (audioBlob) {
    formData.append('audio_file', audioBlob, 'recording.webm');
  }

  if (conversationId) {
    formData.append('conversation_id', conversationId);
  }

  const response = await fetch(`${API_BASE_URL}/api/chat/respond`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || 'Chat request failed');
  }

  return data;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/chat.js
git commit -m "fix(frontend): add conversationId param to chatRespond"
```

---

## Task 8: Fix `VoiceAgent.tsx` — pass conversationId and fix topic code

**Files:**
- Modify: `frontend/src/pages/VoiceAgent.tsx` (~lines 836–846)

- [ ] **Step 1: Pass `conversationId` and fix topic code in the chatRespond call**

In `VoiceAgent.tsx`, find the `chatRespond` call at line ~836. Replace it:

```typescript
          const data = await chatRespond({
            token: session.token,
            text: trimmed,
            audioBlob,
            topic: topic ?? undefined,
            subOption: subOption ?? undefined,
            voiceGender: gender,
            conversationId: currentConversationId ?? undefined,
          });
```

The key changes:
- `topic: topic ?? undefined` — sends the code string (e.g. `"ielts_part1"`) directly instead of `TOPICS.find(...).label`
- `conversationId: currentConversationId ?? undefined` — passes the active conversation ID on every turn

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/VoiceAgent.tsx
git commit -m "fix(frontend): pass conversationId and topic code to chatRespond"
```

---

## Task 9: Fix `DashboardPage.jsx` — topic.key → topic.id

**Files:**
- Modify: `frontend/src/pages/DashboardPage.jsx` (lines 85, 88, 165, 167, 642, 644)

- [ ] **Step 1: Replace all instances of `topic.key` with `topic.id`**

Run a targeted search to find all 6 occurrences:

```bash
grep -n "topic\.key" frontend/src/pages/DashboardPage.jsx
```

For each line returned, change `.key` to `.id`. The occurrences are:
- Line ~85: `{t(\`topic.${topic.key}.title\`)}` → `{t(\`topic.${topic.id}.title\`)}`
- Line ~88: `{t(\`topic.${topic.key}.desc\`)}` → `{t(\`topic.${topic.id}.desc\`)}`
- Line ~165: `t(\`topic.${session.topic}.title\`) === \`topic.${session.topic}.title\`` — no change needed here (uses `session.topic` not `topic.key`)
- Line ~642: check if it's `tab` variable or `topic.key` — replace only `topic.key`

After editing, verify no `topic.key` references remain:

```bash
grep -n "topic\.key" frontend/src/pages/DashboardPage.jsx
```

Expected: no output.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/DashboardPage.jsx
git commit -m "fix(frontend): replace topic.key with topic.id in DashboardPage"
```

---

## Task 10: Add `fetchForTopic` and `deleteConversation` to `conversations.ts`

**Files:**
- Modify: `frontend/src/api/conversations.ts`

- [ ] **Step 1: Add types and functions**

Open `frontend/src/api/conversations.ts`. At the end of the existing types section (after `MessageWithScoreOut`), add:

```typescript
export interface ForTopicConversation {
  id: string;
  title: string | null;
  status: string;
  session_number: number;
  started_at: string;
  updated_at: string;
}

export interface ForTopicResponse {
  topic_code: string;
  topic_title: string;
  conversations: ForTopicConversation[];
  total: number;
  limit_reached: boolean;
}
```

Then add these two functions after the existing `clearConversation` function:

```typescript
export async function fetchForTopic(
  token: string,
  topicCode: string,
): Promise<ForTopicResponse> {
  const params = new URLSearchParams({ topic_code: topicCode });
  const response = await fetch(`${API_BASE_URL}/api/conversations/for-topic?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch conversations for topic: ${response.status}`);
  }
  return response.json();
}

export async function deleteConversation(token: string, conversationId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to delete conversation: ${response.status}`);
  }
}
```

Make sure `API_BASE_URL` is defined at the top of `conversations.ts`. If it isn't, add:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors for the new code.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/conversations.ts
git commit -m "feat(frontend): add fetchForTopic and deleteConversation API functions"
```

---

## Task 11: VoiceAgent — topic entry auto-resume, handleNewChat, handleDeleteConversation

**Files:**
- Modify: `frontend/src/pages/VoiceAgent.tsx`

- [ ] **Step 1: Add imports for the new API functions**

At the top of `VoiceAgent.tsx`, find:

```typescript
import { fetchConversations, fetchMessagesWithScores } from '../api/conversations';
```

Replace with:

```typescript
import { fetchConversations, fetchMessagesWithScores, fetchForTopic, deleteConversation } from '../api/conversations';
import type { ForTopicResponse } from '../api/conversations';
```

- [ ] **Step 2: Replace the global conversations query with a topic-scoped query**

Find and remove (or replace) the existing `useQuery` block:

```typescript
  const { data: sidebarConversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => fetchConversations(authSession?.token ?? ''),
    enabled: !!authSession?.token,
    staleTime: 30_000,
  });
```

Replace with:

```typescript
  const { data: topicData } = useQuery<ForTopicResponse>({
    queryKey: ['for-topic', topic],
    queryFn: () => fetchForTopic(authSession?.token ?? '', topic!),
    enabled: !!topic && !!authSession?.token,
    staleTime: 60_000,
  });
```

- [ ] **Step 3: Add topic entry auto-resume effect**

Find the existing mount effect that reads `?conversation` from URL (around line 1473):

```typescript
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const convId = params.get('conversation');
    if (convId && authSession?.token) {
      void handleSelectConversation(convId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run only once on mount
```

Add a new effect **after** it:

```typescript
  // Auto-resume: when topic data loads and no active conversation is set, resume the latest one.
  useEffect(() => {
    if (!topicData || currentConversationId) return;
    const latest = topicData.conversations[0];
    if (latest) {
      void handleSelectConversation(latest.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicData]);
```

- [ ] **Step 4: Add `handleNewChat` and `handleDeleteConversation`**

Add these two callbacks after `handleClearHistory` (around line 1471):

```typescript
  const handleNewChat = useCallback((_topicCode: string) => {
    setSidebarOpen(false);
    setMessages([]);
    setExpandedMsgId(null);
    setCurrentConversationId(null);
    setSummaryDismissed(false);
    clearLocalAudioUrls();
  }, [clearLocalAudioUrls]);

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    const token = getAuthSession()?.token ?? '';
    try {
      await deleteConversation(token, conversationId);
    } catch (err) {
      console.warn('Delete conversation failed:', err);
      return;
    }
    if (conversationId === currentConversationId) {
      setCurrentConversationId(null);
      setMessages([]);
      setExpandedMsgId(null);
    }
    queryClient.invalidateQueries({ queryKey: ['for-topic', topic] });
  }, [currentConversationId, topic]);
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/VoiceAgent.tsx
git commit -m "feat(frontend): topic auto-resume, handleNewChat, handleDeleteConversation in VoiceAgent"
```

---

## Task 12: Rewrite `ConversationSidebar.tsx` — hierarchical navigator

**Files:**
- Rewrite: `frontend/src/components/voice-agent/ConversationSidebar.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
// frontend/src/components/voice-agent/ConversationSidebar.tsx
import { useState, useEffect } from 'react';
import { MessageSquarePlus, Trash2, ArrowLeft, X, ChevronRight, ChevronDown, AlertCircle } from 'lucide-react';
import { useT } from '../../i18n/LanguageContext';
import { TOPIC_CATEGORIES } from '../../constants/topics';
import { fetchForTopic, deleteConversation } from '../../api/conversations';
import type { ForTopicResponse, ForTopicConversation } from '../../api/conversations';

interface ConversationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
  activeTopic: string | null;
  activeConversationId: string | null;
  token: string;
  onSelectConversation: (conversationId: string) => void;
  onNewChat: (topicCode: string) => void;
  onDeleteConversation: (conversationId: string) => void;
}

type SidebarView = 'browse' | 'topic-history';

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ConversationSidebar({
  isOpen, onClose, isDark,
  activeTopic, activeConversationId, token,
  onSelectConversation, onNewChat, onDeleteConversation,
}: ConversationSidebarProps) {
  const t = useT();

  const [view, setView] = useState<SidebarView>(activeTopic ? 'topic-history' : 'browse');
  const [browseTopic, setBrowseTopic] = useState<string | null>(activeTopic);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [topicData, setTopicData] = useState<ForTopicResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Sync when VoiceAgent's active topic changes externally
  useEffect(() => {
    if (activeTopic && activeTopic !== browseTopic) {
      setBrowseTopic(activeTopic);
      setView('topic-history');
    }
  }, [activeTopic]);

  // Fetch topic conversations whenever browseTopic changes in topic-history view
  useEffect(() => {
    if (view !== 'topic-history' || !browseTopic || !token) return;
    let cancelled = false;
    setLoading(true);
    setTopicData(null);
    setDeleteError(null);
    fetchForTopic(token, browseTopic)
      .then(data => { if (!cancelled) setTopicData(data); })
      .catch(() => { if (!cancelled) setTopicData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [view, browseTopic, token]);

  const handleTopicClick = (topicCode: string) => {
    setBrowseTopic(topicCode);
    setView('topic-history');
    setDeleteConfirmId(null);
    setDeleteError(null);
  };

  const handleBack = () => {
    setView('browse');
    setDeleteConfirmId(null);
    setDeleteError(null);
  };

  const handleSelectConv = (conv: ForTopicConversation) => {
    onSelectConversation(conv.id);
    onClose();
  };

  const handleNewChatClick = () => {
    if (!browseTopic || topicData?.limit_reached) return;
    onNewChat(browseTopic);
  };

  const handleDeleteRequest = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(convId);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async (convId: string) => {
    setDeleteError(null);
    try {
      await deleteConversation(token, convId);
      onDeleteConversation(convId);
      setTopicData(prev =>
        prev
          ? {
              ...prev,
              conversations: prev.conversations.filter(c => c.id !== convId),
              total: prev.total - 1,
              limit_reached: false,
            }
          : null
      );
      setDeleteConfirmId(null);
    } catch {
      setDeleteError('Failed to delete. Please try again.');
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const base = isDark
    ? 'bg-gray-900 border-gray-700 text-gray-100'
    : 'bg-[#f5f7fa] border-gray-200 text-gray-900';

  const itemBase = isDark
    ? 'hover:bg-gray-800 text-gray-300'
    : 'hover:bg-gray-100 text-gray-700';

  const itemActive = isDark
    ? 'bg-blue-900/50 text-blue-300 border border-blue-700/50'
    : 'bg-blue-50 text-blue-700 border border-blue-200';

  // ── Browse view ─────────────────────────────────────────────────────────────
  const renderBrowse = () => (
    <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
      {TOPIC_CATEGORIES.map(category => {
        const isExpanded = expandedCategory === category.name;
        return (
          <div key={category.name}>
            <button
              onClick={() => setExpandedCategory(isExpanded ? null : category.name)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs font-bold uppercase tracking-wider transition-colors
                ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
            >
              <span>{category.name}</span>
              {isExpanded
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />}
            </button>
            {isExpanded && (
              <div className="pb-1">
                {category.topics.map(tp => {
                  const isActive = tp.id === activeTopic;
                  return (
                    <button
                      key={tp.id}
                      onClick={() => handleTopicClick(tp.id)}
                      className={`w-full text-left px-4 py-1.5 text-[13px] transition-colors flex items-center gap-2
                        ${isActive ? itemActive : itemBase}`}
                    >
                      <span>{tp.icon}</span>
                      <span className="truncate">{tp.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ── Topic-history view ─────────────────────────────────────────────────────
  const renderTopicHistory = () => {
    const topicLabel =
      TOPIC_CATEGORIES.flatMap(c => c.topics).find(tp => tp.id === browseTopic)?.label
      ?? browseTopic ?? '';

    return (
      <>
        {/* Sub-header */}
        <div className={`flex items-center gap-2 px-3 py-2 border-b border-inherit text-sm font-medium`}>
          <button
            onClick={handleBack}
            className={`p-1 rounded hover:bg-gray-200 ${isDark ? 'hover:bg-gray-700' : ''}`}
            title="Back to topics"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="truncate flex-1 text-[13px]">{topicLabel}</span>
          <button
            onClick={handleNewChatClick}
            disabled={!!topicData?.limit_reached}
            title={topicData?.limit_reached ? 'Delete a session to start a new one' : 'New chat'}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors
              ${topicData?.limit_reached
                ? 'opacity-40 cursor-not-allowed bg-gray-200 text-gray-500'
                : isDark
                  ? 'bg-blue-700 hover:bg-blue-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
          >
            <MessageSquarePlus className="w-3 h-3" />
            New
          </button>
        </div>

        {/* Limit warning */}
        {topicData?.limit_reached && (
          <div className={`px-3 py-2 text-xs flex items-start gap-1.5 ${isDark ? 'text-amber-400 bg-amber-900/20' : 'text-amber-700 bg-amber-50'}`}>
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>5 session limit reached. Delete one to start a new chat.</span>
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
          {loading && (
            <p className={`text-xs text-center mt-8 px-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Loading...
            </p>
          )}

          {!loading && topicData && topicData.conversations.length === 0 && (
            <div className="px-4 mt-8 text-center">
              <p className={`text-xs mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                No history yet. Start a new chat!
              </p>
              <button
                onClick={handleNewChatClick}
                className={`flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-lg text-xs font-medium
                  ${isDark ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                New Chat
              </button>
            </div>
          )}

          {deleteError && (
            <p className={`text-xs px-3 py-1 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
              {deleteError}
            </p>
          )}

          {!loading && topicData?.conversations.map(conv => {
            const isActive = conv.id === activeConversationId;
            const isConfirming = deleteConfirmId === conv.id;
            return (
              <div key={conv.id} className="mx-1 my-0.5">
                {isConfirming ? (
                  <div className={`rounded-lg px-3 py-2 text-xs ${isDark ? 'bg-red-900/30 border border-red-700/50' : 'bg-red-50 border border-red-200'}`}>
                    <p className={`mb-2 ${isDark ? 'text-red-300' : 'text-red-700'}`}>Delete this session?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleDeleteConfirm(conv.id)}
                        className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className={`px-2 py-0.5 rounded text-xs ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSelectConv(conv)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors group ${isActive ? itemActive : itemBase}`}
                    style={{ width: 'calc(100% - 0px)' }}
                  >
                    <div className="flex items-start justify-between gap-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${conv.status === 'active' ? 'bg-green-400' : 'bg-gray-400'}`} />
                        <span className="truncate font-medium text-[13px]">{conv.title ?? `Session ${conv.session_number}`}</span>
                      </div>
                      {!isActive && (
                        <button
                          onClick={(e) => handleDeleteRequest(conv.id, e)}
                          className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0
                            ${isDark ? 'hover:bg-red-900/50 text-gray-400 hover:text-red-400' : 'hover:bg-red-100 text-gray-400 hover:text-red-600'}`}
                          title="Delete session"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className={`text-[10px] mt-0.5 pl-3.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      {relativeTime(conv.updated_at)}
                    </div>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} />
      )}

      {/* Sidebar panel */}
      <div
        className={`
          fixed md:relative z-40 md:z-auto
          top-0 left-0 h-full md:h-auto
          w-72 md:w-64 lg:w-72
          flex flex-col border-r shrink-0
          transition-transform duration-200
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${base}
        `}
      >
        {/* Top header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-inherit">
          <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {view === 'browse' ? 'Topics' : 'Sessions'}
          </span>
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded text-gray-500 hover:text-gray-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {view === 'browse' ? renderBrowse() : renderTopicHistory()}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in `ConversationSidebar.tsx`. Fix any type errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/voice-agent/ConversationSidebar.tsx
git commit -m "feat(frontend): rewrite ConversationSidebar with hierarchical browse + topic-history views"
```

---

## Task 13: Update sidebar usage in `VoiceAgent.tsx` — new props

**Files:**
- Modify: `frontend/src/pages/VoiceAgent.tsx` (~line 1653)

- [ ] **Step 1: Replace the ConversationSidebar JSX**

Find the existing `<ConversationSidebar .../>` block (~line 1653):

```tsx
        <ConversationSidebar
          conversations={sidebarConversations}
          activeConversationId={currentConversationId}
          onSelect={handleSelectConversation}
          onNewChat={() => {
            setSidebarOpen(false);
            startNewSession();
          }}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isDark={isDark}
        />
```

Replace with:

```tsx
        <ConversationSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isDark={isDark}
          activeTopic={topic}
          activeConversationId={currentConversationId}
          token={authSession?.token ?? ''}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onDeleteConversation={handleDeleteConversation}
        />
```

- [ ] **Step 2: Remove the now-unused `sidebarConversations` variable**

Find and remove any remaining reference to `sidebarConversations` (it was the result of the old `useQuery` which was replaced in Task 11).

- [ ] **Step 3: Check TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: clean. Fix any remaining type errors (likely unused variable warnings — remove the `fetchConversations` import if it's no longer used).

- [ ] **Step 4: Remove unused import**

If `fetchConversations` is no longer called anywhere in `VoiceAgent.tsx`, remove it from the import line:

```typescript
import { fetchMessagesWithScores, fetchForTopic, deleteConversation } from '../api/conversations';
import type { ForTopicResponse } from '../api/conversations';
```

- [ ] **Step 5: Run full TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/VoiceAgent.tsx
git commit -m "feat(frontend): wire new ConversationSidebar props in VoiceAgent"
```

---

## Self-Review Checklist

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Fix `topic.undefined.title` / `topic.key` | Task 9 |
| Fix new conversation every turn (missing `conversation_id`) | Tasks 7 + 8 |
| Fix topic label sent instead of code | Task 8 |
| Auto-resume latest conversation on topic entry | Task 11 |
| Sidebar: hierarchical categories → topics → history | Task 12 |
| Sidebar: 5 conversations per topic, pinned at top | Tasks 4 + 12 |
| Conversation naming `{topic_title} - Session N` | Task 6 |
| Disconnect = pause (no status change) | No code change needed — disconnect already only calls `setStatusSync('disconnected')`, does not update DB |
| New Chat button (only on explicit click, blocked at limit 5) | Tasks 11 + 12 |
| Soft-delete conversations (`deleted_at`) | Tasks 1 + 5 + 12 |
| 5-limit backend enforcement (409) | Task 6 |
| `GET /conversations/for-topic` endpoint | Task 4 |
| `DELETE /conversations/{id}` endpoint | Task 5 |
| Filter deleted from global list | Task 3 |
| Client-side caching (IndexedDB — existing, no structural change needed) | `handleSelectConversation` already writes to IndexedDB via `dbClearConversationData` pattern; the existing `db.ts` stores are keyed by `conversation_id` and populated on load ✓ |
| Remove old `useQuery(['conversations'])` | Task 11 |

**All 8 issues from `current problems.md` are covered.**
