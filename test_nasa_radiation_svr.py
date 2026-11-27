import pandas as pd
import numpy as np
import joblib
from sklearn.metrics import mean_absolute_error, mean_squared_error

# -----------------------------
# 1. LOAD DATA
# -----------------------------
data = pd.read_csv("data/processed/solar_processed.csv")
nasa = pd.read_csv("nasa_plant1.csv", skiprows=10)

# Plant 1
data = data[data["PLANT_ID"] == 4135001].copy()

data["DATE_TIME"] = pd.to_datetime(data["DATE_TIME"])
data = data.sort_values("DATE_TIME")

# -----------------------------
# 2. PREPARE NASA DATA
# -----------------------------
nasa["DATE_TIME"] = pd.to_datetime(
    nasa[["YEAR", "MO", "DY", "HR"]].rename(
        columns={"YEAR": "year", "MO": "month", "DY": "day", "HR": "hour"}
    )
)

# NASA time is UTC -> convert to India time (+5:30)
nasa["DATE_TIME"] = nasa["DATE_TIME"] + pd.Timedelta(hours=5, minutes=30)

# Convert radiation Wh/m² to provisional kWh/m² equivalent scaling
nasa["NASA_IRRADIATION"] = nasa["ALLSKY_SFC_SW_DWN"] / 1000

nasa = nasa[["DATE_TIME", "T2M", "NASA_IRRADIATION"]]
nasa = nasa.set_index("DATE_TIME").sort_index()

# Interpolate NASA hourly radiation to 15-minute timestamps
nasa_15min = nasa.resample("15min").interpolate(method="time")

# -----------------------------
# 3. MATCH DATA
# -----------------------------
data = data.set_index("DATE_TIME")

data = data.join(
    nasa_15min[["NASA_IRRADIATION"]],
    how="inner"
)

print("Matched records:", len(data))

# -----------------------------
# 4. LOAD EXISTING MODEL
# -----------------------------
model = joblib.load("models/solar_model.joblib")
# -----------------------------
# 5. PREPARE FEATURES
# -----------------------------

# Plant 1 is encoded as 0 in the trained model
features_kaggle = pd.DataFrame({
    "plant_code": 0,
    "AMBIENT_TEMPERATURE": data["AMBIENT_TEMPERATURE"],
    "MODULE_TEMPERATURE": data["MODULE_TEMPERATURE"],
    "IRRADIATION": data["IRRADIATION"],
    "hour_sin": data["hour_sin"],
    "hour_cos": data["hour_cos"],
})

# Copy baseline features
features_nasa_radiation = features_kaggle.copy()

# Replace only the radiation feature
features_nasa_radiation["IRRADIATION"] = data["NASA_IRRADIATION"]

print("\nMODEL FEATURES:")
print(features_kaggle.columns.tolist())
# -----------------------------
# 6. PREDICTIONS
# -----------------------------
prediction_kaggle = model.predict(features_kaggle)

prediction_nasa = model.predict(features_nasa_radiation)

actual = data["AC_POWER"]

# -----------------------------
# 7. EVALUATION
# -----------------------------
def evaluate(name, prediction):
    mae = mean_absolute_error(actual, prediction)
    rmse = np.sqrt(mean_squared_error(actual, prediction))

    print(f"\n{name}")
    print("MAE:", mae)
    print("RMSE:", rmse)
    print("Mean Prediction:", np.mean(prediction))


evaluate("BASELINE - KAGGLE INPUTS", prediction_kaggle)

evaluate("TEST B - KAGGLE TEMP + NASA RADIATION", prediction_nasa)

# -----------------------------
# 8. PREDICTION DIFFERENCE
# -----------------------------
difference = prediction_nasa - prediction_kaggle

print("\nPREDICTION SENSITIVITY")
print("Mean Difference:", np.mean(difference))
print("Mean Absolute Difference:", np.mean(np.abs(difference)))
print("Maximum Absolute Difference:", np.max(np.abs(difference)))

# -----------------------------
# 9. DAYTIME ANALYSIS
# -----------------------------
daytime = data["IRRADIATION"] > 0.05

print("\nDAYTIME RECORDS:", daytime.sum())

print("\nDAYTIME BASELINE MAE:",
      mean_absolute_error(actual[daytime], prediction_kaggle[daytime]))

print("DAYTIME NASA MAE:",
      mean_absolute_error(actual[daytime], prediction_nasa[daytime]))

print("\nDAYTIME BASELINE RMSE:",
      np.sqrt(mean_squared_error(actual[daytime], prediction_kaggle[daytime])))

print("DAYTIME NASA RMSE:",
      np.sqrt(mean_squared_error(actual[daytime], prediction_nasa[daytime])))