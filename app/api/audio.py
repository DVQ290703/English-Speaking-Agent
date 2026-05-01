from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response

from app.core.logger import logger
from app.core.security import get_current_user_id
from app.core.storage import MINIO_BUCKET, get_minio_client

router = APIRouter(prefix="/audio", tags=["audio"])

_AUDIO_CACHE_SECONDS = 3600  # 1 hour


@router.get("/{storage_key:path}")
def stream_audio(
    storage_key: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Stable audio proxy — streams a MinIO object to the client.
    Uses a stable URL (not a presigned URL) so the browser can cache the response.
    Auth is required.
    """
    logger.debug("stream_audio user_id=%s key=%s", user_id, storage_key)
    try:
        client = get_minio_client()
        response = client.get_object(MINIO_BUCKET, storage_key)
        data = response.read()
        content_type = response.getheader("Content-Type") or "audio/mpeg"
    except Exception as exc:
        logger.warning("stream_audio failed key=%s error=%s", storage_key, exc)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio not found")

    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Cache-Control": f"private, max-age={_AUDIO_CACHE_SECONDS}",
            "Content-Length": str(len(data)),
        },
    )
