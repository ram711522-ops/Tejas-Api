"""Router for Alerts and Prediction-vs-Actual Comparison."""

import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from alerts.models import Alert
from alerts.schemas import (
    AlertCreate,
    AlertResponse,
    AlertSeverity,
    AlertStatus,
    AlertUpdate,
    CompareRequest,
    CompareResponse,
)
from alerts.service import compare_and_alert
from plants.database import get_db
from plants.models import Plant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Alerts & Comparison"])


def _database_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="A database error occurred. Please try again later.",
    )


def _get_alert_or_404(db: Session, alert_id: int) -> Alert:
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert with id {alert_id} not found",
        )
    return alert


# ----------------------------------------------------------------------
# 1. Compare prediction & actual -> detect deviation -> generate alert
# ----------------------------------------------------------------------

@router.get(
    "/plants/{plant_id}/compare",
    response_model=CompareResponse,
    status_code=status.HTTP_200_OK,
)
def preview_comparison(
    plant_id: str,
    forecast_id: Optional[int] = Query(default=None, ge=1),
    reading_id: Optional[int] = Query(default=None, ge=1),
    db: Session = Depends(get_db),
):
    """Read-only comparison of a plant's forecast vs actual reading."""
    try:
        return compare_and_alert(
            db,
            plant_id=plant_id,
            forecast_id=forecast_id,
            reading_id=reading_id,
            create_alert=False,
        )
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("Database error while comparing forecast and reading")
        raise _database_error()


@router.post(
    "/plants/{plant_id}/compare",
    response_model=CompareResponse,
    status_code=status.HTTP_200_OK,
)
def run_comparison_and_alert(
    plant_id: str,
    payload: Optional[CompareRequest] = None,
    db: Session = Depends(get_db),
):
    """Compare forecast vs actual reading, detect deviation, and create an alert."""
    req = payload or CompareRequest()
    try:
        return compare_and_alert(
            db,
            plant_id=plant_id,
            forecast_id=req.forecast_id,
            reading_id=req.reading_id,
            create_alert=req.create_alert,
        )
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Database error while comparing and generating alert")
        raise _database_error()


# ----------------------------------------------------------------------
# 2. Alerts CRUD (/alerts)
# ----------------------------------------------------------------------

@router.post(
    "/alerts",
    response_model=AlertResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_alert(payload: AlertCreate, db: Session = Depends(get_db)):
    """Manually create an alert for an existing plant."""
    try:
        plant = db.execute(
            select(Plant).where(Plant.plant_id == payload.plant_id)
        ).scalar_one_or_none()
        if plant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plant '{payload.plant_id}' not found",
            )

        residual = (
            payload.residual_kw
            if payload.residual_kw is not None
            else round(payload.actual_power_kw - payload.predicted_power_kw, 2)
        )
        deviation_percent = payload.deviation_percent
        if deviation_percent is None and payload.predicted_power_kw > 0:
            deviation_percent = round(
                (abs(residual) / payload.predicted_power_kw) * 100.0, 2
            )

        now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
        alert = Alert(
            plant_id=payload.plant_id,
            forecast_id=payload.forecast_id,
            reading_id=payload.reading_id,
            predicted_power_kw=payload.predicted_power_kw,
            actual_power_kw=payload.actual_power_kw,
            residual_kw=residual,
            deviation_percent=deviation_percent,
            severity=payload.severity,
            status=payload.status,
            message=payload.message,
            triggered_at=now_utc,
            resolved_at=now_utc if payload.status == "resolved" else None,
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)
        return AlertResponse.model_validate(alert)

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Alert references invalid forecast or reading.",
        )
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Database error while creating alert")
        raise _database_error()


@router.get(
    "/alerts",
    response_model=List[AlertResponse],
    status_code=status.HTTP_200_OK,
)
def list_alerts(
    plant_id: Optional[str] = Query(default=None, min_length=1, max_length=50),
    alert_status: Optional[AlertStatus] = Query(default=None, alias="status"),
    severity: Optional[AlertSeverity] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List alerts, newest first, with optional filters."""
    try:
        stmt = select(Alert)
        if plant_id is not None:
            stmt = stmt.where(Alert.plant_id == plant_id.strip())
        if alert_status is not None:
            stmt = stmt.where(Alert.status == alert_status)
        if severity is not None:
            stmt = stmt.where(Alert.severity == severity)

        stmt = (
            stmt.order_by(Alert.triggered_at.desc(), Alert.id.desc())
            .offset(skip)
            .limit(limit)
        )
        alerts = db.execute(stmt).scalars().all()
        return [AlertResponse.model_validate(a) for a in alerts]
    except SQLAlchemyError:
        logger.exception("Database error while listing alerts")
        raise _database_error()


@router.get(
    "/alerts/{alert_id}",
    response_model=AlertResponse,
    status_code=status.HTTP_200_OK,
)
def get_alert(alert_id: int, db: Session = Depends(get_db)):
    """Get one alert by id."""
    try:
        return AlertResponse.model_validate(_get_alert_or_404(db, alert_id))
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("Database error while fetching alert")
        raise _database_error()


@router.put(
    "/alerts/{alert_id}",
    response_model=AlertResponse,
    status_code=status.HTTP_200_OK,
)
def update_alert(
    alert_id: int, payload: AlertUpdate, db: Session = Depends(get_db)
):
    """Update an alert's status, severity, or message."""
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Send at least one field to update.",
        )
    try:
        alert = _get_alert_or_404(db, alert_id)
        for field, value in changes.items():
            setattr(alert, field, value)

        if "status" in changes:
            if changes["status"] == "resolved":
                alert.resolved_at = datetime.now(timezone.utc).replace(tzinfo=None)
            else:
                alert.resolved_at = None

        db.commit()
        db.refresh(alert)
        return AlertResponse.model_validate(alert)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Database error while updating alert")
        raise _database_error()


@router.delete("/alerts/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert(alert_id: int, db: Session = Depends(get_db)):
    """Delete an alert by id."""
    try:
        alert = _get_alert_or_404(db, alert_id)
        db.delete(alert)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Database error while deleting alert")
        raise _database_error()
