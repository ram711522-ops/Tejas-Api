import pandas as pd
import numpy as np
import joblib
import json
from sklearn.metrics import mean_absolute_error, mean_squared_error

# Load the existing model and configuration
model = joblib.load("models/solar_model.joblib")

with open("models/model_config.json", "r") as f:
    config = json.load(f)

features = config["features"]

# Load already-processed historical dataset
data = pd.read_csv("data/processed/solar_processed.csv")
data["DATE_TIME"] = pd.to_datetime(
    data["DATE_TIME"],
    format="%Y-%m-%d %H:%M:%S"
)

def estimate_module(ambient, irradiation):
    return (
        1.026476 * ambient
        + 28.363679 * irradiation
        - 2.138474
    )

def test_plant(plant_id, openmeteo_path):
    plant = data[data["PLANT_ID"] == plant_id].copy()

    open_weather = pd.read_csv(openmeteo_path, skiprows=2)
    open_weather["time"] = pd.to_datetime(open_weather["time"])
    open_weather["hour"] = open_weather["time"]

    plant["hour"] = plant["DATE_TIME"].dt.floor("h")

    plant = pd.merge(
        plant,
        open_weather[
            ["hour", "temperature_2m (°C)",
             "shortwave_radiation (W/m²)"]
        ],
        on="hour",
        how="inner"
    )

    print("\nPLANT:", plant_id)
    print("Matched records:", len(plant))

    plant_code = 0 if plant_id == 4135001 else 1

    baseline = pd.DataFrame({
        "plant_code": plant_code,
        "AMBIENT_TEMPERATURE": plant["AMBIENT_TEMPERATURE"],
        "MODULE_TEMPERATURE": plant["MODULE_TEMPERATURE"],
        "IRRADIATION": plant["IRRADIATION"]
    })

    open_ambient = plant["temperature_2m (°C)"]
    open_irradiation = (
        plant["shortwave_radiation (W/m²)"] / 1000
    )

    open_module = estimate_module(
        open_ambient,
        open_irradiation
    )

    alternative = pd.DataFrame({
        "plant_code": plant_code,
        "AMBIENT_TEMPERATURE": open_ambient,
        "MODULE_TEMPERATURE": open_module,
        "IRRADIATION": open_irradiation
    })

    minutes = (
        plant["DATE_TIME"].dt.hour * 60
        + plant["DATE_TIME"].dt.minute
    )

    for frame in [baseline, alternative]:
        frame["hour_sin"] = np.sin(
            2 * np.pi * minutes / 1440
        ).to_numpy()

        frame["hour_cos"] = np.cos(
            2 * np.pi * minutes / 1440
        ).to_numpy()

    baseline = baseline[features]
    alternative = alternative[features]

    baseline_prediction = model.predict(baseline)
    open_prediction = model.predict(alternative)

    actual = plant["AC_POWER"].to_numpy()

    for name, prediction in [
        ("KAGGLE INPUTS", baseline_prediction),
        ("OPEN-METEO INPUTS", open_prediction)
    ]:
        print("\n", name)
        print(
            "MAE:",
            mean_absolute_error(actual, prediction)
        )
        print(
            "RMSE:",
            np.sqrt(mean_squared_error(actual, prediction))
        )
        print("Mean predicted power:", np.mean(prediction))
        print("Mean actual power:", np.mean(actual))

    difference = open_prediction - baseline_prediction

    print("\nPREDICTION DIFFERENCE")
    print("Mean difference:", np.mean(difference))
    print("Mean absolute difference:", np.mean(np.abs(difference)))
    print("Maximum absolute difference:", np.max(np.abs(difference)))

    daytime = plant["IRRADIATION"].to_numpy() > 0.05

    if daytime.any():
        print(
            "Daytime mean absolute difference:",
            np.mean(np.abs(difference[daytime]))
        )


# Plant 1
test_plant(
    4135001,
    r"C:\Users\Rama\Downloads\open-meteo-14.80N78.18E203m.csv"
)

# Plant 2
test_plant(
    4136001,
    "openmeteo_plant2.csv"
)