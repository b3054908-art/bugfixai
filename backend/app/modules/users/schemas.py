from datetime import datetime

from pydantic import BaseModel


class UserProfile(BaseModel):
    id: str
    email: str
    displayName: str
    role: str
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}


class MeResponse(BaseModel):
    user: UserProfile
