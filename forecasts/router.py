
"""Router for the Forecasts module (ML-generated solar power forecasts)."""

import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from forecasts.models import Forecast
from forecasts.schemas import ForecastCreate, ForecastResponse, ForecastUpdate
from plants.database import get_db
from plants.models import Plant

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/forecasts", tags=["Forecasts"])

# Columns that are NOT NULL in the Forecast model.
# model_version is nullable, so it is intentionally not listed.
REQUIRED_UPDATE_FIELDS = {
    "forecast_timestamp",
    "predicted_power_kw",
    "source",
}


# ----------------------------------------------------------------------
# Helper functions
# ----------------------------------------------------------------------

def _utc_to_db(value: datetime) -> datetime:
    """Convert a timezone-aware datetime to naive UTC for storing in MySQL.

    MySQL DATETIME has no timezone, so we store the UTC wall-clock time.
    """
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _db_to_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Make a datetime read from MySQL timezone-aware (UTC).

    Every timestamp we write is UTC, so a naive value coming back from
    the database is known to be UTC. This is never applied to client input.
    """
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def _to_response(forecast: Forecast) -> ForecastResponse:
    """Build a ForecastResponse from a Forecast ORM object, with UTC datetimes."""
    return ForecastResponse.model_validate(
        {
            "id": forecast.id,
            "plant_id": forecast.plant_id,
            "forecast_timestamp": _db_to_utc(
                forecast.forecast_timestamp
            ),
            "predicted_power_kw": forecast.predicted_power_kw,
            "source": forecast.source,
            "model_version": forecast.model_version,
            "created_at": _db_to_utc(forecast.created_at),
        }
    )


def _query_date_to_db(
    value: Optional[datetime],
    name: str,
) -> Optional[datetime]:
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


def _get_forecast_or_404(
    db: Session,
    forecast_id: int,
) -> Forecast:
    """Fetch one forecast by its primary key (id), or raise HTTP 404."""

    forecast = db.get(Forecast, forecast_id)

    if forecast is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Forecast with id {forecast_id} not found",
        )

    return forecast


# ----------------------------------------------------------------------
# 1. POST /forecasts
# ----------------------------------------------------------------------

@router.post(
    "",
    response_model=ForecastResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_forecast(
    payload: ForecastCreate,
    db: Session = Depends(get_db),
):
    """Create a new forecast for an existing plant."""

    try:
        # Plant.plant_id is the unique string code,
        # different from the numeric primary key Plant.id.
        plant = db.execute(
            select(Plant).where(Plant.plant_id == payload.plant_id)
        ).scalar_one_or_none()

        if plant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plant '{payload.plant_id}' not found",
            )

        forecast = Forecast(
            plant_id=payload.plant_id,
            forecast_timestamp=_utc_to_db(
                payload.forecast_timestamp
            ),
            predicted_power_kw=payload.predicted_power_kw,
            source=payload.source,
            model_version=payload.model_version,
        )

        db.add(forecast)
        db.commit()
        db.refresh(forecast)

        return _to_response(forecast)

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError:
        db.rollback()
        logger.exception("Integrity error while creating forecast")

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Forecast conflicts with existing data",
        )

    except SQLAlchemyError:
        db.rollback()
        logger.exception("Database error while creating forecast")
        raise _database_error()


# ----------------------------------------------------------------------
# 2. GET /forecasts
# ----------------------------------------------------------------------

@router.get(
    "",
    response_model=List[ForecastResponse],
    status_code=status.HTTP_200_OK,
)
def list_forecasts(
    plant_id: Optional[str] = Query(
        default=None,
        min_length=1,
        max_length=50,
    ),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List forecasts, newest first, with optional filters and pagination."""

    start_db = _query_date_to_db(start_date, "start_date")
    end_db = _query_date_to_db(end_date, "end_date")

    if start_db is not None and end_db is not None and start_db > end_db:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_date must not be later than end_date",
        )

    try:
        stmt = select(Forecast)

        # FIX: plant_id is optional.
        # If supplied, filter by it. Otherwise, return all plants' forecasts.
        if plant_id is not None:
            plant_id = plant_id.strip()

            if not plant_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="plant_id cannot be empty",
                )

            stmt = stmt.where(Forecast.plant_id == plant_id)

        if start_db is not None:
            stmt = stmt.where(
                Forecast.forecast_timestamp >= start_db
            )

        if end_db is not None:
            stmt = stmt.where(
                Forecast.forecast_timestamp <= end_db
            )

        # Newest first; id is a tie-breaker so paging is stable.
        stmt = (
            stmt.order_by(
                Forecast.forecast_timestamp.desc(),
                Forecast.id.desc(),
            )
            .offset(skip)
            .limit(limit)
        )

        forecasts = db.execute(stmt).scalars().all()

        return [_to_response(forecast) for forecast in forecasts]

    except HTTPException:
        raise

    except SQLAlchemyError:
        logger.exception("Database error while listing forecasts")
        raise _database_error()


# ----------------------------------------------------------------------
# 3. GET /forecasts/{forecast_id}
# ----------------------------------------------------------------------

@router.get(
    "/{forecast_id}",
    response_model=ForecastResponse,
    status_code=status.HTTP_200_OK,
)
def get_forecast(
    forecast_id: int,
    db: Session = Depends(get_db),
):
    """Get one forecast by id."""

    try:
        return _to_response(
            _get_forecast_or_404(db, forecast_id)
        )

    except HTTPException:
        raise

    except SQLAlchemyError:
        logger.exception("Database error while fetching forecast")
        raise _database_error()


# ----------------------------------------------------------------------
# 4. PUT /forecasts/{forecast_id}
# ----------------------------------------------------------------------

@router.put(
    "/{forecast_id}",
    response_model=ForecastResponse,
    status_code=status.HTTP_200_OK,
)
def update_forecast(
    forecast_id: int,
    payload: ForecastUpdate,
    db: Session = Depends(get_db),
):
    """Update only fields sent by the client. plant_id can never change."""

    # Only fields actually provided by the client.
    changes = payload.model_dump(exclude_unset=True)

    # Defensive check for required fields.
    for field in REQUIRED_UPDATE_FIELDS:
        if field in changes and changes[field] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field} cannot be null",
            )

    try:
        forecast = _get_forecast_or_404(db, forecast_id)

        for field, value in changes.items():
            if field == "forecast_timestamp":
                value = _utc_to_db(value)

            setattr(forecast, field, value)

        db.commit()
        db.refresh(forecast)

        return _to_response(forecast)

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError:
        db.rollback()
        logger.exception("Integrity error while updating forecast")

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Update conflicts with existing data",
        )

    except SQLAlchemyError:
        db.rollback()
        logger.exception("Database error while updating forecast")
        raise _database_error()


# ----------------------------------------------------------------------
# 5. DELETE /forecasts/{forecast_id}
# ----------------------------------------------------------------------

@router.delete(
    "/{forecast_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_forecast(
    forecast_id: int,
    db: Session = Depends(get_db),
):
    """Delete one forecast by id."""

    try:
        forecast = _get_forecast_or_404(db, forecast_id)

        db.delete(forecast)
        db.commit()

        return Response(
            status_code=status.HTTP_204_NO_CONTENT
        )

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError:
        db.rollback()
        logger.exception("Integrity error while deleting forecast")

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Forecast cannot be deleted because of existing data",
        )

    except SQLAlchemyError:
        db.rollback()
        logger.exception("Database error while deleting forecast")
        raise _database_error()
