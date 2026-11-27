"""
REST API endpoint for automatic weather fetching.

GET /plants/{plant_id}/weather   Current weather at the plant's coordinates
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from plants.database import get_db
from plants.router import get_plant_or_404, raise_database_error
from weather.service import WeatherServiceError, fetch_current_weather


router = APIRouter(prefix="/plants", tags=["Weather"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("/{plant_id}/weather")
def get_plant_weather(plant_id: str, db: DbSession):

    # 1. Find the plant (404 if missing) and read its coordinates.
    try:
        plant = get_plant_or_404(db, plant_id)
        plant_info = {
            "plant_id": plant.plant_id,
            "plant_name": plant.plant_name,
            "latitude": plant.latitude,
            "longitude": plant.longitude,
        }

    except SQLAlchemyError as error:
        raise_database_error(db, error, "reading a plant for weather")

    # 2. Call Open-Meteo using those coordinates.
    try:
        weather = fetch_current_weather(
            plant_info["latitude"],
            plant_info["longitude"],
        )

    except WeatherServiceError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.message,
        ) from None

    return {**plant_info, "weather": weather}