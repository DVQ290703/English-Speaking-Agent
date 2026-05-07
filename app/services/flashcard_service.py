from __future__ import annotations

from datetime import date, timedelta
from typing import Literal


_RATING_TO_QUALITY: dict[str, int] = {
    "again": 0,
    "hard": 2,
    "good": 3,
    "easy": 5,
}


def calculate_sm2(
    rating: Literal["again", "hard", "good", "easy"],
    repetitions: int,
    ease_factor: float,
    interval_days: int,
    today: date | None = None,
) -> tuple[int, float, int, date]:
    """Apply one SM-2 review step.

    Returns:
        (repetitions, ease_factor, interval_days, due_date)
    """
    if today is None:
        today = date.today()

    q = _RATING_TO_QUALITY[rating]

    if q < 3:
        repetitions = 0
        interval_days = 1
    else:
        if repetitions == 0:
            interval_days = 1
        elif repetitions == 1:
            interval_days = 6
        else:
            interval_days = round(interval_days * ease_factor)
        repetitions += 1

    ease_factor = max(1.3, ease_factor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    due_date = today + timedelta(days=interval_days)

    return repetitions, round(ease_factor, 2), interval_days, due_date
