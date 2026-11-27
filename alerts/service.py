"""Comparison, deviation detection, and alert generation helpers."""

import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from alerts.models import Alert
from alerts.schemas import AlertResponse, CompareResponse
from forecasts.models import Forecast
from plants.models import Plant
from plants.router import get_plant_or_404
from readings.models import Reading

CONFIG_PATH = Path(__file__).resolve().parent.parent / "models" / "model_config.json"

# Keep consistent with api/main.py
PLANT_MODEL_CODES = {
    "4135001": 0,
    "4136001": 1,
    "TEJAS001": 0,
}


@lru_cache
def _load_model_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as file:
        return json.load(file)


def _db_to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _resolve_training_plant_id(plant_id: str, config: dict) -> str:
    code = PLANT_MODEL_CODES.get(plant_id, 0)
    return "4135001" if code == 0 else str(config["plant_2_id"])


def evaluate_deviation(
    plant: Plant,
    forecast: Forecast,
    reading: Reading,
    config: Optional[dict] = None,
) -> dict:
    """Compare a forecast and an actual reading using scaled model thresholds."""
    cfg = config or _load_model_config()
    training_plant_id = _resolve_training_plant_id(plant.plant_id, cfg)

    training_capacity_kw = float(cfg["training_capacity_kw"][training_plant_id])
    plant_capacity_kw = float(plant.installed_capacity_mw) * 1000.0
    scale_factor = plant_capacity_kw / training_capacity_kw

    scaled_threshold = float(cfg["deviation_thresholds_kw"][training_plant_id]) * scale_factor
    scaled_center = float(cfg["residual_center_kw"][training_plant_id]) * scale_factor
    scaled_min_predicted = float(cfg["relative_rule"]["min_predicted_kw"]) * scale_factor
    relative_ratio = float(cfg["relative_rule"]["ratio"])
    daytime_cutoff = float(cfg["daytime_irradiation"])

    predicted = float(forecast.predicted_power_kw)
    actual = float(reading.actual_power_kw)
    residual = actual - predicted
    deviation_kw = abs(residual)
    deviation_percent = round((deviation_kw / predicted) * 100.0, 2) if predicted > 0 else None

    daytime = float(reading.irradiation) > daytime_cutoff
    threshold_deviation = abs(residual - scaled_center) > scaled_threshold
    relative_deviation = (
        predicted >= scaled_min_predicted and actual < relative_ratio * predicted
    )
    deviation_detected = daytime and (threshold_deviation or relative_deviation)

    severity: Optional[str] = None
    alert_type = "power_deviation"
    if not daytime:
        reason = "Nighttime or low irradiation; deviation check skipped."
    elif deviation_detected:
        if relative_deviation or abs(residual - scaled_center) > 2.0 * scaled_threshold:
            severity = "high"
        else:
            severity = "medium"

        if relative_deviation and actual < predicted:
            reason = (
                f"Actual power ({actual:.2f} kW) dropped below {int(relative_ratio * 100)}% "
                f"of predicted ({predicted:.2f} kW)."
            )
        elif residual < 0:
            reason = (
                f"Under-generation detected: actual is {deviation_kw:.2f} kW below "
                f"predicted (threshold {scaled_threshold:.2f} kW)."
            )
        else:
            reason = (
                f"Over-generation detected: actual is {deviation_kw:.2f} kW above "
                f"predicted (threshold {scaled_threshold:.2f} kW)."
            )
    else:
        reason = "Actual generation is within normal operating range."

    return {
        "residual_kw": round(residual, 2),
        "deviation_kw": round(deviation_kw, 2),
        "deviation_percent": deviation_percent,
        "daytime": daytime,
        "threshold_kw": round(scaled_threshold, 2),
        "deviation_detected": deviation_detected,
        "alert_type": alert_type,
        "severity": severity,
        "reason": reason[:255],
    }


def _get_forecast_for_plant(
    db: Session, plant_id: str, forecast_id: Optional[int]
) -> Forecast:
    if forecast_id is not None:
        forecast = db.get(Forecast, forecast_id)
        if forecast is None or forecast.plant_id != plant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Forecast {forecast_id} not found for plant '{plant_id}'.",
            )
        return forecast

    forecast = db.execute(
        select(Forecast)
        .where(Forecast.plant_id == plant_id)
        .order_by(Forecast.forecast_timestamp.desc(), Forecast.id.desc())
        .limit(1)
    ).scalar_one_or_none()

    if forecast is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No forecasts found for plant '{plant_id}'. Generate a forecast first.",
        )
    return forecast


def _get_reading_for_plant(
    db: Session, plant_id: str, reading_id: Optional[int]
) -> Reading:
    if reading_id is not None:
        reading = db.get(Reading, reading_id)
        if reading is None or reading.plant_id != plant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Reading {reading_id} not found for plant '{plant_id}'.",
            )
        return reading

    reading = db.execute(
        select(Reading)
        .where(Reading.plant_id == plant_id)
        .order_by(Reading.timestamp.desc(), Reading.id.desc())
        .limit(1)
    ).scalar_one_or_none()

    if reading is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No readings found for plant '{plant_id}'. Add an actual reading first.",
        )
    return reading


def compare_and_alert(
    db: Session,
    plant_id: str,
    forecast_id: Optional[int] = None,
    reading_id: Optional[int] = None,
    create_alert: bool = True,
) -> CompareResponse:
    """Compare predicted vs actual power for a plant and optionally save an alert."""
    plant = get_plant_or_404(db, plant_id)
    forecast = _get_forecast_for_plant(db, plant_id, forecast_id)
    reading = _get_reading_for_plant(db, plant_id, reading_id)

    evaluation = evaluate_deviation(plant, forecast, reading)

    alert_obj: Optional[Alert] = None
    alert_generated = False

    if evaluation["deviation_detected"] and create_alert:
        existing = db.execute(
            select(Alert)
            .where(
                Alert.plant_id == plant_id,
                Alert.forecast_id == forecast.id,
                Alert.reading_id == reading.id,
            )
            .order_by(Alert.id.desc())
        ).scalars().first()

        if existing is not None:
            alert_obj = existing
        else:
            alert_obj = Alert(
                plant_id=plant_id,
                forecast_id=forecast.id,
                reading_id=reading.id,
                predicted_power_kw=forecast.predicted_power_kw,
                actual_power_kw=reading.actual_power_kw,
                residual_kw=evaluation["residual_kw"],
                deviation_percent=evaluation["deviation_percent"],
                severity=evaluation["severity"] or "medium",
                status="open",
                message=evaluation["reason"],
                triggered_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )
            db.add(alert_obj)
            db.commit()
            db.refresh(alert_obj)
            alert_generated = True

    return CompareResponse(
        plant_id=plant.plant_id,
        plant_name=plant.plant_name,
        forecast_id=forecast.id,
        forecast_timestamp=_db_to_utc(forecast.forecast_timestamp),
        predicted_power_kw=forecast.predicted_power_kw,
        reading_id=reading.id,
        reading_timestamp=_db_to_utc(reading.timestamp),
        actual_power_kw=reading.actual_power_kw,
        irradiation=reading.irradiation,
        residual_kw=evaluation["residual_kw"],
        deviation_kw=evaluation["deviation_kw"],
        deviation_percent=evaluation["deviation_percent"],
        daytime=evaluation["daytime"],
        threshold_kw=evaluation["threshold_kw"],
        deviation_detected=evaluation["deviation_detected"],
        severity=evaluation["severity"],
        reason=evaluation["reason"],
        alert_generated=alert_generated,
        alert=AlertResponse.model_validate(alert_obj) if alert_obj is not None else None,
    )
