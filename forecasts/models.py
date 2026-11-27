"""SQLAlchemy model for ML-generated solar power forecasts."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from plants.database import Base


def _utc_now() -> datetime:
    """Current UTC time as a naive datetime.

    MySQL DATETIME has no timezone, so we store the UTC wall-clock time.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Forecast(Base):
    """One predicted power value for one plant at one future/past hour."""

    __tablename__ = "forecasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Links to the plant's unique string code (e.g. "TEJAS001"),
    # NOT to the numeric plants.id.
    plant_id: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("plants.plant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # The hour this prediction is FOR (stored as naive UTC).
    forecast_timestamp: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, index=True
    )
    predicted_power_kw: Mapped[float] = mapped_column(
    Float(precision=53), nullable=False
)
    # Where the forecast came from, e.g. the weather provider or "ml_model".
    source: Mapped[str] = mapped_column(String(50), nullable=False)

    # Which trained model produced it. Optional.
    model_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # When this row was created (naive UTC).
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=_utc_now
    )