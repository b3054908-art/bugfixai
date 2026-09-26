"""New module — no Node/TS counterpart. Backs the frontend's Model Selector
menu and other per-user preferences (UserSetting table already existed in
the schema but had no API surface until now)."""
from pydantic import BaseModel, ConfigDict


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    primaryProvider: str
    primaryModel: str
    autoRunTests: bool
    minimumConfidence: int
    sandboxGuardrails: bool


class UpdateSettingsRequest(BaseModel):
    primaryProvider: str | None = None
    primaryModel: str | None = None
    autoRunTests: bool | None = None
    minimumConfidence: int | None = None
    sandboxGuardrails: bool | None = None
