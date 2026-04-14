import sqlite3
from contextlib import contextmanager
from typing import Generator

from .config import DATABASE_PATH


SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER PRIMARY KEY,
    model_name TEXT NOT NULL,
    voice_name TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS practice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    topic_id INTEGER,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    started_at TEXT NOT NULL,
    ended_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    topic_id INTEGER NOT NULL,
    practice_session_id INTEGER,
    role TEXT NOT NULL DEFAULT 'user',
    input_mode TEXT NOT NULL,
    attempt_no INTEGER NOT NULL DEFAULT 1,
    user_input_text TEXT NOT NULL DEFAULT '',
    transcript_text TEXT NOT NULL DEFAULT '',
    user_audio_path TEXT,
    duration_seconds INTEGER,
    word_count INTEGER,
    pause_count INTEGER,
    content_text TEXT NOT NULL,
    audio_path TEXT,
    agent_reply_text TEXT NOT NULL,
    agent_audio_path TEXT,
    model_name TEXT NOT NULL,
    voice_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
    FOREIGN KEY (practice_session_id) REFERENCES practice_sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS message_evaluations (
    message_id INTEGER PRIMARY KEY,
    transcript TEXT,
    grammar_score INTEGER NOT NULL,
    vocabulary_score INTEGER,
    fluency_score INTEGER,
    coherence_score INTEGER,
    lexical_resource_score INTEGER,
    pronunciation_score INTEGER,
    corrected_text TEXT NOT NULL,
    feedback_json TEXT NOT NULL,
    rubric_version TEXT NOT NULL DEFAULT 'v1',
    summary TEXT NOT NULL,
    is_mock INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);
"""


def get_connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = OFF")
    conn.execute("PRAGMA synchronous = OFF")
    return conn


@contextmanager
def db_session() -> Generator[sqlite3.Connection, None, None]:
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with db_session() as conn:
        conn.executescript(SCHEMA_SQL)
        conn.execute("DROP TABLE IF EXISTS ai_log_events")
        migrate_practice_sessions_table(conn)
        migrate_messages_table(conn)


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return dict(row)


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(row) for row in rows]


def table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {row["name"] for row in rows}


def add_column_if_missing(conn: sqlite3.Connection, table_name: str, column_def: str) -> None:
    column_name = column_def.split()[0]
    if column_name not in table_columns(conn, table_name):
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_def}")


def migrate_messages_table(conn: sqlite3.Connection) -> None:
    add_column_if_missing(conn, "messages", "practice_session_id INTEGER")
    add_column_if_missing(conn, "messages", "attempt_no INTEGER NOT NULL DEFAULT 1")
    add_column_if_missing(conn, "messages", "user_input_text TEXT NOT NULL DEFAULT ''")
    add_column_if_missing(conn, "messages", "transcript_text TEXT NOT NULL DEFAULT ''")
    add_column_if_missing(conn, "messages", "user_audio_path TEXT")
    add_column_if_missing(conn, "messages", "duration_seconds INTEGER")
    add_column_if_missing(conn, "messages", "word_count INTEGER")
    add_column_if_missing(conn, "messages", "pause_count INTEGER")

    conn.execute(
        """
        UPDATE messages
        SET
            user_input_text = COALESCE(NULLIF(user_input_text, ''), content_text),
            transcript_text = COALESCE(NULLIF(transcript_text, ''), content_text),
            user_audio_path = COALESCE(user_audio_path, audio_path)
        """
    )

    rows = conn.execute(
        "SELECT id, user_id, topic_id FROM messages ORDER BY user_id, topic_id, created_at, id"
    ).fetchall()
    attempt_counters: dict[tuple[int, int], int] = {}
    for row in rows:
        key = (row["user_id"], row["topic_id"])
        attempt_counters[key] = attempt_counters.get(key, 0) + 1
        conn.execute(
            "UPDATE messages SET attempt_no = ? WHERE id = ?",
            (attempt_counters[key], row["id"]),
        )


def migrate_practice_sessions_table(conn: sqlite3.Connection) -> None:
    add_column_if_missing(conn, "messages", "practice_session_id INTEGER")
    add_column_if_missing(conn, "message_evaluations", "fluency_score INTEGER")
    add_column_if_missing(conn, "message_evaluations", "coherence_score INTEGER")
    add_column_if_missing(conn, "message_evaluations", "lexical_resource_score INTEGER")
    add_column_if_missing(conn, "message_evaluations", "rubric_version TEXT NOT NULL DEFAULT 'v1'")

    rows = conn.execute("SELECT COUNT(*) AS count FROM practice_sessions").fetchone()
    practice_session_count = rows["count"] if rows is not None else 0
    if practice_session_count == 0:
        users = conn.execute("SELECT id, username FROM users ORDER BY id").fetchall()
        for user in users:
            messages = conn.execute(
                """
                SELECT *
                FROM messages
                WHERE user_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (user["id"],),
            ).fetchall()
            if not messages:
                continue
            first_message = messages[0]
            last_message = messages[-1]
            cursor = conn.execute(
                """
                INSERT INTO practice_sessions (
                    user_id, topic_id, title, notes, status, started_at, ended_at, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user["id"],
                    first_message["topic_id"],
                    f"Imported practice history for {user['username']}",
                    "Imported from existing message history.",
                    "completed",
                    first_message["created_at"],
                    last_message["created_at"],
                    first_message["created_at"],
                    last_message["created_at"],
                ),
            )
            conn.execute(
                "UPDATE messages SET practice_session_id = ? WHERE user_id = ?",
                (cursor.lastrowid, user["id"]),
            )
