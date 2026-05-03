from __future__ import annotations

from fastapi import HTTPException, UploadFile, status

_MAX_AUDIO_BYTES = 25 * 1024 * 1024

_CHAT_AUDIO_CONTENT_TYPES = frozenset({
    "audio/webm",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/pcm",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
})
_SUPPORTED_AUDIO_CONTENT_TYPES = frozenset({
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/pcm",
})


def _audio_signature_matches(content_type: str, audio_bytes: bytes) -> bool:
    if not audio_bytes:
        return False
    if content_type in {"audio/wav", "audio/x-wav", "audio/wave"}:
        return len(audio_bytes) >= 12 and audio_bytes[:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE"
    if content_type == "audio/webm":
        return audio_bytes.startswith(b"\x1A\x45\xDF\xA3")
    if content_type == "audio/ogg":
        return audio_bytes.startswith(b"OggS")
    if content_type == "audio/mp4":
        return len(audio_bytes) >= 12 and audio_bytes[4:8] == b"ftyp"
    if content_type == "audio/mpeg":
        return audio_bytes.startswith(b"ID3") or audio_bytes[:2] in {
            b"\xff\xfb",
            b"\xff\xf3",
            b"\xff\xf2",
        }
    if content_type == "audio/pcm":
        return True
    return False


def _validate_uploaded_audio(
    *,
    audio_file: UploadFile,
    audio_bytes: bytes,
    allowed_content_types: frozenset[str],
    endpoint_label: str,
) -> str:
    content_type = (audio_file.content_type or "").lower().split(";", 1)[0].strip()
    if not content_type:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"{endpoint_label} audio must declare a supported Content-Type",
        )
    if content_type not in allowed_content_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported audio format '{content_type}'",
        )
    if not _audio_signature_matches(content_type, audio_bytes):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Uploaded audio does not match the declared format",
        )
    return content_type


def _read_and_close_upload(audio_file: UploadFile) -> bytes:
    try:
        return audio_file.file.read(_MAX_AUDIO_BYTES + 1)
    finally:
        audio_file.file.truncate(0)
        audio_file.file.close()
