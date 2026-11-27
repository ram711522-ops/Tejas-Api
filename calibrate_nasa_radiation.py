import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# ==============================
# 1. LOAD KAGGLE DATA
# ==============================

df = pd.read_csv("data/processed/solar_processed.csv")

# Plant 1 only
df = df[df["PLANT_ID"] == 4135001].copy()

df["plant_code"] = 0

df["DATE_TIME"] = pd.to_datetime(df["DATE_TIME"])

df = df.sort_values("DATE_TIME")


# ==============================
# 2. LOAD NASA DATA
# ==============================

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

# NASA timestamps are UTC.
# Convert to Indian Standard Time (UTC + 5:30)
nasa["DATE_TIME"] = (
    nasa["DATE_TIME"] + pd.Timedelta(hours=5, minutes=30)
)

# Convert NASA radiation to our provisional scale
nasa["NASA_IRRADIATION"] = (
    nasa["ALLSKY_SFC_SW_DWN"] / 1000
)

nasa = nasa[["DATE_TIME", "NASA_IRRADIATION"]]

nasa = nasa.sort_values("DATE_TIME")

nasa = nasa.set_index("DATE_TIME")

# Interpolate hourly NASA radiation to 15-minute intervals
nasa = nasa.resample("15min").interpolate(method="time")

nasa = nasa.reset_index()


# ==============================
# 3. MATCH NASA AND KAGGLE
# ==============================

df = pd.merge(
    df,
    nasa,
    on="DATE_TIME",
    how="inner"
)

df = df.sort_values("DATE_TIME")

print("Matched records:", len(df))


# ==============================
# 4. CHRONOLOGICAL TRAIN/TEST SPLIT
# ==============================

split_index = int(len(df) * 0.8)

train = df.iloc[:split_index].copy()
test = df.iloc[split_index:].copy()

print("Training records:", len(train))
print("Testing records:", len(test))


# ==============================
# 5. CALIBRATE NASA RADIATION
# ==============================

calibrator = LinearRegression()

# Learn NASA -> Kaggle relationship ONLY on training data
calibrator.fit(
    train[["NASA_IRRADIATION"]],
    train[["IRRADIATION"]]
)

a = calibrator.coef_[0][0]
b = calibrator.intercept_[0]

print("\n===== CALIBRATION EQUATION =====")
print(f"Calibrated NASA = {a:.4f} * NASA + {b:.4f}")


# Apply calibration to train and test
train["NASA_CALIBRATED"] = calibrator.predict(
    train[["NASA_IRRADIATION"]]
)

test["NASA_CALIBRATED"] = calibrator.predict(
    test[["NASA_IRRADIATION"]]
)


# ==============================
# 6. RADIATION COMPARISON
# ==============================

print("\n===== TEST RADIATION COMPARISON =====")

print("\nRaw NASA radiation:")
print("MAE:",
      mean_absolute_error(
          test["IRRADIATION"],
          test["NASA_IRRADIATION"]
      ))

print("RMSE:",
      np.sqrt(mean_squared_error(
          test["IRRADIATION"],
          test["NASA_IRRADIATION"]
      )))

print("\nCalibrated NASA radiation:")
print("MAE:",
      mean_absolute_error(
          test["IRRADIATION"],
          test["NASA_CALIBRATED"]
      ))

print("RMSE:",
      np.sqrt(mean_squared_error(
          test["IRRADIATION"],
          test["NASA_CALIBRATED"]
      )))


# ==============================
# 7. RANDOM FOREST FEATURES
# ==============================

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
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "NASA_IRRADIATION",
    "hour_sin",
    "hour_cos"
]

features_calibrated = [
    "plant_code",
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "NASA_CALIBRATED",
    "hour_sin",
    "hour_cos"
]


# ==============================
# 8. TRAIN RANDOM FOREST MODELS
# ==============================

def evaluate_model(name, train_features, test_features):

    model = RandomForestRegressor(
        n_estimators=100,
        random_state=42,
        n_jobs=1
    )

    model.fit(
        train[train_features],
        train["AC_POWER"]
    )

    predictions = model.predict(
        test[test_features]
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
    print("MAE :", mae)
    print("RMSE:", rmse)
    print("R²  :", r2)

    return mae, rmse, r2


# ==============================
# 9. COMPARE THREE MODELS
# ==============================

kaggle_results = evaluate_model(
    "RF - KAGGLE RADIATION",
    features_kaggle,
    features_kaggle
)

raw_nasa_results = evaluate_model(
    "RF - RAW NASA RADIATION",
    features_nasa,
    features_nasa
)

calibrated_nasa_results = evaluate_model(
    "RF - CALIBRATED NASA RADIATION",
    features_calibrated,
    features_calibrated
)


# ==============================
# 10. FINAL SUMMARY
# ==============================

print("\n\n===== FINAL COMPARISON =====")

print("\nKaggle:")
print(kaggle_results)

print("\nRaw NASA:")
print(raw_nasa_results)

print("\nCalibrated NASA:")
print(calibrated_nasa_results)