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

# UTC -> IST
nasa["DATE_TIME"] += pd.Timedelta(hours=5, minutes=30)

# Candidate offset: +30 minutes
nasa["DATE_TIME"] += pd.Timedelta(minutes=30)

nasa["NASA_IRRADIATION"] = (
    nasa["ALLSKY_SFC_SW_DWN"] / 1000
)

nasa = nasa[[
    "DATE_TIME",
    "NASA_IRRADIATION"
]]

nasa = nasa.sort_values("DATE_TIME")

nasa = nasa.set_index("DATE_TIME")

# Interpolate to 15-minute data
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
# 4. TRAIN / TEST SPLIT
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

nasa_features = [
    "plant_code",
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "NASA_IRRADIATION",
    "hour_sin",
    "hour_cos"
]


# =========================
# 6. MODEL EVALUATION
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
    "RF - KAGGLE RADIATION",
    kaggle_features
)

nasa_0_results = evaluate(
    "RF - NASA RADIATION (+30 MIN ALIGNMENT)",
    nasa_features
)


# =========================
# 8. SUMMARY
# =========================

print("\n===== FINAL COMPARISON =====")

print("\nKaggle Radiation:")
print(kaggle_results)

print("\nNASA Radiation (+30 min):")
print(nasa_0_results)

print("\nNASA MAE difference:")
print(nasa_0_results[0] - kaggle_results[0])

print("\nNASA RMSE difference:")
print(nasa_0_results[1] - kaggle_results[1])

print("\nNASA R² difference:")
print(nasa_0_results[2] - kaggle_results[2])