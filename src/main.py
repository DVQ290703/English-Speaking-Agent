from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, Security, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import DEFAULT_MODEL, DEFAULT_VOICE, LOG_LEVEL, UPLOAD_DIR
from .db import db_session, init_db, row_to_dict, rows_to_dicts
from .schemas import (
    AuthLoginRequest,
    AuthRegisterRequest,
    ChatResponse,
    ChatTurnRead,
    ConfigRead,
    ConfigUpdate,
    EvaluationRead,
    MessageDetailResponse,
    MessageListResponse,
    PracticeSessionCreateRequest,
    PracticeSessionDetailResponse,
    PracticeSessionListResponse,
    PracticeSessionRead,
    StatusResponse,
    TextChatRequest,
    TokenResponse,
    TopicRead,
    UserRead,
)
from .security import create_access_token, hash_password, verify_password
from .services import create_mock_user_audio, make_analysis_payload, score_audio, score_text

app = FastAPI(
    title="AI Speaking Coach API",
    version="1.0.0",
    description="FastAPI backend for the AI Speaking Coach MVP.",
)

bearer_scheme = HTTPBearer(auto_error=False, scheme_name="BearerAuth")


def current_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_topic_row(row: dict) -> dict:
    return {
        "id": row["id"],
        "slug": row["slug"],
        "title": row["title"],
        "description": row["description"],
        "system_prompt": row["system_prompt"],
    }


def normalize_user_row(row: dict) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "display_name": row["display_name"],
    }


def parse_feedback(raw: str) -> list[str]:
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(item) for item in parsed]
    except Exception:
        pass
    return [raw]


def resolve_value(value: str | None, fallback: str) -> str:
    return value.strip() if value and value.strip() else fallback


def generate_session_title(topic_title: str | None = None) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    if topic_title:
        return f"{topic_title} - {timestamp}"
    return f"Practice Session - {timestamp}"


def get_practice_session(conn, session_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM practice_sessions WHERE id = ?", (session_id,)).fetchone()
    return row_to_dict(row)


def get_active_practice_session(conn, user_id: int) -> dict | None:
    row = conn.execute(
        """
        SELECT *
        FROM practice_sessions
        WHERE user_id = ? AND status = 'active'
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    return row_to_dict(row)


def practice_session_summary(conn, row: dict) -> PracticeSessionRead:
    stats = conn.execute(
        """
        SELECT
            COUNT(*) AS message_count,
            MAX(created_at) AS last_message_at
        FROM messages
        WHERE practice_session_id = ?
        """,
        (row["id"],),
    ).fetchone()
    return PracticeSessionRead(
        id=row["id"],
        user_id=row["user_id"],
        topic_id=row["topic_id"],
        title=row["title"],
        notes=row["notes"],
        status=row["status"],
        started_at=row["started_at"],
        ended_at=row["ended_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        message_count=stats["message_count"] if stats else 0,
        last_message_at=stats["last_message_at"] if stats else None,
    )


def create_practice_session(
    conn,
    *,
    user_id: int,
    topic_id: int | None = None,
    title: str | None = None,
    notes: str = "",
    status: str = "active",
) -> dict:
    topic_title = None
    if topic_id is not None:
        topic = get_topic(conn, topic_id)
        topic_title = topic["title"] if topic else None
    final_title = title.strip() if title and title.strip() else generate_session_title(topic_title)
    now = current_iso()
    cursor = conn.execute(
        """
        INSERT INTO practice_sessions (
            user_id, topic_id, title, notes, status, started_at, ended_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            topic_id,
            final_title,
            notes.strip(),
            status,
            now,
            None,
            now,
            now,
        ),
    )
    return get_practice_session(conn, cursor.lastrowid)


def ensure_practice_session(
    conn,
    *,
    user_id: int,
    topic_id: int | None = None,
    practice_session_id: int | None = None,
) -> dict:
    if practice_session_id is not None:
        session = get_practice_session(conn, practice_session_id)
        if session is None or session["user_id"] != user_id:
            raise HTTPException(status_code=404, detail="Practice session not found")
        if session["status"] != "active":
            raise HTTPException(status_code=400, detail="Practice session is closed")
        return session

    active_session = get_active_practice_session(conn, user_id)
    if active_session is not None and (
        topic_id is None or active_session["topic_id"] == topic_id
    ):
        return active_session
    return create_practice_session(conn, user_id=user_id, topic_id=topic_id)


def close_practice_session(conn, *, session_id: int, user_id: int) -> dict:
    session = get_practice_session(conn, session_id)
    if session is None or session["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Practice session not found")
    if session["status"] == "completed":
        return session
    now = current_iso()
    conn.execute(
        """
        UPDATE practice_sessions
        SET status = 'completed', ended_at = COALESCE(ended_at, ?), updated_at = ?
        WHERE id = ?
        """,
        (now, now, session_id),
    )
    return get_practice_session(conn, session_id)


def count_topic_attempts(conn, *, user_id: int, topic_id: int) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS count FROM messages WHERE user_id = ? AND topic_id = ?",
        (user_id, topic_id),
    ).fetchone()
    return (row["count"] if row else 0) + 1


