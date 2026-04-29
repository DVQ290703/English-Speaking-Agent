from __future__ import annotations

import re
from dataclasses import dataclass, field

_URL_PATTERN = re.compile(r"https?://\S+")
_TRAILING_PUNCT = re.compile(r"[.,;:!?\"')\]]+$")


@dataclass
class FormatValidatorResult:
    text: str
    flags: list[str] = field(default_factory=list)
    needs_retry: bool = False


class FormatValidator:
    def __init__(self, url_allowlist: list[str] | None = None):
        self._url_allowlist = list(url_allowlist or [])

    def check(self, text: str) -> FormatValidatorResult:
        """Strip non-allowlisted URLs; flag empty/very-short responses for retry."""

        def _replace(match: re.Match) -> str:
            raw = match.group(0)
            url = _TRAILING_PUNCT.sub("", raw)
            trailing = raw[len(url):]
            for allowed in self._url_allowlist:
                if url.startswith(allowed):
                    return url + trailing
            return trailing

        cleaned = _URL_PATTERN.sub(_replace, text).strip()

        if len(cleaned) < 5:
            return FormatValidatorResult(
                text=cleaned,
                flags=["format_invalid"],
                needs_retry=True,
            )

        return FormatValidatorResult(text=cleaned)
