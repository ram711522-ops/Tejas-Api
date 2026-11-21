
from pathlib import Path
import json
import joblib
import pandas as pd

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


# --------------------------------------------------
# 1. Load model and configuration
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR.parent / "models" / "solar_model.joblib"
CONFIG_PATH = BASE_DIR.parent / "models" / "model_config.json"

model = joblib.load(MODEL_PATH)

with open(CONFIG_PATH, "r") as file:
    config = json.load(file)


# --------------------------------------------------
# 2. Create FastAPI application
# --------------------------------------------------

app = FastAPI(
    title="TEJAS Solar Prediction API",
    description="Solar power prediction and deviation detection",
    version="1.0"
)


# --------------------------------------------------
# 3. Define input format
# --------------------------------------------------

class SolarInput(BaseModel):
    plant_code: int = Field(ge=0, le=1)
    AMBIENT_TEMPERATURE: float
    MODULE_TEMPERATURE: float
    IRRADIATION: float = Field(ge=0)
    hour_sin: float = Field(ge=-1, le=1)
    hour_cos: float = Field(ge=-1, le=1)
    actual_power: float | None = Field(default=None, ge=0)


# --------------------------------------------------
# 4. Home endpoint
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "message": "TEJAS Solar Prediction API is running"
    }


# --------------------------------------------------
# 5. Prediction endpoint
# --------------------------------------------------

@app.post("/predict")
def predict(data: SolarInput):

    try:
        input_data = pd.DataFrame([{
            feature: getattr(data, feature)
            for feature in config["features"]
        }])

        predicted_power = float(model.predict(input_data)[0])

        result = {
            "plant_code": data.plant_code,
            "predicted_power_kw": round(predicted_power, 2)
        }

        # --------------------------------------------------
        # 6. Optional deviation detection
        # --------------------------------------------------

        if data.actual_power is not None:

            plant_id = (
                str(config["plant_2_id"])
                if data.plant_code == 1
                else "4135001"
            )

            residual = data.actual_power - predicted_power

            threshold = config["deviation_thresholds_kw"][plant_id]
            center = config["residual_center_kw"][plant_id]

            daytime = (
                data.IRRADIATION > config["daytime_irradiation"]
            )

            threshold_deviation = (
                abs(residual - center) > threshold
            )

            relative_deviation = (
                predicted_power >= config["relative_rule"]["min_predicted_kw"]
                and data.actual_power
                < config["relative_rule"]["ratio"] * predicted_power
            )

            deviation = (
                daytime
                and (threshold_deviation or relative_deviation)
            )

            result.update({
                "actual_power_kw": data.actual_power,
                "residual_kw": round(residual, 2),
                "daytime": daytime,
                "deviation_detected": deviation
            })

        return result

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )
