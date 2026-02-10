"""Helpers for matching recognized license plates to configured lists."""

import re

from rapidfuzz.distance import Levenshtein


def looks_like_regex(pattern: str) -> bool:
    """Return True when a configured plate pattern appears to be regex."""
    return any(char in pattern for char in ".^$*+?{}[]\\|()")


def plate_pattern_matches(pattern: str, plate: str, match_distance: int) -> bool:
    """Match a detected plate against a configured pattern."""
    if looks_like_regex(pattern):
        return re.fullmatch(pattern, plate) is not None

    return pattern == plate or Levenshtein.distance(pattern, plate) <= match_distance


def get_plate_match_label(
    configured_plates: dict[str, list[str]] | None,
    plate: str,
    match_distance: int,
) -> str | None:
    """Return first matching label for a configured plate map."""
    if not configured_plates:
        return None

    for label, patterns in configured_plates.items():
        if any(
            plate_pattern_matches(pattern, plate, match_distance)
            for pattern in patterns
        ):
            return label

    return None
