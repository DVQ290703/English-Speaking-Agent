from __future__ import annotations

import uuid as _uuid

from fastapi import HTTPException, status


def _validate_uuid(value: str, field: str) -> None:
    try:
        _uuid.UUID(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field}: must be a UUID",
        ) from exc


def _enforce_max_length(value: str | None, *, field: str, max_chars: int) -> str | None:
    if value is None:
        return None
    if len(value) > max_chars:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"{field} exceeds {max_chars} characters",
        )
    return value
