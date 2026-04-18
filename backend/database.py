import logging
from contextlib import contextmanager
from typing import Generator

import psycopg2
from psycopg2 import pool as pg_pool

from .config import DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER

logger = logging.getLogger(__name__)

_pool: pg_pool.ThreadedConnectionPool | None = None


def init_db_pool(minconn: int = 1, maxconn: int = 10) -> None:
    """Create the connection pool. Call once at application startup."""
    global _pool
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
