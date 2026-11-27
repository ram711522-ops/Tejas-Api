
"""Pydantic v2 schemas for TEJAS plant readings."""

import math
from datetime import datetime, timezone
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


ReadingSource = Literal[
    "inverter",
    "scada",
    "meter",
    "historical_dataset",
    "manual",
]


class ReadingCreate(BaseModel):
    """Data required to create a plant reading."""

    plant_id: str = Field(min_length=1, max_length=50)
    timestamp: datetime

    ambient_temperature: float
    module_temperature: float
    irradiation: float = Field(ge=0)
    actual_power_kw: float = Field(ge=0)

    source: ReadingSource

    @field_validator("plant_id")
    @classmethod
    def validate_plant_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("plant_id cannot be empty")
        return value

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must include a timezone")
        return value.astimezone(timezone.utc)

    @field_validator(
        "ambient_temperature",
        "module_temperature",
        "irradiation",
        "actual_power_kw",
    )
    @classmethod
    def validate_finite(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("Measurement must be a finite number")
        return value


class ReadingUpdate(BaseModel):
    """Fields that can be partially updated. plant_id cannot be changed."""

    model_config = ConfigDict(extra="forbid")

    timestamp: datetime | None = None
    ambient_temperature: float | None = None
    module_temperature: float | None = None
    irradiation: float | None = Field(default=None, ge=0)
    actual_power_kw: float | None = Field(default=None, ge=0)
    source: ReadingSource | None = None

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp(
        cls,
        value: datetime | None,
    ) -> datetime | None:
        if value is None:
            return value

        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must include a timezone")

        return value.astimezone(timezone.utc)

    @field_validator(
        "ambient_temperature",
        "module_temperature",
        "irradiation",
        "actual_power_kw",
    )
    @classmethod
    def validate_finite(cls, value: float | None) -> float | None:
        if value is not None and not math.isfinite(value):
            raise ValueError("Measurement must be a finite number")
        return value

    @model_validator(mode="after")
    def reject_empty_update(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self


class ReadingResponse(BaseModel):
    """Response returned from the database."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    plant_id: str
    timestamp: datetime
    ambient_temperature: float
    module_temperature: float
    irradiation: float
    actual_power_kw: float
    source: str
    created_at: datetime
