"""Mirrors: backend/src/common/utils/pagination.ts"""
from pydantic import BaseModel, Field


class Pagination(BaseModel):
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=25, ge=1, le=100)

    @property
    def skip(self) -> int:
        return (self.page - 1) * self.limit
