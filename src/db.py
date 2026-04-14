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

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    topic_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    input_mode TEXT NOT NULL,
    user_input_text TEXT NOT NULL DEFAULT '',
    transcript_text TEXT NOT NULL DEFAULT '',
    user_audio_path TEXT,
    content_text TEXT NOT NULL,
    audio_path TEXT,
    agent_reply_text TEXT NOT NULL,
    agent_audio_path TEXT,
    model_name TEXT NOT NULL,
    voice_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_evaluations (
    message_id INTEGER PRIMARY KEY,
    transcript TEXT,
    grammar_score INTEGER NOT NULL,
    vocabulary_score INTEGER,
    pronunciation_score INTEGER,
    corrected_text TEXT NOT NULL,
    feedback_json TEXT NOT NULL,
    summary TEXT NOT NULL,
    is_mock INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_log_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool TEXT NOT NULL,
    event TEXT NOT NULL,
    session_id TEXT,
    model TEXT,
    repo TEXT,
    branch TEXT,
    "commit" TEXT,
    student TEXT,
    prompt TEXT,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
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
        migrate_messages_table(conn)
        migrate_ai_log_table(conn)


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
    add_column_if_missing(conn, "messages", "user_input_text TEXT NOT NULL DEFAULT ''")
    add_column_if_missing(conn, "messages", "transcript_text TEXT NOT NULL DEFAULT ''")
    add_column_if_missing(conn, "messages", "user_audio_path TEXT")

    conn.execute(
        """
        UPDATE messages
        SET
            user_input_text = COALESCE(NULLIF(user_input_text, ''), content_text),
            transcript_text = COALESCE(NULLIF(transcript_text, ''), content_text),
            user_audio_path = COALESCE(user_audio_path, audio_path)
        """
    )


def migrate_ai_log_table(conn: sqlite3.Connection) -> None:
    add_column_if_missing(conn, "ai_log_events", "payload_json TEXT NOT NULL DEFAULT '{}'")
