"""
tests/test_core/test_logger_uuid_mask.py

RC-4: UUID masking — log records must never emit raw UUIDs.
The logger must pseudonymize any UUID-shaped token in log messages.
"""
import logging
import uuid


def _get_masked_logger():
    from app.core.logger import UUIDMaskingFilter
    return UUIDMaskingFilter


# ---------------------------------------------------------------------------
# UUIDMaskingFilter must exist and be importable
# ---------------------------------------------------------------------------

def test_uuid_masking_filter_is_importable():
    f = _get_masked_logger()
    assert f is not None


# ---------------------------------------------------------------------------
# Filter must mask UUID in log message
# ---------------------------------------------------------------------------

def test_filter_masks_uuid_in_message():
    from app.core.logger import UUIDMaskingFilter
    uid = str(uuid.uuid4())  # e.g. "550e8400-e29b-41d4-a716-446655440000"

    record = logging.LogRecord(
        name="test", level=logging.INFO, pathname="", lineno=0,
        msg=f"user_id={uid} did something", args=(), exc_info=None,
    )
    UUIDMaskingFilter().filter(record)

    assert uid not in record.getMessage()
    assert record.getMessage().count("****") >= 1


def test_filter_keeps_first_8_chars_of_uuid():
    from app.core.logger import UUIDMaskingFilter
    uid = str(uuid.uuid4())
    prefix = uid[:8]

    record = logging.LogRecord(
        name="test", level=logging.INFO, pathname="", lineno=0,
        msg=f"Processing user_id={uid}", args=(), exc_info=None,
    )
    UUIDMaskingFilter().filter(record)

    assert prefix in record.getMessage()


def test_filter_masks_multiple_uuids_in_one_message():
    from app.core.logger import UUIDMaskingFilter
    uid1 = str(uuid.uuid4())
    uid2 = str(uuid.uuid4())

    record = logging.LogRecord(
        name="test", level=logging.INFO, pathname="", lineno=0,
        msg=f"user={uid1} deck={uid2}", args=(), exc_info=None,
    )
    UUIDMaskingFilter().filter(record)

    msg = record.getMessage()
    assert uid1 not in msg
    assert uid2 not in msg


def test_filter_does_not_alter_message_without_uuid():
    from app.core.logger import UUIDMaskingFilter
    original = "user logged in successfully"

    record = logging.LogRecord(
        name="test", level=logging.INFO, pathname="", lineno=0,
        msg=original, args=(), exc_info=None,
    )
    UUIDMaskingFilter().filter(record)

    assert record.getMessage() == original
