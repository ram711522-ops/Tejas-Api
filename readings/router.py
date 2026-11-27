"""Router for the Readings module (actual generation readings)."""

import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from plants.database import get_db
from plants.models import Plant
from readings.models import Reading
from readings.schemas import ReadingCreate, ReadingResponse, ReadingUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/readings", tags=["Readings"])

# Columns that are NOT NULL in the Reading model.
# A client may not set these to null in an update.
REQUIRED_UPDATE_FIELDS = {
    "timestamp",
    "ambient_temperature",
    "module_temperature",
    "irradiation",
    "actual_power_kw",
    "source",
}


# ----------------------------------------------------------------------
# Helper functions
# ----------------------------------------------------------------------
def _utc_to_db(value: datetime) -> datetime:
    """Convert a timezone-aware datetime to naive UTC for storing in MySQL.

    The schemas already guarantee the value is timezone-aware and in UTC.
    MySQL DATETIME has no timezone, so we store the UTC wall-clock time.
    """
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _db_to_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Make a datetime read from MySQL timezone-aware (UTC).

    Every timestamp we write is already UTC, so a naive value coming back
    from the database is known to be UTC. (This is NOT applied to incoming
    client data, which must carry its own timezone.)
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _to_response(reading: Reading) -> ReadingResponse:
    """Build a ReadingResponse from a Reading ORM object, with UTC datetimes."""
    return ReadingResponse.model_validate(
        {
            "id": reading.id,
            "plant_id": reading.plant_id,
            "timestamp": _db_to_utc(reading.timestamp),
            "ambient_temperature": reading.ambient_temperature,
            "module_temperature": reading.module_temperature,
            "irradiation": reading.irradiation,
            "actual_power_kw": reading.actual_power_kw,
            "source": reading.source,
            "created_at": _db_to_utc(reading.created_at),
        }
    )


def _query_date_to_db(value: Optional[datetime], name: str) -> Optional[datetime]:
    """Validate a start_date/end_date query value and convert it to naive UTC."""
    if value is None:
        return None
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{name} must include a timezone, e.g. 2026-11-25T00:00:00Z",
        )
    return _utc_to_db(value)


def _database_error() -> HTTPException:
    """A safe, generic error that never exposes database details."""
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="A database error occurred. Please try again later.",
    )


def _get_reading_or_404(db: Session, reading_id: int) -> Reading:
    """Fetch one reading by its primary key (id), or raise HTTP 404."""
    reading = db.get(Reading, reading_id)
    if reading is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reading with id {reading_id} not found",
        )
    return reading


# ----------------------------------------------------------------------
# 1. POST /readings
# ----------------------------------------------------------------------
@router.post("", response_model=ReadingResponse, status_code=status.HTTP_201_CREATED)
def create_reading(payload: ReadingCreate, db: Session = Depends(get_db)):
    """Create a new actual-generation reading for an existing plant."""
    try:
        # The plant must exist before we attach a reading to it.
        # Plant.plant_id is the unique string code (e.g. "TEJAS001"),
        # which is different from the numeric primary key Plant.id.
        plant = db.execute(
            select(Plant).where(Plant.plant_id == payload.plant_id)
        ).scalar_one_or_none()
        if plant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plant '{payload.plant_id}' not found",
            )

        reading = Reading(
            plant_id=payload.plant_id,
            timestamp=_utc_to_db(payload.timestamp),
            ambient_temperature=payload.ambient_temperature,
            module_temperature=payload.module_temperature,
            irradiation=payload.irradiation,
            actual_power_kw=payload.actual_power_kw,
            source=payload.source,
        )
        db.add(reading)
        db.commit()
        db.refresh(reading)  # loads id and created_at generated by the database
        return _to_response(reading)

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        logger.exception("Integrity error while creating reading")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Reading conflicts with existing data",
        )
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Database error while creating reading")
        raise _database_error()


# ----------------------------------------------------------------------
# 2. GET /readings
# ----------------------------------------------------------------------
@router.get("", response_model=List[ReadingResponse], status_code=status.HTTP_200_OK)
def list_readings(
    plant_id: Optional[str] = Query(default=None, min_length=1, max_length=50),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List readings, newest first, with optional filters and pagination."""
    start_db = _query_date_to_db(start_date, "start_date")
    end_db = _query_date_to_db(end_date, "end_date")

    if start_db is not None and end_db is not None and start_db > end_db:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_date must not be later than end_date",
        )

    try:
        stmt = select(Reading)
        if plant_id is not None:
            stmt = stmt.where(Reading.plant_id == plant_id)
        if start_db is not None:
            stmt = stmt.where(Reading.timestamp >= start_db)
        if end_db is not None:
            stmt = stmt.where(Reading.timestamp <= end_db)

        # Newest first; id is a tie-breaker so paging is stable.
        stmt = (
            stmt.order_by(Reading.timestamp.desc(), Reading.id.desc())
            .offset(skip)
            .limit(limit)
        )
        readings = db.execute(stmt).scalars().all()
        return [_to_response(r) for r in readings]

    except SQLAlchemyError:
        logger.exception("Database error while listing readings")
        raise _database_error()


# ----------------------------------------------------------------------
# 3. GET /readings/{reading_id}
# ----------------------------------------------------------------------
@router.get(
    "/{reading_id}", response_model=ReadingResponse, status_code=status.HTTP_200_OK
)
def get_reading(reading_id: int, db: Session = Depends(get_db)):
    """Get one reading by id."""
    try:
        return _to_response(_get_reading_or_404(db, reading_id))
    except SQLAlchemyError:
        logger.exception("Database error while fetching reading")
        raise _database_error()


# ----------------------------------------------------------------------
# 4. PUT /readings/{reading_id}
# ----------------------------------------------------------------------
@router.put(
    "/{reading_id}", response_model=ReadingResponse, status_code=status.HTTP_200_OK
)
def update_reading(
    reading_id: int, payload: ReadingUpdate, db: Session = Depends(get_db)
):
    """Update only the fields the client sent. plant_id can never change."""
    # exclude_unset=True keeps only fields the client actually provided.
    changes = payload.model_dump(exclude_unset=True)

    # NOT NULL columns may not be set to null.
    for field in REQUIRED_UPDATE_FIELDS:
        if field in changes and changes[field] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field} cannot be null",
            )

    try:
        reading = _get_reading_or_404(db, reading_id)

        for field, value in changes.items():
            if field == "timestamp":
                value = _utc_to_db(value)
            setattr(reading, field, value)

        db.commit()
        db.refresh(reading)
        return _to_response(reading)

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        logger.exception("Integrity error while updating reading")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Update conflicts with existing data",
        )
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Database error while updating reading")
        raise _database_error()


# ----------------------------------------------------------------------
# 5. DELETE /readings/{reading_id}
# ----------------------------------------------------------------------
@router.delete("/{reading_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reading(reading_id: int, db: Session = Depends(get_db)):
    """Delete one reading by id."""
    try:
        reading = _get_reading_or_404(db, reading_id)
        db.delete(reading)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Database error while deleting reading")
        raise _database_error()