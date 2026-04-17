from __future__ import annotations

from io import BytesIO
from uuid import uuid4

from minio import Minio
from minio.error import S3Error

from .config import MINIO_ACCESS_KEY, MINIO_BUCKET, MINIO_ENDPOINT, MINIO_PUBLIC_BASE_URL, MINIO_SECURE, MINIO_SECRET_KEY


def get_minio_client() -> Minio:
    return Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=MINIO_SECURE,
    )


def build_object_key(*, conversation_id: str, message_id: str, audio_type: str, filename: str | None) -> str:
    extension = "bin"
    if filename and "." in filename:
        extension = filename.rsplit(".", 1)[-1].lower()

    return f"conversations/{conversation_id}/{audio_type}/{message_id}-{uuid4().hex}.{extension}"


def ensure_bucket_exists(client: Minio) -> None:
    try:
        if client.bucket_exists(MINIO_BUCKET):
            return
        client.make_bucket(MINIO_BUCKET)
    except S3Error as exc:
        if exc.code not in {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}:
            raise


def upload_audio_bytes(*, object_key: str, content: bytes, content_type: str | None) -> str | None:
    client = get_minio_client()
    content_stream = BytesIO(content)

    ensure_bucket_exists(client)

    client.put_object(
        bucket_name=MINIO_BUCKET,
        object_name=object_key,
        data=content_stream,
        length=len(content),
        content_type=content_type or "application/octet-stream",
    )

    if not MINIO_PUBLIC_BASE_URL:
        return None

    base_url = MINIO_PUBLIC_BASE_URL.rstrip("/")
    return f"{base_url}/{MINIO_BUCKET}/{object_key}"


def store_user_audio(
    *,
    conversation_id: str,
    message_id: str,
    audio_bytes: bytes,
    filename: str | None = None,
) -> tuple[str, str | None]:
    """
    Store user-uploaded audio to Minio.
    
    Returns:
        (object_key, public_url) where public_url is None if MINIO_PUBLIC_BASE_URL is not configured
    """
    object_key = build_object_key(
        conversation_id=conversation_id,
        message_id=message_id,
        audio_type="user_audio",
        filename=filename,
    )
    
    public_url = upload_audio_bytes(
        object_key=object_key,
        content=audio_bytes,
        content_type="audio/webm",
    )
    
    return object_key, public_url


def store_assistant_audio(
    *,
    conversation_id: str,
    message_id: str,
    audio_bytes: bytes,
) -> tuple[str, str | None]:
    """
    Store assistant-generated (TTS) audio to Minio.
    
    Returns:
        (object_key, public_url) where public_url is None if MINIO_PUBLIC_BASE_URL is not configured
    """
    object_key = build_object_key(
        conversation_id=conversation_id,
        message_id=message_id,
        audio_type="assistant_audio",
        filename="response.mp3",
    )
    
    public_url = upload_audio_bytes(
        object_key=object_key,
        content=audio_bytes,
        content_type="audio/mpeg",
    )
    
    return object_key, public_url