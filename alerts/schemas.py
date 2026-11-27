"""Pydantic v2 schemas for the Alerts and Comparison endpoints."""

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


AlertSeverity = Literal["low", "medium", "high"]
AlertStatus = Literal["open", "acknowledged", "resolved"]


def _assume_db_utc(value: datetime) -> datetime:
    """Mark a naive UTC datetime read from the database as timezone-aware UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class AlertCreate(BaseModel):
    """Body for manually creating an alert."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    plant_id: str = Field(min_length=1, max_length=50)
    forecast_id: Optional[int] = Field(default=None, ge=1)
    reading_id: Optional[int] = Field(default=None, ge=1)
    predicted_power_kw: float = Field(ge=0, allow_inf_nan=False)
    actual_power_kw: float = Field(ge=0, allow_inf_nan=False)
    residual_kw: Optional[float] = Field(default=None, allow_inf_nan=False)
    deviation_percent: Optional[float] = Field(default=None, allow_inf_nan=False)
    severity: AlertSeverity = "medium"
    status: AlertStatus = "open"
    message: str = Field(min_length=1, max_length=255)


class AlertUpdate(BaseModel):
    """Partial update to change an alert's status, severity, or message."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    status: Optional[AlertStatus] = None
    severity: Optional[AlertSeverity] = None
    message: Optional[str] = Field(default=None, min_length=1, max_length=255)

    @model_validator(mode="after")
    def validate_update(self) -> "AlertUpdate":
        if not self.model_fields_set:
            raise ValueError("Send at least one field to update.")
        for field in ("status", "severity", "message"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null.")
        return self


class AlertResponse(BaseModel):
    """Alert returned to API clients."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    plant_id: str
    forecast_id: Optional[int] = None
    reading_id: Optional[int] = None
    predicted_power_kw: float
    actual_power_kw: float
    residual_kw: float
    deviation_percent: Optional[float] = None
    severity: AlertSeverity
    status: AlertStatus
    message: str
    triggered_at: datetime
    resolved_at: Optional[datetime] = None
    created_at: datetime

    @field_validator("triggered_at", "created_at")
    @classmethod
    def utc_from_database(cls, v: datetime) -> datetime:
        return _assume_db_utc(v)

    @field_validator("resolved_at")
    @classmethod
    def optional_utc_from_database(cls, v: Optional[datetime]) -> Optional[datetime]:
        return _assume_db_utc(v) if v is not None else None


class CompareRequest(BaseModel):
    """Optional IDs to compare a specific forecast and reading for a plant."""

    model_config = ConfigDict(extra="forbid")

    forecast_id: Optional[int] = Field(default=None, ge=1)
    reading_id: Optional[int] = Field(default=None, ge=1)
    create_alert: bool = True


class CompareResponse(BaseModel):
    """Result of comparing a forecast against an actual reading."""

    plant_id: str
    plant_name: str
    forecast_id: int
    forecast_timestamp: datetime
    predicted_power_kw: float
    reading_id: int
    reading_timestamp: datetime
    actual_power_kw: float
    irradiation: float
    residual_kw: float
    deviation_kw: float
    deviation_percent: Optional[float] = None
    daytime: bool
    threshold_kw: float
    deviation_detected: bool
    severity: Optional[AlertSeverity] = None
    reason: str
    alert_generated: bool
    alert: Optional[AlertResponse] = None

    @field_validator("forecast_timestamp", "reading_timestamp")
    @classmethod
    def utc_from_database(cls, v: datetime) -> datetime:
        return _assume_db_utc(v)
