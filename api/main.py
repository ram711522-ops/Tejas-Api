import json
import logging
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import joblib
import pandas as pd
from dotenv import load_dotenv

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError, model_validator
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from alerts.router import router as alerts_router
from api.auth import authenticate_user
from forecasts.router import create_forecast, router as forecasts_router
from forecasts.schemas import ForecastCreate
from plants.database import check_database_connection, get_db
from plants.router import (
    get_plant_or_404,
    raise_database_error,
    router as plants_router,
)
from readings.router import router as readings_router
from weather.router import router as weather_router
from weather.service import WeatherServiceError, fetch_current_weather


# --------------------------------------------------
# 1. Logging and paths
# --------------------------------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tejas.api")

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent

MODEL_PATH = PROJECT_DIR / "models" / "solar_model.joblib"
CONFIG_PATH = PROJECT_DIR / "models" / "model_config.json"

load_dotenv(PROJECT_DIR / ".env")


# --------------------------------------------------
# 2. Authentication configuration
# --------------------------------------------------

if not os.getenv("API_USERNAME") or not os.getenv("API_PASSWORD"):
    raise RuntimeError(
        "API_USERNAME and API_PASSWORD must be configured in the .env file"
    )


# --------------------------------------------------
# 3. Load model and configuration
# --------------------------------------------------

try:
    model = joblib.load(MODEL_PATH)

    with open(CONFIG_PATH, "r", encoding="utf-8") as file:
        config = json.load(file)

    required_config_keys = [
        "features",
        "plant_2_id",
        "deviation_thresholds_kw",
        "residual_center_kw",
        "relative_rule",
        "daytime_irradiation",
        "training_capacity_kw",
    ]

    for key in required_config_keys:
        if key not in config:
            raise ValueError(f"Missing configuration key: {key}")

    logger.info("TEJAS model and configuration loaded successfully")

except Exception:
    logger.exception("Failed to load TEJAS model or configuration")
    raise


# Training plant mapping (model plant_code -> training plant id)
PLANT_IDS = {
    0: "4135001",
    1: str(config["plant_2_id"]),
}

# Registered plant id -> model plant_code used for automatic prediction.
# "TEJAS001" -> 0 is an ASSUMPTION: it means "behave like training plant
# 4135001". Change it to 1 if plant 4136001 is a better match.
PLANT_MODEL_CODES = {
    "4135001": 0,
    "4136001": 1,
    "TEJAS001": 0,
}

# Optional label stored with every saved forecast (max 50 characters).
MODEL_VERSION = (str(config.get("model_version") or "")[:50]) or None


# --------------------------------------------------
# 4. Create FastAPI application
# --------------------------------------------------

