"""Pydantic v2 schemas for the Forecasts module."""

import math
from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)

ForecastSource = Literal["ml_model", "external", "manual"]

# Columns that are NOT NULL in the Forecast model.
# model_version is nullable, so it is not listed here.
NON_NULLABLE_UPDATE_FIELDS = ("forecast_timestamp", "predicted_power_kw", "source")


def _require_finite(value: Optional[float], field_name: str) -> Optional[float]:
    """Reject NaN and +/- infinity."""
    if value is not None and not math.isfinite(value):
        raise ValueError(f"{field_name} must be a finite number")
    return value


def _to_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Require a timezone-aware datetime and convert it to UTC."""
    if value is None:
        return value
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        raise ValueError(
            "forecast_timestamp must include a timezone, "
            "e.g. 2026-11-25T10:00:00+05:30 or ...Z"
        )
    return value.astimezone(timezone.utc)


def _assume_db_utc(value: datetime) -> datetime:
    """Mark a datetime read FROM the database as UTC.

    MySQL DATETIME returns naive values. Every value we store is already UTC,
    so a naive value from the database is known to be UTC. This is used only
    in ForecastResponse, never for data sent by clients.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class ForecastBase(BaseModel):
    """Fields shared by all forecast schemas."""

    forecast_timestamp: datetime
    predicted_power_kw: float = Field(ge=0)
    source: ForecastSource
    model_version: Optional[str] = Field(default=None, min_length=1, max_length=50)

    @field_validator("predicted_power_kw")
    @classmethod
    def validate_finite(cls, v: float, info: ValidationInfo) -> float:
        return _require_finite(v, info.field_name)


class ForecastCreate(ForecastBase):
    """Body for creating a forecast. Incoming timestamps must be timezone-aware."""

    model_config = ConfigDict(str_strip_whitespace=True)

    plant_id: str = Field(min_length=1, max_length=50)

    @field_validator("forecast_timestamp")
    @classmethod
    def validate_timestamp(cls, v: datetime) -> datetime:
        return _to_utc(v)


class ForecastUpdate(BaseModel):
    """Body for a partial update. plant_id cannot be changed."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    forecast_timestamp: Optional[datetime] = None
    predicted_power_kw: Optional[float] = Field(default=None, ge=0)
    source: Optional[ForecastSource] = None
    model_version: Optional[str] = Field(default=None, min_length=1, max_length=50)

    @field_validator("forecast_timestamp")
    @classmethod
    def validate_timestamp(cls, v: Optional[datetime]) -> Optional[datetime]:
        return _to_utc(v)

    @field_validator("predicted_power_kw")
    @classmethod
    def validate_finite(
        cls, v: Optional[float], info: ValidationInfo
    ) -> Optional[float]:
        return _require_finite(v, info.field_name)

    @model_validator(mode="after")
    def validate_update(self) -> "ForecastUpdate":
        # Reject an empty body like {}.
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided for an update")

        # Reject explicit null for NOT NULL columns.
        # (Leaving a field out is fine; sending null is not.)
        for name in NON_NULLABLE_UPDATE_FIELDS:
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class ForecastResponse(ForecastBase):
    """Returned to API clients. Can be built directly from SQLAlchemy objects."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    plant_id: str
    created_at: datetime

    @field_validator("forecast_timestamp", "created_at")
    @classmethod
    def utc_from_database(cls, v: datetime) -> datetime:
        return _assume_db_utc(v)