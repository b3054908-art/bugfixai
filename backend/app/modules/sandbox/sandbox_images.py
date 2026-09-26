"""Maps a detected project language to the Docker image used to run its
build/test commands inside the sandbox.

Previously container_manager.py hardcoded `node:22-bookworm-slim` for every
sandbox command regardless of detected language, so only JavaScript/TypeScript
projects could pass Phase 4 (Build). This maps each language detected by
app/modules/code_analysis/language_detector.py to an image that actually has
the right interpreter/toolchain on PATH.
"""

_DEFAULT_IMAGE = "node:22-bookworm-slim"

_IMAGE_BY_LANGUAGE = {
    "JavaScript": "node:22-bookworm-slim",
    "TypeScript": "node:22-bookworm-slim",
    "Python": "python:3.12-slim",
    "Go": "golang:1.23-bookworm",
    "Rust": "rust:1.81-slim-bookworm",
}


def image_for_language(language: str | None) -> str:
    """Returns the sandbox image for a detected language, falling back to
    the Node image for unknown/unsupported languages (matches prior
    behavior so nothing regresses for callers that don't pass a language).
    """
    if not language:
        return _DEFAULT_IMAGE
    return _IMAGE_BY_LANGUAGE.get(language, _DEFAULT_IMAGE)