app = FastAPI(
    title="TEJAS Solar Prediction API",
    description="Solar power prediction and deviation detection",
    version="1.2",
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


# --------------------------------------------------
# 5. Safe validation error handler
# --------------------------------------------------

@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    problems = [
        {
            "loc": list(error["loc"]),
            "msg": error["msg"],
            "type": error["type"],
        }
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": problems})


# --------------------------------------------------
# 6. Input validation
# --------------------------------------------------

class SolarInput(BaseModel):
    plant_code: int = Field(ge=0, le=1)
    AMBIENT_TEMPERATURE: float = Field(ge=-20, le=60, allow_inf_nan=False)
    MODULE_TEMPERATURE: float = Field(ge=-20, le=100, allow_inf_nan=False)
    IRRADIATION: float = Field(ge=0, le=1.5, allow_inf_nan=False)
    hour_sin: float = Field(ge=-1, le=1, allow_inf_nan=False)
    hour_cos: float = Field(ge=-1, le=1, allow_inf_nan=False)
    actual_power: float | None = Field(default=None, ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_time_features(self):
        if abs(self.hour_sin**2 + self.hour_cos**2 - 1) > 0.02:
            raise ValueError("hour_sin and hour_cos must represent a valid time of day")
        return self


# --------------------------------------------------
# 7. Home and health endpoints (public)
# --------------------------------------------------

@app.get("/")
def home():
    return {"message": "TEJAS Solar Prediction API is running"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "model_features": len(config["features"]),
        "database": check_database_connection(),
    }


# --------------------------------------------------
# 8. Manual prediction endpoint (unchanged behaviour)
# --------------------------------------------------

@app.post("/predict")
def predict(
    data: SolarInput,
    username: str = Depends(authenticate_user),
):
    try:
        input_data = pd.DataFrame(
            [{feature: getattr(data, feature) for feature in config["features"]}]
        )

        raw_prediction = float(model.predict(input_data)[0])

        if not math.isfinite(raw_prediction):
            raise ValueError("Model returned an invalid prediction")

        predicted_power = max(0.0, raw_prediction)

        result = {
            "plant_code": data.plant_code,
            "predicted_power_kw": round(predicted_power, 2),
        }

        # Optional deviation detection (only when actual_power is supplied).
        if data.actual_power is not None:
            plant_id = PLANT_IDS[data.plant_code]

            residual = data.actual_power - predicted_power
            threshold = config["deviation_thresholds_kw"][plant_id]
            center = config["residual_center_kw"][plant_id]

            daytime = data.IRRADIATION > config["daytime_irradiation"]

            threshold_deviation = abs(residual - center) > threshold

            relative_deviation = (
                predicted_power >= config["relative_rule"]["min_predicted_kw"]
                and data.actual_power
                < config["relative_rule"]["ratio"] * predicted_power
            )

            result.update(
                {
                    "actual_power_kw": data.actual_power,
                    "residual_kw": round(residual, 2),
                    "daytime": daytime,
                    "deviation_detected": daytime
                    and (threshold_deviation or relative_deviation),
                }
            )

        return result

    except Exception:
        logger.exception("Prediction failed")
        raise HTTPException(
            status_code=500,
            detail="Prediction failed. Please try again later.",
        )


# --------------------------------------------------
# 9. Automatic prediction (shared helper + GET preview + POST save)
# --------------------------------------------------
# MODULE_TEMPERATURE is NOT measured. It is ESTIMATED from ambient
# temperature and irradiation with a linear formula
# (1.026476 * ambient + 28.363679 * irradiation - 2.138474).
#
# SCALE: the model predicts whole-plant AC power at the size of the plant
# it was TRAINED on (about 20-29 MW). To report power for the registered
# plant, the raw output is converted to a capacity factor using
# "training_capacity_kw" from models/model_config.json (the 99th percentile
# of the training plant's output) and scaled to the registered plant's
# installed capacity. This is an APPROXIMATION, not a calibrated forecast.
# The final value is also limited to the installed capacity.

def _compute_automatic_prediction(plant_id: str, db: Session):
    """Shared pipeline for GET (preview) and POST (save).

    Returns (result_dict, local_time). Raises HTTPException on any failure,
    so callers never get a half-finished prediction. Never writes to the DB.
    """
    # 1. Registered plant (404 if missing, safe 500 on database errors)
    try:
        plant = get_plant_or_404(db, plant_id)
        plant_name = plant.plant_name
        latitude = plant.latitude
        longitude = plant.longitude
        capacity_kw = float(plant.installed_capacity_mw) * 1000
    except SQLAlchemyError as error:
        raise_database_error(db, error, "reading a plant for automatic prediction")

    # 2. Registered plant -> model plant code (default to 0 for newly registered plants)
    is_mapped_plant = plant_id in PLANT_MODEL_CODES
    model_plant_code = PLANT_MODEL_CODES.get(plant_id, 0)
    training_plant_id = PLANT_IDS[model_plant_code]

    training_capacity_kw = config["training_capacity_kw"].get(training_plant_id)
    if (
        isinstance(training_capacity_kw, bool)
        or not isinstance(training_capacity_kw, (int, float))
        or training_capacity_kw <= 0
    ):
        logger.error("Invalid training_capacity_kw for plant %s", training_plant_id)
        raise HTTPException(
            status_code=500,
            detail="Prediction is not configured correctly. Please contact the administrator.",
        )

    # 3. Current weather at the plant's stored coordinates
    try:
        weather = fetch_current_weather(latitude, longitude)
    except WeatherServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message)

    ambient = weather["ambient_temperature_c"]
    irradiation = weather["irradiation_kw_m2"]

    if ambient is None or irradiation is None:
        raise HTTPException(
            status_code=502,
            detail="Weather data is missing temperature or radiation.",
        )

    # 4. Estimated module temperature
    module_temperature = 1.026476 * ambient + 28.363679 * irradiation - 2.138474

    # 5. Time features from the plant's LOCAL observation time
    #    (decimal hour, the same encoding used in training)
    try:
        observed_at = datetime.fromisoformat(weather["observed_at_local"])
        local_time = observed_at.replace(tzinfo=ZoneInfo(weather["timezone"]))
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Weather observation time is invalid.",
        )

    hour_decimal = local_time.hour + local_time.minute / 60
    angle = 2 * math.pi * hour_decimal / 24
    hour_sin = math.sin(angle)
    hour_cos = math.cos(angle)

    # 6. Validate model input
    try:
        model_input = SolarInput(
            plant_code=model_plant_code,
            AMBIENT_TEMPERATURE=ambient,
            MODULE_TEMPERATURE=module_temperature,
            IRRADIATION=irradiation,
            hour_sin=hour_sin,
            hour_cos=hour_cos,
        )
    except ValidationError:
        raise HTTPException(
            status_code=502,
            detail="Weather values are outside the model's accepted range.",
        )

    # 7. Run the existing model
    try:
        input_frame = pd.DataFrame(
            [{f: getattr(model_input, f) for f in config["features"]}]
        )
        raw_prediction = float(model.predict(input_frame)[0])

        if not math.isfinite(raw_prediction):
            raise ValueError("Invalid model prediction")

    except Exception:
        logger.exception("Automatic prediction failed")
        raise HTTPException(
            status_code=500,
            detail="Prediction failed. Please try again.",
        )

    # 8. Scale to the registered plant, then limit to installed capacity
    raw_nonnegative = max(0.0, raw_prediction)
    capacity_factor = raw_nonnegative / training_capacity_kw
    scaled_prediction = capacity_factor * capacity_kw
    limited_prediction = min(scaled_prediction, capacity_kw)

    result = {
        "plant_id": plant_id,
        "plant_name": plant_name,
        "model_plant_code": model_plant_code,
        "plant_capacity_kw": round(capacity_kw, 2),
        # Raw output is at the TRAINING plant's scale. Do not read it as
        # this plant's power.
        "raw_model_prediction_kw": round(raw_prediction, 2),
        "training_plant_id": training_plant_id,
        "training_capacity_kw": training_capacity_kw,
        "capacity_factor": round(capacity_factor, 4),
        "scaled_prediction_kw": round(scaled_prediction, 2),
        "predicted_power_kw": round(limited_prediction, 2),
        # True when the scaled value had to be clipped to installed capacity.
        # Clipping is a safeguard, not calibration.
        "prediction_exceeds_capacity": scaled_prediction > capacity_kw,
        "scaling_note": (
            "Raw model output was converted to a capacity factor using the "
            "training plant's reference output and scaled to this plant's "
            "installed capacity. This is an approximation."
        ),
        "weather_source": weather["source"],
        "observed_at_local": weather["observed_at_local"],
        "timezone": weather["timezone"],
        "inputs_used": {
            "plant_code": {
                "value": model_plant_code,
                "source": (
                    "Mapped from registered plant ID"
                    if is_mapped_plant
                    else f"Defaulted to training plant {training_plant_id} baseline"
                ),
            },
            "AMBIENT_TEMPERATURE": {
                "value": ambient,
                "unit": "°C",
                "source": "Open-Meteo weather data",
            },
            "IRRADIATION": {
                "value": irradiation,
                "unit": "kW/m²",
                "source": "Open-Meteo shortwave radiation",
            },
            "MODULE_TEMPERATURE": {
                "value": round(module_temperature, 2),
                "unit": "°C",
                "source": "Estimated, not measured",
                "method": "1.026476 × ambient + 28.363679 × irradiation - 2.138474",
            },
            "hour_sin": {
                "value": round(hour_sin, 6),
                "source": "Calculated from local observation time",
            },
            "hour_cos": {
                "value": round(hour_cos, 6),
                "source": "Calculated from local observation time",
            },
        },
    }

    return result, local_time


@app.get("/plants/{plant_id}/predict/automatic")
def automatic_prediction(
    plant_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(authenticate_user),
):
    """Read-only preview. Does NOT save anything."""
    result, _local_time = _compute_automatic_prediction(plant_id, db)
    return result


@app.post("/plants/{plant_id}/predict/automatic", status_code=201)
def automatic_prediction_and_save(
    plant_id: str,
    response: Response,
    db: Session = Depends(get_db),
    _: str = Depends(authenticate_user),
):
    """Run the automatic prediction and save it as a forecast."""
    # Any failure inside the helper raises before anything is saved.
    result, local_time = _compute_automatic_prediction(plant_id, db)

    try:
        saved = create_forecast(
            ForecastCreate(
                plant_id=plant_id,
                forecast_timestamp=local_time.astimezone(timezone.utc),
                predicted_power_kw=result["predicted_power_kw"],
                source="ml_model",
                model_version=MODEL_VERSION,
            ),
            db,
        )
    except Exception:
        # A good prediction is not thrown away because saving failed.
        logger.exception("Could not save automatic forecast")
        db.rollback()
        response.status_code = 200
        return {
            **result,
            "forecast_saved": False,
            "forecast_id": None,
            "warning": "Prediction succeeded but the forecast could not be saved.",
        }

    return {
        **result,
        "forecast_saved": True,
        "forecast_id": saved.id,
        "model_version": saved.model_version,
    }


# --------------------------------------------------
# 10. Register CRUD routers (all require authentication)
# --------------------------------------------------

for _router in (
    plants_router,
    readings_router,
    forecasts_router,
    weather_router,
    alerts_router,
):
    app.include_router(_router, dependencies=[Depends(authenticate_user)])