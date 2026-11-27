import pandas as pd
import numpy as np

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# =========================
# 1. LOAD KAGGLE DATA
# =========================

data = pd.read_csv("data/processed/solar_processed.csv")

# Use Plant 1 only
data = data[data["PLANT_ID"] == 4135001].copy()

# Plant 1 encoding used by our model
data["plant_code"] = 0

data["DATE_TIME"] = pd.to_datetime(data["DATE_TIME"])


# =========================
# 2. LOAD NASA DATA
# =========================

nasa = pd.read_csv("nasa_plant1.csv", skiprows=10)

nasa["DATE_TIME"] = pd.to_datetime(
    nasa[["YEAR", "MO", "DY", "HR"]].rename(
        columns={
            "YEAR": "year",
            "MO": "month",
            "DY": "day",
            "HR": "hour"
        }
    )
)

# Convert UTC to IST
nasa["DATE_TIME"] = nasa["DATE_TIME"] + pd.Timedelta(
    hours=5, minutes=30
)

# NASA radiation converted provisionally
nasa["NASA_IRRADIATION"] = nasa["ALLSKY_SFC_SW_DWN"] / 1000

# Keep NASA weather features
nasa = nasa[
    ["DATE_TIME", "T2M", "NASA_IRRADIATION"]
]

nasa = nasa.rename(
    columns={"T2M": "NASA_AMBIENT_TEMPERATURE"}
)


# =========================
# 3. RESAMPLE NASA TO 15 MIN
# =========================

nasa = nasa.set_index("DATE_TIME")

nasa = nasa.resample("15min").interpolate(method="time")

nasa = nasa.reset_index()


# =========================
# 4. MERGE DATA
# =========================

data = pd.merge(
    data,
    nasa,
    on="DATE_TIME",
    how="inner"
)

data = data.sort_values("DATE_TIME").reset_index(drop=True)

print("Matched records:", len(data))


# =========================
# 5. ESTIMATE MODULE TEMP
# =========================

data["ESTIMATED_MODULE_TEMPERATURE"] = (
    1.026476 * data["NASA_AMBIENT_TEMPERATURE"]
    + 28.363679 * data["NASA_IRRADIATION"]
    - 2.138474
)


# =========================
# 6. DEFINE FEATURES
# =========================

features_kaggle = [
    "plant_code",
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "IRRADIATION",
    "hour_sin",
    "hour_cos"
]

features_nasa = [
    "plant_code",
    "NASA_AMBIENT_TEMPERATURE",
    "NASA_IRRADIATION",
    "hour_sin",
    "hour_cos"
]

features_nasa_estimated_module = [
    "plant_code",
    "NASA_AMBIENT_TEMPERATURE",
    "NASA_IRRADIATION",
    "ESTIMATED_MODULE_TEMPERATURE",
    "hour_sin",
    "hour_cos"
]

target = "AC_POWER"


# =========================
# 7. CHRONOLOGICAL SPLIT
# =========================

split_index = int(len(data) * 0.8)

train = data.iloc[:split_index]
test = data.iloc[split_index:]

print("Training records:", len(train))
print("Testing records:", len(test))


# =========================
# 8. MODEL EVALUATION
# =========================

def evaluate_model(features, model_name):

    model = RandomForestRegressor(
        n_estimators=100,
        random_state=42,
        n_jobs=1
    )

    model.fit(train[features], train[target])

    predictions = model.predict(test[features])

    mae = mean_absolute_error(test[target], predictions)
    rmse = np.sqrt(mean_squared_error(test[target], predictions))
    r2 = r2_score(test[target], predictions)

    print("\n==============================")
    print(model_name)
    print("==============================")

    print("MAE :", mae)
    print("RMSE:", rmse)
    print("R²  :", r2)

    return mae, rmse, r2


# =========================
# 9. RUN MODELS
# =========================

results_kaggle = evaluate_model(
    features_kaggle,
    "MODEL A - KAGGLE WEATHER"
)

results_nasa = evaluate_model(
    features_nasa,
    "MODEL B - NASA WEATHER ONLY"
)

results_nasa_module = evaluate_model(
    features_nasa_estimated_module,
    "MODEL C - NASA + ESTIMATED MODULE TEMPERATURE"
)


# =========================
# 10. FINAL COMPARISON
# =========================

print("\n\n===== FINAL COMPARISON =====")

print("\nKaggle benchmark:")
print(results_kaggle)

print("\nNASA weather only:")
print(results_nasa)

print("\nNASA + estimated module temperature:")
print(results_nasa_module)