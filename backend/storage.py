from __future__ import annotations

import logging
from datetime import timedelta
from io import BytesIO

from minio import Minio
from minio.error import S3Error

from .config import MINIO_ACCESS_KEY, MINIO_BUCKET, MINIO_ENDPOINT, MINIO_SECURE, MINIO_SECRET_KEY

logger = logging.getLogger(__name__)

# Singleton — one client per process, not per request
_client: Minio | None = None

_CONTENT_TYPE_TO_EXT: dict[str, str] = {
    "audio/webm": "webm",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
}


def get_minio_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )
    return _client


def init_storage() -> None:
    """Create the audio bucket if it does not exist. Call once at app startup."""
    client = get_minio_client()
    try:
        if not client.bucket_exists(MINIO_BUCKET):
            client.make_bucket(MINIO_BUCKET)
            logger.info("Created MinIO bucket: %s", MINIO_BUCKET)
        else:
            logger.info("MinIO bucket already exists: %s", MINIO_BUCKET)
    except S3Error as exc:
        if exc.code not in {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}:
            raise


def _derive_extension(filename: str | None, content_type: str | None) -> tuple[str, str]:
    """Return (extension, content_type) derived from filename or content-type header."""
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
        ct = content_type or f"audio/{ext}"
        return ext, ct
    if content_type and content_type in _CONTENT_TYPE_TO_EXT:
        return _CONTENT_TYPE_TO_EXT[content_type], content_type
    return "webm", "audio/webm"


def build_object_key(*, conversation_id: str, message_id: str, audio_type: str, extension: str) -> str:
    """
    Deterministic key — message_id is already a unique UUID, no random suffix needed.
    audio_type matches audio_assets.audio_type CHECK: 'user_input' | 'assistant_tts'
    Pattern: conversations/{conv_id}/{audio_type}/{message_id}.{ext}
    """
    return f"conversations/{conversation_id}/{audio_type}/{message_id}.{extension}"


def _upload(*, object_key: str, content: bytes, content_type: str) -> None:
    client = get_minio_client()
    client.put_object(
        bucket_name=MINIO_BUCKET,
        object_name=object_key,
        data=BytesIO(content),
        length=len(content),
        content_type=content_type,
    )


def get_presigned_url(object_key: str, expires: timedelta = timedelta(hours=1)) -> str:
    """Generate a short-lived presigned GET URL. The bucket remains private."""
    client = get_minio_client()
    return client.presigned_get_object(MINIO_BUCKET, object_key, expires=expires)


def store_user_audio(
    *,
    conversation_id: str,
    message_id: str,
    audio_bytes: bytes,
    filename: str | None = None,
    content_type: str | None = None,
) -> tuple[str, str, str]:
    """
    Upload user audio to MinIO.

    Returns:
        (object_key, presigned_url, resolved_mime_type)
    Raises on failure — callers are responsible for error handling.
    """
    extension, mime_type = _derive_extension(filename, content_type)
    object_key = build_object_key(
        conversation_id=conversation_id,
        message_id=message_id,
        audio_type="user_input",
        extension=extension,
    )
    _upload(object_key=object_key, content=audio_bytes, content_type=mime_type)
    presigned_url = get_presigned_url(object_key)
    return object_key, presigned_url, mime_type


def store_assistant_audio(
    *,
    conversation_id: str,
    message_id: str,
    audio_bytes: bytes,
) -> tuple[str, str]:
    """
    Upload assistant TTS audio (always mp3) to MinIO.

    Returns:
        (object_key, presigned_url)
    Raises on failure — callers are responsible for error handling.
    """
    object_key = build_object_key(
        conversation_id=conversation_id,
        message_id=message_id,
        audio_type="assistant_tts",
        extension="mp3",
    )
    _upload(object_key=object_key, content=audio_bytes, content_type="audio/mpeg")
    presigned_url = get_presigned_url(object_key)
    return object_key, presigned_url
