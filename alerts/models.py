"""SQLAlchemy model for TEJAS deviation alerts."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from plants.database import Base


def _utc_now() -> datetime:
    """Current UTC time as a naive datetime for MySQL DATETIME."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Alert(Base):
    """Alert generated when actual solar power deviates significantly from forecast."""

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    plant_id: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("plants.plant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    forecast_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("forecasts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    reading_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("readings.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    predicted_power_kw: Mapped[float] = mapped_column(Float(precision=53), nullable=False)
    actual_power_kw: Mapped[float] = mapped_column(Float(precision=53), nullable=False)
    residual_kw: Mapped[float] = mapped_column(Float(precision=53), nullable=False)
    deviation_percent: Mapped[Optional[float]] = mapped_column(Float(precision=53), nullable=True)

    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    message: Mapped[str] = mapped_column(String(255), nullable=False)

    triggered_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
