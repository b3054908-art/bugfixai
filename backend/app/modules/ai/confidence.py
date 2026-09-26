"""Mirrors: backend/src/modules/ai/confidence.ts"""


def clamp_confidence(value: float) -> int:
    return max(0, min(100, round(value)))
