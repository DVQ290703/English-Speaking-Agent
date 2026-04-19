from contextlib import contextmanager
from typing import Generator

import psycopg2
from psycopg2 import pool as pg_pool

from app.core.settings import DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER
from app.core.logger import logger

_pool: pg_pool.ThreadedConnectionPool | None = None


def init_db_pool(minconn: int = 1, maxconn: int = 10) -> None:
    """Create the connection pool. Call once at application startup."""
    global _pool
    logger.info("Connecting to PostgreSQL host=%s port=%d db=%s user=%s", DB_HOST, DB_PORT, DB_NAME, DB_USER)
    _pool = pg_pool.ThreadedConnectionPool(
        minconn=minconn,
        maxconn=maxconn,
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )
    logger.info("DB connection pool initialized (min=%d max=%d)", minconn, maxconn)


@contextmanager
def get_connection() -> Generator[psycopg2.extensions.connection, None, None]:
    """Yield a connection from the pool and return it on exit.

    Commits on clean exit, rolls back on exception — connections are always
    returned to the pool so they are never leaked.

    Callers MUST open cursors using the context-manager form::

        with get_connection() as conn:
            with conn.cursor() as cur:
                ...

    psycopg2 cursors implement ``__exit__`` which calls ``cur.close()``,
    guaranteeing closure on every code path including exceptions.
    """
    if _pool is None:
        raise RuntimeError("DB pool is not initialized — call init_db_pool() at startup")
    conn = _pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)
