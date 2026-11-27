
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Float,
    Integer,
    String,
    ForeignKey,
)
from sqlalchemy.orm import Mapped, mapped_column

from plants.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Reading(Base):
    __tablename__ = "readings"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    plant_id: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("plants.plant_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    ambient_temperature: Mapped[float] = mapped_column(
        Float(precision=53),
        nullable=False,
    )

    module_temperature: Mapped[float] = mapped_column(
        Float(precision=53),
        nullable=False,
    )

    irradiation: Mapped[float] = mapped_column(
        Float(precision=53),
        nullable=False,
    )

    actual_power_kw: Mapped[float] = mapped_column(
        Float(precision=53),
        nullable=False,
    )

    source: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="unknown",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    def __repr__(self) -> str:
        return (
            f"Reading(id={self.id!r}, "
            f"plant_id={self.plant_id!r}, "
            f"actual_power_kw={self.actual_power_kw!r})"
        )
