from collections import deque
from collections.abc import Iterable
from unittest.mock import MagicMock


def _normalize_sql(sql: str) -> str:
    return " ".join(sql.lower().split())


def _coerce_result_queue(value):
    if isinstance(value, list):
        return deque(value)
    return deque([value])


def _build_lookup(mapping: dict[str, object] | None) -> dict[str, deque[object]]:
    if not mapping:
        return {}
    return {_normalize_sql(pattern): _coerce_result_queue(value) for pattern, value in mapping.items()}


def _match_sql_result(sql: str | None, lookup: dict[str, deque[object]]):
    if not sql:
        return None, False

    normalized_sql = _normalize_sql(sql)
    for pattern, values in lookup.items():
        if pattern in normalized_sql:
            if values:
                return values.popleft(), True
            return None, True
    return None, False


def make_mock_connection(
    *,
    fetchone_side_effect: Iterable[object] = (),
    fetchall_value=None,
    fetchone_by_sql: dict[str, object] | None = None,
    fetchall_by_sql: dict[str, object] | None = None,
):
    """
    Build a mock psycopg2 connection/cursor pair.

    `fetchone_by_sql` and `fetchall_by_sql` let tests bind results to SQL
    patterns so they don't depend on the exact order of internal DB calls.
    """
    cursor = MagicMock()
    fetchone_queue = list(fetchone_side_effect)
    fetchone_lookup = _build_lookup(fetchone_by_sql)
    fetchall_lookup = _build_lookup(fetchall_by_sql)
    state = {"last_sql": None}

    def execute(sql, params=None):
        state["last_sql"] = sql
        return None

    def fetchone():
        matched_result, matched = _match_sql_result(state["last_sql"], fetchone_lookup)
        if matched:
            return matched_result
        if fetchone_queue:
            return fetchone_queue.pop(0)
        return None

    def fetchall():
        matched_result, matched = _match_sql_result(state["last_sql"], fetchall_lookup)
        if matched:
            return matched_result or []
        if fetchall_value is not None:
            return fetchall_value
        return []

    cursor.execute.side_effect = execute
    cursor.fetchone.side_effect = fetchone
    cursor.fetchall.side_effect = fetchall

    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return conn, cursor
