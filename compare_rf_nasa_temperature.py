import pandas as pd
import numpy as np

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# =========================
# 1. LOAD KAGGLE DATA
# =========================

df = pd.read_csv("data/processed/solar_processed.csv")

df = df[df["PLANT_ID"] == 4135001].copy()

df["plant_code"] = 0
df["DATE_TIME"] = pd.to_datetime(df["DATE_TIME"])

df = df.sort_values("DATE_TIME")


# =========================
# 2. LOAD NASA DATA
# =========================

nasa = pd.read_csv("nasa_plant1.csv", skiprows=10)

nasa["DATE_TIME"] = pd.to_datetime(
    nasa[["YEAR", "MO", "DY", "HR"]]
    .rename(columns={
        "YEAR": "year",
        "MO": "month",
        "DY": "day",
        "HR": "hour"
    })
)

# Convert UTC to IST
nasa["DATE_TIME"] += pd.Timedelta(hours=5, minutes=30)

# NASA ambient temperature
nasa = nasa[[
    "DATE_TIME",
    "T2M"
]].rename(columns={
    "T2M": "NASA_AMBIENT_TEMPERATURE"
})

nasa = nasa.sort_values("DATE_TIME")

# Hourly NASA temperature -> 15-minute intervals
nasa = nasa.set_index("DATE_TIME")

nasa = nasa.resample("15min").interpolate(method="time")

nasa = nasa.reset_index()


# =========================
# 3. MATCH DATA
# =========================

df = pd.merge(
    df,
    nasa,
    on="DATE_TIME",
    how="inner"
)

df = df.sort_values("DATE_TIME")

print("Matched records:", len(df))


# =========================
# 4. TRAIN/TEST SPLIT
# =========================

split_index = int(len(df) * 0.8)

train = df.iloc[:split_index].copy()
test = df.iloc[split_index:].copy()

print("Training records:", len(train))
print("Testing records:", len(test))


# =========================
# 5. FEATURES
# =========================

kaggle_features = [
    "plant_code",
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "IRRADIATION",
    "hour_sin",
    "hour_cos"
]

nasa_temperature_features = [
    "plant_code",
    "NASA_AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "IRRADIATION",
    "hour_sin",
    "hour_cos"
]


# =========================
# 6. EVALUATION FUNCTION
# =========================

def evaluate(name, features):

    model = RandomForestRegressor(
        n_estimators=100,
        random_state=42,
        n_jobs=1
    )

    model.fit(
        train[features],
        train["AC_POWER"]
    )

    predictions = model.predict(
        test[features]
    )

    mae = mean_absolute_error(
        test["AC_POWER"],
        predictions
    )

    rmse = np.sqrt(
        mean_squared_error(
            test["AC_POWER"],
            predictions
        )
    )

    r2 = r2_score(
        test["AC_POWER"],
        predictions
    )

    print(f"\n===== {name} =====")
    print(f"MAE : {mae:.4f}")
    print(f"RMSE: {rmse:.4f}")
    print(f"R²  : {r2:.6f}")

    return mae, rmse, r2


# =========================
# 7. COMPARE MODELS
# =========================

kaggle_results = evaluate(
    "RF - KAGGLE TEMPERATURE",
    kaggle_features
)

nasa_results = evaluate(
    "RF - NASA AMBIENT TEMPERATURE",
    nasa_temperature_features
)


# =========================
# 8. FINAL COMPARISON
# =========================

print("\n===== FINAL COMPARISON =====")

print("\nKaggle Temperature:")
print(kaggle_results)

print("\nNASA Temperature:")
print(nasa_results)

print("\nNASA - Kaggle MAE difference:")
print(nasa_results[0] - kaggle_results[0])

print("\nNASA - Kaggle RMSE difference:")
print(nasa_results[1] - kaggle_results[1])

print("\nNASA - Kaggle R² difference:")
print(nasa_results[2] - kaggle_results[2])