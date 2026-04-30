from __future__ import annotations

from datetime import timedelta
from io import BytesIO

from minio import Minio
from minio.error import S3Error

from app.core.settings import MINIO_ACCESS_KEY, MINIO_BUCKET, MINIO_ENDPOINT, MINIO_PUBLIC_ENDPOINT, MINIO_PUBLIC_SECURE, MINIO_SECURE, MINIO_SECRET_KEY
from app.core.logger import logger

# Singleton — one client per process, not per request
_client: Minio | None = None
# Separate client used only for presigned URL generation.
# Initialized with MINIO_PUBLIC_ENDPOINT so the signed URLs contain the host
# that browsers can actually reach. region is set explicitly to skip the
# region-lookup HTTP call that minio-py would otherwise make on first use
# (that call fails when MINIO_PUBLIC_ENDPOINT is only reachable by browsers,
# not by the backend process itself — e.g. localhost:9000 inside Docker).
_public_client: Minio | None = None

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
        logger.info("Creating MinIO client endpoint=%s secure=%s", MINIO_ENDPOINT, MINIO_SECURE)
        _client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )
    return _client


def init_storage() -> None:
    """Create the audio bucket if it does not exist. Call once at app startup."""
    logger.info("init_storage — checking bucket=%s", MINIO_BUCKET)
    client = get_minio_client()
    try:
        if not client.bucket_exists(MINIO_BUCKET):
            client.make_bucket(MINIO_BUCKET)
            logger.info("Created MinIO bucket: %s", MINIO_BUCKET)
        else:
            logger.info("MinIO bucket already exists: %s", MINIO_BUCKET)
    except S3Error as exc:
        if exc.code not in {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}:
            logger.error("MinIO S3Error during init_storage: code=%s message=%s", exc.code, exc.message)
            raise


def _derive_extension(filename: str | None, content_type: str | None) -> tuple[str, str]:
    """Return (extension, content_type) derived from filename or content-type header."""
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
        ct = content_type or f"audio/{ext}"
        logger.debug("_derive_extension from filename=%r → ext=%s ct=%s", filename, ext, ct)
        return ext, ct
    if content_type and content_type in _CONTENT_TYPE_TO_EXT:
        ext = _CONTENT_TYPE_TO_EXT[content_type]
        logger.debug("_derive_extension from content_type=%r → ext=%s", content_type, ext)
        return ext, content_type
    logger.debug("_derive_extension — no match for filename=%r content_type=%r, defaulting to webm", filename, content_type)
    return "webm", "audio/webm"


def build_object_key(*, conversation_id: str, message_id: str, audio_type: str, extension: str) -> str:
    """
    Deterministic key — message_id is already a unique UUID, no random suffix needed.
    Pattern: conversations/{conv_id}/{audio_type}/{message_id}.{ext}
    """
    return f"conversations/{conversation_id}/{audio_type}/{message_id}.{extension}"


def _upload(*, object_key: str, content: bytes, content_type: str) -> None:
    logger.info("MinIO upload key=%s size=%d content_type=%s", object_key, len(content), content_type)
    client = get_minio_client()
    client.put_object(
        bucket_name=MINIO_BUCKET,
        object_name=object_key,
        data=BytesIO(content),
        length=len(content),
        content_type=content_type,
    )
    logger.debug("MinIO upload complete key=%s", object_key)


def delete_object(object_key: str) -> None:
    """Delete an object from MinIO. Silently ignores missing objects."""
    logger.info("MinIO delete key=%s", object_key)
    client = get_minio_client()
    try:
        client.remove_object(MINIO_BUCKET, object_key)
        logger.debug("MinIO delete complete key=%s", object_key)
    except S3Error as exc:
        if exc.code != "NoSuchKey":
            logger.error("MinIO S3Error on delete key=%s code=%s", object_key, exc.code)
            raise
        logger.warning("MinIO delete — key not found (already deleted?): %s", object_key)


def _get_public_minio_client() -> Minio:
    global _public_client
    if _public_client is None:
        logger.info(
            "Creating public MinIO client endpoint=%s secure=%s",
            MINIO_PUBLIC_ENDPOINT, MINIO_PUBLIC_SECURE,
        )
        _public_client = Minio(
            MINIO_PUBLIC_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_PUBLIC_SECURE,
            region="us-east-1",  # explicit region avoids minio-py's region-lookup HTTP call
        )
    return _public_client


def get_presigned_url(object_key: str, expires: timedelta = timedelta(hours=1)) -> str:
    """Generate a short-lived presigned GET URL reachable by browsers.

    Uses the public client so the signed URL contains MINIO_PUBLIC_ENDPOINT as
    its host — which is what browsers resolve (e.g. localhost:9000 in dev,
    the ingress domain in K8s). The explicit region="us-east-1" on the public
    client prevents minio-py from making a region-lookup HTTP call to an
    endpoint that may not be reachable from the backend process.
    """
    logger.debug("Generating presigned URL key=%s expires=%s endpoint=%s", object_key, expires, MINIO_PUBLIC_ENDPOINT)
    client = _get_public_minio_client()
    url = client.presigned_get_object(MINIO_BUCKET, object_key, expires=expires)
    logger.debug("Presigned URL generated key=%s", object_key)
    return url


def store_user_audio(
    *,
    conversation_id: str,
    message_id: str,
    audio_bytes: bytes,
    filename: str | None = None,
    content_type: str | None = None,
) -> tuple[str, str]:
    """
    Upload user audio to MinIO.

    Returns:
        (object_key, resolved_mime_type)
    Raises on failure — callers are responsible for error handling.
    """
    logger.info(
        "store_user_audio conv_id=%s message_id=%s filename=%r size=%d",
        conversation_id, message_id, filename, len(audio_bytes),
    )
    extension, mime_type = _derive_extension(filename, content_type)
    object_key = build_object_key(
        conversation_id=conversation_id,
        message_id=message_id,
        audio_type="user_input",
        extension=extension,
    )
    _upload(object_key=object_key, content=audio_bytes, content_type=mime_type)
    logger.info("store_user_audio done key=%s mime=%s", object_key, mime_type)
    return object_key, mime_type


def store_assistant_audio(
    *,
    conversation_id: str,
    message_id: str,
    audio_bytes: bytes,
) -> str:
    """
    Upload assistant TTS audio (always mp3) to MinIO.

    Returns:
        object_key
    Raises on failure — callers are responsible for error handling.
    """
    logger.info(
        "store_assistant_audio conv_id=%s message_id=%s size=%d",
        conversation_id, message_id, len(audio_bytes),
    )
    object_key = build_object_key(
        conversation_id=conversation_id,
        message_id=message_id,
        audio_type="assistant_tts",
        extension="mp3",
    )
    _upload(object_key=object_key, content=audio_bytes, content_type="audio/mpeg")
    logger.info("store_assistant_audio done key=%s", object_key)
    return object_key