def get_user_by_id(conn, user_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return row_to_dict(row)


def get_user_by_username(conn, username: str) -> dict | None:
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    return row_to_dict(row)


def get_topic(conn, topic_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM topics WHERE id = ?", (topic_id,)).fetchone()
    return row_to_dict(row)


def get_preferences(conn, user_id: int) -> dict:
    pref = conn.execute(
        "SELECT * FROM user_preferences WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if pref is None:
        conn.execute(
            """
            INSERT INTO user_preferences (user_id, model_name, voice_name, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, DEFAULT_MODEL, DEFAULT_VOICE, current_iso()),
        )
        pref = conn.execute(
            "SELECT * FROM user_preferences WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    return row_to_dict(pref)


def require_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer_scheme)] = None,
) -> dict:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = credentials.credentials.strip()
    with db_session() as conn:
        user = conn.execute(
            """
            SELECT u.*
            FROM user_sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        conn.execute(
            "UPDATE user_sessions SET last_used_at = ? WHERE token = ?",
            (current_iso(), token),
        )
        user_data = row_to_dict(user)
        pref = get_preferences(conn, user_data["id"])
        return {"user": user_data, "preferences": pref, "token": token}


def normalize_turn(conn, row: dict) -> dict:
    user = get_user_by_id(conn, row["user_id"])
    topic = get_topic(conn, row["topic_id"])
    eval_row = conn.execute(
        "SELECT * FROM message_evaluations WHERE message_id = ?",
        (row["id"],),
    ).fetchone()
    eval_data = row_to_dict(eval_row)
    if user is None or topic is None:
        raise HTTPException(status_code=404, detail="Message data not found")
    if eval_data is None:
        raise HTTPException(status_code=404, detail="Evaluation data not found")
    user_input_text = row.get("user_input_text") or row["content_text"]
    transcript_text = row.get("transcript_text") or row["content_text"]
    user_audio_path = row.get("user_audio_path") or row["audio_path"]
    return {
        "id": row["id"],
        "user": normalize_user_row(user),
        "topic": normalize_topic_row(topic),
        "practice_session_id": row["practice_session_id"],
        "role": row["role"],
        "input_mode": row["input_mode"],
        "attempt_no": row["attempt_no"],
        "user_input_text": user_input_text,
        "transcript_text": transcript_text,
        "content_text": transcript_text,
        "user_audio_path": user_audio_path,
        "duration_seconds": row["duration_seconds"],
        "word_count": row["word_count"],
        "pause_count": row["pause_count"],
        "audio_path": user_audio_path,
        "agent_reply_text": row["agent_reply_text"],
        "agent_audio_path": row["agent_audio_path"],
        "model_name": row["model_name"],
        "voice_name": row["voice_name"],
        "created_at": row["created_at"],
        "evaluation": {
            "message_id": row["id"],
            "transcript": eval_data["transcript"],
            "grammar_score": eval_data["grammar_score"],
            "vocabulary_score": eval_data["vocabulary_score"],
            "fluency_score": eval_data["fluency_score"],
            "coherence_score": eval_data["coherence_score"],
            "lexical_resource_score": eval_data["lexical_resource_score"],
            "pronunciation_score": eval_data["pronunciation_score"],
            "corrected_text": eval_data["corrected_text"],
            "feedback": parse_feedback(eval_data["feedback_json"]),
            "rubric_version": eval_data["rubric_version"],
            "summary": eval_data["summary"],
            "is_mock": bool(eval_data["is_mock"]),
            "created_at": eval_data["created_at"],
        },
    }


def turn_dict_to_chat_turn(turn: dict) -> ChatTurnRead:
    return ChatTurnRead(
        id=turn["id"],
        user=UserRead(**turn["user"]),
        topic=TopicRead(**turn["topic"]),
        practice_session_id=turn["practice_session_id"],
        role=turn["role"],
        input_mode=turn["input_mode"],
        attempt_no=turn["attempt_no"],
        user_input_text=turn["user_input_text"],
        transcript_text=turn["transcript_text"],
        content_text=turn["content_text"],
        user_audio_path=turn["user_audio_path"],
        duration_seconds=turn["duration_seconds"],
        word_count=turn["word_count"],
        pause_count=turn["pause_count"],
        audio_path=turn["audio_path"],
        agent_reply_text=turn["agent_reply_text"],
        agent_audio_path=turn["agent_audio_path"],
        model_name=turn["model_name"],
        voice_name=turn["voice_name"],
        created_at=turn["created_at"],
        evaluation=EvaluationRead(**turn["evaluation"]),
    )


def message_row_to_chat_turn(conn, row: dict) -> ChatTurnRead:
    turn = normalize_turn(conn, row)
    return turn_dict_to_chat_turn(turn)


def store_turn(
    conn,
    *,
    user_id: int,
    topic_id: int,
    practice_session_id: int | None,
    input_mode: str,
    user_input_text: str,
    transcript_text: str,
    user_audio_path: str | None,
    analysis: dict,
    model_name: str,
    voice_name: str,
) -> dict:
    topic = get_topic(conn, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    session = ensure_practice_session(
        conn,
        user_id=user_id,
        topic_id=topic_id,
        practice_session_id=practice_session_id,
    )
    attempt_no = count_topic_attempts(conn, user_id=user_id, topic_id=topic_id)

    created_at = current_iso()
    cursor = conn.execute(
        """
        INSERT INTO messages (
            user_id, topic_id, practice_session_id, role, input_mode, attempt_no,
            user_input_text, transcript_text, user_audio_path,
            duration_seconds, word_count, pause_count,
            content_text, audio_path, agent_reply_text, agent_audio_path,
            model_name, voice_name, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            topic_id,
            session["id"],
            "user",
            input_mode,
            attempt_no,
            user_input_text,
            transcript_text,
            user_audio_path,
            analysis.get("duration_seconds"),
            analysis.get("word_count"),
            analysis.get("pause_count"),
            transcript_text,
            user_audio_path,
            f"{topic['title']}: {analysis['summary']}",
            None,
            model_name,
            voice_name,
            created_at,
        ),
    )
    message_id = cursor.lastrowid
    analysis_payload = make_analysis_payload(
        message_id,
        topic["title"],
        topic["slug"],
        user_audio_path,
        analysis,
        voice_name,
    )
    conn.execute(
        "UPDATE messages SET agent_audio_path = ?, agent_reply_text = ? WHERE id = ?",
        (
            analysis_payload["agent_audio_path"],
            analysis_payload["agent_reply_text"],
            message_id,
        ),
    )
    conn.execute(
        """
        INSERT INTO message_evaluations (
            message_id, transcript, grammar_score, vocabulary_score,
            fluency_score, coherence_score, lexical_resource_score,
            pronunciation_score, corrected_text, feedback_json, rubric_version,
            summary, is_mock, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            message_id,
            analysis["transcript"],
            analysis["grammar_score"],
            analysis["vocabulary_score"],
            analysis.get("fluency_score"),
            analysis.get("coherence_score"),
            analysis.get("lexical_resource_score"),
            analysis["pronunciation_score"],
            analysis["corrected_text"],
            json.dumps(analysis["feedback"], ensure_ascii=False),
            analysis.get("rubric_version", "v1"),
            analysis["summary"],
            1 if analysis.get("is_mock", True) else 0,
            created_at,
        ),
    )
    conn.execute(
        "UPDATE practice_sessions SET updated_at = ? WHERE id = ?",
        (created_at, session["id"]),
    )
    row = conn.execute("SELECT * FROM messages WHERE id = ?", (message_id,)).fetchone()
    return normalize_turn(conn, row_to_dict(row))


def seed_demo_data() -> None:
    demo_users = [
        ("demo_student", "Demo@1234", "Demo Student"),
        ("minh_nguyen", "Demo@1234", "Minh Nguyen"),
    ]
    demo_topics = [
        (
            "part-1-self-introduction",
            "IELTS Part 1 - Self Introduction",
            "Warm-up questions about your background and daily life.",
            "You are an IELTS speaking examiner. Give short, natural prompts and simple follow-up questions.",
        ),
        (
            "part-2-describe-person",
            "IELTS Part 2 - Describe a Person",
            "Cue card practice with one-minute style answers.",
            "You are an IELTS speaking examiner. Encourage structured answers with introduction, details, and conclusion.",
        ),
        (
            "part-3-opinion",
            "IELTS Part 3 - Opinion Discussion",
            "Abstract discussion questions for deeper speaking practice.",
            "You are an IELTS speaking examiner. Push the learner to explain reasons, compare ideas, and justify opinions.",
        ),
    ] 

    def repair_existing_history(conn) -> None:
        rows = rows_to_dicts(conn.execute("SELECT * FROM messages ORDER BY id").fetchall())
        for row in rows:
            topic = get_topic(conn, row["topic_id"])
            if topic is None:
                continue

            user_input_text = row.get("user_input_text") or row["content_text"]
            transcript_text = row.get("transcript_text") or row["content_text"]
            user_audio_path = row.get("user_audio_path") or row["audio_path"]

            if row["input_mode"] == "audio" and not user_audio_path:
                user_audio_path = create_mock_user_audio(row["id"], topic["slug"])

            content_text = transcript_text if row["input_mode"] == "audio" else user_input_text
            audio_path = user_audio_path if row["input_mode"] == "audio" else None

            conn.execute(
                """
                UPDATE messages
                SET user_input_text = ?,
                    transcript_text = ?,
                    user_audio_path = ?,
                    content_text = ?,
                    audio_path = ?
                WHERE id = ?
                """,
                (
                    user_input_text,
                    transcript_text,
                    user_audio_path,
                    content_text,
                    audio_path,
                    row["id"],
                ),
            )

    with db_session() as conn:
        user_count = conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
        if user_count == 0:
            for username, password, display_name in demo_users:
                conn.execute(
                    """
                    INSERT INTO users (username, password_hash, display_name, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (username, hash_password(password), display_name, current_iso()),
                )

        topic_count = conn.execute("SELECT COUNT(*) AS count FROM topics").fetchone()["count"]
        if topic_count == 0:
            for slug, title, description, prompt in demo_topics:
                conn.execute(
                    """
                    INSERT INTO topics (slug, title, description, system_prompt, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (slug, title, description, prompt, current_iso()),
                )

        message_count = conn.execute("SELECT COUNT(*) AS count FROM messages").fetchone()["count"]
        if message_count == 0:
            users = rows_to_dicts(conn.execute("SELECT * FROM users ORDER BY id").fetchall())
            topics = rows_to_dicts(conn.execute("SELECT * FROM topics ORDER BY id").fetchall())
            sample_payloads = [
                {
                    "username": "demo_student",
                    "topic_slug": "part-1-self-introduction",
                    "mode": "text",
                    "content": "i usually study english in the evening because it helps me relax.",
                },
                {
                    "username": "demo_student",
                    "topic_slug": "part-2-describe-person",
                    "mode": "audio",
                    "content": "Here is my practice response for a cue card question.",
                },
                {
                    "username": "minh_nguyen",
                    "topic_slug": "part-3-opinion",
                    "mode": "text",
                    "content": "Technology is useful because it makes learning faster and more flexible.",
                },
            ]
            for payload in sample_payloads:
                user = next((item for item in users if item["username"] == payload["username"]), None)
                topic = next((item for item in topics if item["slug"] == payload["topic_slug"]), None)
                if not user or not topic:
                    continue
                if payload["mode"] == "text":
                    evaluation = score_text(payload["content"])
                    user_audio_path = None
                    transcript_text = evaluation["transcript"]
                else:
                    user_audio_path = create_mock_user_audio(10_000 + topic["id"], topic["slug"])
                    evaluation = score_audio(
                        payload["content"],
                        user_audio_path,
                        Path(user_audio_path).stat().st_size,
                    )
                    transcript_text = evaluation["transcript"]
                store_turn(
                    conn,
                    user_id=user["id"],
                    topic_id=topic["id"],
                    practice_session_id=None,
                    input_mode=payload["mode"],
                    user_input_text=payload["content"],
                    transcript_text=transcript_text,
                    user_audio_path=user_audio_path,
                    analysis=evaluation,
                    model_name=DEFAULT_MODEL,
                    voice_name=DEFAULT_VOICE,
                )

        repair_existing_history(conn)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    seed_demo_data()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "ai-speaking-coach-api", "log_level": LOG_LEVEL}


@app.post("/auth/register", response_model=TokenResponse)
def register(payload: AuthRegisterRequest) -> TokenResponse:
    with db_session() as conn:
        if get_user_by_username(conn, payload.username):
            raise HTTPException(status_code=409, detail="Username already exists")

        cursor = conn.execute(
            """
            INSERT INTO users (username, password_hash, display_name, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (payload.username, hash_password(payload.password), payload.display_name, current_iso()),
        )
        user_id = cursor.lastrowid
        conn.execute(
            """
            INSERT INTO user_preferences (user_id, model_name, voice_name, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, DEFAULT_MODEL, DEFAULT_VOICE, current_iso()),
        )
        token = create_access_token()
        conn.execute(
            """
            INSERT INTO user_sessions (token, user_id, created_at, last_used_at)
            VALUES (?, ?, ?, ?)
            """,
            (token, user_id, current_iso(), current_iso()),
        )
        user = get_user_by_id(conn, user_id)
        return TokenResponse(access_token=token, user=UserRead(**normalize_user_row(user)))


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: AuthLoginRequest) -> TokenResponse:
    with db_session() as conn:
        user = get_user_by_username(conn, payload.username)
        if not user or not verify_password(payload.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        token = create_access_token()
        conn.execute(
            """
            INSERT INTO user_sessions (token, user_id, created_at, last_used_at)
            VALUES (?, ?, ?, ?)
            """,
            (token, user["id"], current_iso(), current_iso()),
        )
        conn.execute(
            "INSERT OR IGNORE INTO user_preferences (user_id, model_name, voice_name, updated_at) VALUES (?, ?, ?, ?)",
            (user["id"], DEFAULT_MODEL, DEFAULT_VOICE, current_iso()),
        )
        return TokenResponse(access_token=token, user=UserRead(**normalize_user_row(user)))


@app.get("/auth/me", response_model=UserRead)
def me(current: dict = Depends(require_current_user)) -> UserRead:
    return UserRead(**normalize_user_row(current["user"]))


@app.post("/auth/logout", response_model=StatusResponse)
def logout(current: dict = Depends(require_current_user)) -> StatusResponse:
    with db_session() as conn:
        conn.execute("DELETE FROM user_sessions WHERE token = ?", (current["token"],))
    return StatusResponse()


@app.get("/topics", response_model=list[TopicRead])
def list_topics() -> list[TopicRead]:
    with db_session() as conn:
        rows = conn.execute("SELECT * FROM topics ORDER BY id").fetchall()
        return [TopicRead(**normalize_topic_row(row_to_dict(row))) for row in rows]


@app.get("/topics/{topic_id}", response_model=TopicRead)
def get_topic_detail(topic_id: int) -> TopicRead:
    with db_session() as conn:
        row = conn.execute("SELECT * FROM topics WHERE id = ?", (topic_id,)).fetchone()
        topic = row_to_dict(row)
        if topic is None:
            raise HTTPException(status_code=404, detail="Topic not found")
        return TopicRead(**normalize_topic_row(topic))


@app.post("/practice-sessions", response_model=PracticeSessionRead)
def create_practice_session_endpoint(
    payload: PracticeSessionCreateRequest,
    current: dict = Depends(require_current_user),
) -> PracticeSessionRead:
    with db_session() as conn:
        session = create_practice_session(
            conn,
            user_id=current["user"]["id"],
            topic_id=payload.topic_id,
            title=payload.title,
            notes=payload.notes,
        )
        return practice_session_summary(conn, session)


@app.get("/practice-sessions", response_model=PracticeSessionListResponse)
def list_practice_sessions(current: dict = Depends(require_current_user)) -> PracticeSessionListResponse:
    with db_session() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM practice_sessions
            WHERE user_id = ?
            ORDER BY updated_at DESC, id DESC
            """,
            (current["user"]["id"],),
        ).fetchall()
        return PracticeSessionListResponse(
            items=[practice_session_summary(conn, row_to_dict(row)) for row in rows],
        )


@app.get("/practice-sessions/{session_id}", response_model=PracticeSessionDetailResponse)
def get_practice_session_detail(
    session_id: int,
    current: dict = Depends(require_current_user),
) -> PracticeSessionDetailResponse:
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?",
            (session_id, current["user"]["id"]),
        ).fetchone()
        session = row_to_dict(row)
        if session is None:
            raise HTTPException(status_code=404, detail="Practice session not found")
        message_rows = conn.execute(
            """
            SELECT *
            FROM messages
            WHERE practice_session_id = ?
            ORDER BY created_at DESC, id DESC
            """,
            (session_id,),
        ).fetchall()
        return PracticeSessionDetailResponse(
            practice_session=practice_session_summary(conn, session),
            items=[message_row_to_chat_turn(conn, row_to_dict(row)) for row in message_rows],
        )


@app.post("/practice-sessions/{session_id}/close", response_model=PracticeSessionRead)
def close_practice_session_endpoint(
    session_id: int,
    current: dict = Depends(require_current_user),
) -> PracticeSessionRead:
    with db_session() as conn:
        session = close_practice_session(conn, session_id=session_id, user_id=current["user"]["id"])
        return practice_session_summary(conn, session)


@app.get("/config", response_model=ConfigRead)
def get_config(current: dict = Depends(require_current_user)) -> ConfigRead:
    pref = current["preferences"]
    return ConfigRead(model_name=pref["model_name"], voice_name=pref["voice_name"])


@app.post("/config/model", response_model=ConfigRead)
def set_model(payload: ConfigUpdate, current: dict = Depends(require_current_user)) -> ConfigRead:
    with db_session() as conn:
        pref = get_preferences(conn, current["user"]["id"])
        conn.execute(
            """
            INSERT INTO user_preferences (user_id, model_name, voice_name, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                model_name = excluded.model_name,
                voice_name = user_preferences.voice_name,
                updated_at = excluded.updated_at
            """,
            (current["user"]["id"], payload.value, pref["voice_name"], current_iso()),
        )
        pref = get_preferences(conn, current["user"]["id"])
        return ConfigRead(model_name=pref["model_name"], voice_name=pref["voice_name"])


@app.post("/config/voice", response_model=ConfigRead)
def set_voice(payload: ConfigUpdate, current: dict = Depends(require_current_user)) -> ConfigRead:
    with db_session() as conn:
        pref = get_preferences(conn, current["user"]["id"])
        conn.execute(
            """
            INSERT INTO user_preferences (user_id, model_name, voice_name, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                model_name = user_preferences.model_name,
                voice_name = excluded.voice_name,
                updated_at = excluded.updated_at
            """,
            (current["user"]["id"], pref["model_name"], payload.value, current_iso()),
        )
        pref = get_preferences(conn, current["user"]["id"])
        return ConfigRead(model_name=pref["model_name"], voice_name=pref["voice_name"])


@app.post("/chat/text", response_model=ChatResponse)
def chat_text(payload: TextChatRequest, current: dict = Depends(require_current_user)) -> ChatResponse:
    with db_session() as conn:
        topic = get_topic(conn, payload.topic_id)
        if topic is None:
            raise HTTPException(status_code=404, detail="Topic not found")

        pref = current["preferences"]
        model_name = resolve_value(payload.model_name, pref["model_name"])
        voice_name = resolve_value(payload.voice_name, pref["voice_name"])
        analysis = score_text(payload.text)
        turn = store_turn(
            conn,
            user_id=current["user"]["id"],
            topic_id=payload.topic_id,
            practice_session_id=payload.practice_session_id,
            input_mode="text",
            user_input_text=payload.text,
            transcript_text=payload.text,
            user_audio_path=None,
            analysis=analysis,
            model_name=model_name,
            voice_name=voice_name,
        )
        return ChatResponse(
            message=turn_dict_to_chat_turn(turn),
            evaluation=EvaluationRead(**turn["evaluation"]),
            transcript=turn["evaluation"]["transcript"],
        )


@app.post("/chat/audio", response_model=ChatResponse)
async def chat_audio(
    topic_id: Annotated[int, Form(...)],
    audio_file: Annotated[UploadFile, File(...)],
    model_name: Annotated[str | None, Form()] = None,
    voice_name: Annotated[str | None, Form()] = None,
    practice_session_id: Annotated[int | None, Form()] = None,
    current: dict = Depends(require_current_user),
) -> ChatResponse:
    with db_session() as conn:
        topic = get_topic(conn, topic_id)
        if topic is None:
            raise HTTPException(status_code=404, detail="Topic not found")

        pref = current["preferences"]
        resolved_model = resolve_value(model_name, pref["model_name"])
        resolved_voice = resolve_value(voice_name, pref["voice_name"])

        uploads_dir = UPLOAD_DIR / str(current["user"]["id"]) / topic["slug"]
        uploads_dir.mkdir(parents=True, exist_ok=True)
        safe_name = Path(audio_file.filename or "audio.wav").name
        saved_path = uploads_dir / f"{datetime.now(timezone.utc).timestamp():.0f}_{safe_name}"
        with saved_path.open("wb") as buffer:
            shutil.copyfileobj(audio_file.file, buffer)

        file_size = saved_path.stat().st_size
        analysis = score_audio(saved_path.stem, str(saved_path), file_size)
        turn = store_turn(
            conn,
            user_id=current["user"]["id"],
            topic_id=topic_id,
            practice_session_id=practice_session_id,
            input_mode="audio",
            user_input_text=analysis["transcript"],
            transcript_text=analysis["transcript"],
            user_audio_path=str(saved_path),
            analysis=analysis,
            model_name=resolved_model,
            voice_name=resolved_voice,
        )
        return ChatResponse(
            message=turn_dict_to_chat_turn(turn),
            evaluation=EvaluationRead(**turn["evaluation"]),
            transcript=turn["evaluation"]["transcript"],
        )


@app.get("/messages", response_model=MessageListResponse)
def list_messages(
    current: dict = Depends(require_current_user),
    practice_session_id: int | None = None,
) -> MessageListResponse:
    with db_session() as conn:
        if practice_session_id is None:
            rows = conn.execute(
                """
                SELECT *
                FROM messages
                WHERE user_id = ?
                ORDER BY created_at DESC, id DESC
                """,
                (current["user"]["id"],),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT *
                FROM messages
                WHERE user_id = ? AND practice_session_id = ?
                ORDER BY created_at DESC, id DESC
                """,
                (current["user"]["id"], practice_session_id),
            ).fetchall()
        items = []
        for row in rows:
            items.append(message_row_to_chat_turn(conn, row_to_dict(row)))
        return MessageListResponse(items=items)


@app.get("/messages/{message_id}", response_model=MessageDetailResponse)
def get_message(message_id: int, current: dict = Depends(require_current_user)) -> MessageDetailResponse:
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM messages WHERE id = ? AND user_id = ?",
            (message_id, current["user"]["id"]),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Message not found")
        turn = message_row_to_chat_turn(conn, row_to_dict(row))
        return MessageDetailResponse(message=turn, evaluation=turn.evaluation)


@app.get("/evaluation/{message_id}", response_model=EvaluationRead)
def get_evaluation(message_id: int, current: dict = Depends(require_current_user)) -> EvaluationRead:
    with db_session() as conn:
        row = conn.execute(
            """
            SELECT e.*
            FROM message_evaluations e
            JOIN messages m ON m.id = e.message_id
            WHERE e.message_id = ? AND m.user_id = ?
            """,
            (message_id, current["user"]["id"]),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Evaluation not found")
        eval_row = row_to_dict(row)
        return EvaluationRead(
            message_id=eval_row["message_id"],
            transcript=eval_row["transcript"],
            grammar_score=eval_row["grammar_score"],
            vocabulary_score=eval_row["vocabulary_score"],
            fluency_score=eval_row["fluency_score"],
            coherence_score=eval_row["coherence_score"],
            lexical_resource_score=eval_row["lexical_resource_score"],
            pronunciation_score=eval_row["pronunciation_score"],
            corrected_text=eval_row["corrected_text"],
            feedback=parse_feedback(eval_row["feedback_json"]),
            rubric_version=eval_row["rubric_version"],
            summary=eval_row["summary"],
            is_mock=bool(eval_row["is_mock"]),
            created_at=eval_row["created_at"],
        )


@app.get("/audio/{message_id}")
def get_audio(
    message_id: int,
    kind: str = "agent",
    current: dict = Depends(require_current_user),
):
    if kind not in {"user", "agent"}:
        raise HTTPException(status_code=400, detail="kind must be 'user' or 'agent'")

    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM messages WHERE id = ? AND user_id = ?",
            (message_id, current["user"]["id"]),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Message not found")
        audio_path = row["user_audio_path"] if kind == "user" else row["agent_audio_path"]
        if not audio_path and kind == "user":
            audio_path = row["audio_path"]
        if not audio_path:
            raise HTTPException(status_code=404, detail=f"No {kind} audio stored for this message")
        path = Path(audio_path)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Audio file not found")
        return FileResponse(path=str(path), media_type="audio/wav", filename=path.name)
