
"""
SQLAlchemy ORM model for TEJAS plant management.

A model class describes ONE database table. Each attribute is one column.
This file only DESCRIBES the table. It does not create it, and it does not
talk to the database.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from plants.database import Base


def utc_now() -> datetime:
    """Current time as a timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


class Plant(Base):
    __tablename__ = "plants"

    # Ensure every plant has a unique plant_id.
    __table_args__ = (
        UniqueConstraint("plant_id", name="uq_plants_plant_id"),
    )

    # Internal database primary key.
    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )

    # Public plant identifier.
    plant_id: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )

    plant_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    plant_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )

    # Location and installed capacity.
    latitude: Mapped[float] = mapped_column(
        Float(precision=53),
        nullable=False
    )

    longitude: Mapped[float] = mapped_column(
        Float(precision=53),
        nullable=False
    )

    installed_capacity_mw: Mapped[float] = mapped_column(
        Float(precision=53),
        nullable=False
    )

    # Optional panel angles.
    # Python attributes: tilt and azimuth.
    # Actual MySQL columns: panel_tilt and panel_azimuth.

    tilt: Mapped[float | None] = mapped_column(
        "panel_tilt",
        Float(precision=53),
        nullable=True
    )

    azimuth: Mapped[float | None] = mapped_column(
        "panel_azimuth",
        Float(precision=53),
        nullable=True
    )

    # Timestamps are stored using UTC values.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now
    )

    def __repr__(self) -> str:
        return (
            f"Plant(id={self.id!r}, plant_id={self.plant_id!r}, "
            f"plant_name={self.plant_name!r}, plant_type={self.plant_type!r}, "
            f"installed_capacity_mw={self.installed_capacity_mw!r})"
        )
