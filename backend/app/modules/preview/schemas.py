from pydantic import BaseModel


class PreviewFixOut(BaseModel):
    id: str
    file: str
    summary: str
    status: str  # "Ready" | "Applied"


class PreviewStartResponse(BaseModel):
    url: str
    command: str
    port: int
    build: str  # "original" | "patched"
    patchedFileCount: int
    fixCount: int


class PreviewStateResponse(BaseModel):
    supported: bool
    build: str  # "original" | "patched" — reflects current on-disk state
    fixes: list[PreviewFixOut]
