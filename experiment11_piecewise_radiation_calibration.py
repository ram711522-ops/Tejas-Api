import pandas as pd
import numpy as np

from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# =========================
# 1. LOAD KAGGLE DATA
# =========================

data = pd.read_csv("data/processed/solar_processed.csv")

data["DATE_TIME"] = pd.to_datetime(data["DATE_TIME"])
plant1 = data[data["PLANT_ID"] == 4135001].copy()
plant1 = plant1.sort_values("DATE_TIME")


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

# Convert NASA UTC to IST
nasa["DATE_TIME"] = (
    nasa["DATE_TIME"] + pd.Timedelta(hours=5, minutes=30)
)

nasa["NASA_IRRADIATION"] = (
    nasa["ALLSKY_SFC_SW_DWN"] / 1000
)

nasa = nasa[["DATE_TIME", "NASA_IRRADIATION"]]

# Convert NASA hourly data to 15-minute intervals
nasa = nasa.set_index("DATE_TIME")

nasa_15min = nasa.resample("15min").interpolate()

nasa_15min = nasa_15min.reset_index()


# =========================
# 3. MATCH DATA
# =========================

matched = pd.merge(
    plant1,
    nasa_15min,
    on="DATE_TIME",
    how="inner"
)

matched = matched.dropna()

print("Matched records:", len(matched))


# =========================
# 4. CHRONOLOGICAL SPLIT
# =========================

split = int(len(matched) * 0.8)

train = matched.iloc[:split].copy()
test = matched.iloc[split:].copy()

print("Train records:", len(train))
print("Test records:", len(test))


# =========================
# 5. PIECEWISE CALIBRATION
# =========================

# NASA irradiation ranges
bins = [0, 0.15, 0.35, 0.60, np.inf]

calibrated_train = train.copy()
calibrated_test = test.copy()

calibrated_train["NASA_CALIBRATED"] = np.nan
calibrated_test["NASA_CALIBRATED"] = np.nan


for i in range(len(bins) - 1):

    lower = bins[i]
    upper = bins[i + 1]

    # Select training records in this NASA radiation range
    train_group = train[
        (train["NASA_IRRADIATION"] >= lower) &
        (train["NASA_IRRADIATION"] < upper)
    ]

    test_group = test[
        (test["NASA_IRRADIATION"] >= lower) &
        (test["NASA_IRRADIATION"] < upper)
    ]

    if len(train_group) < 10:
        continue

    # Learn NASA -> Kaggle irradiation correction
    calibration_model = LinearRegression()

    calibration_model.fit(
        train_group[["NASA_IRRADIATION"]],
        train_group["IRRADIATION"]
    )

    # Apply correction to training data
    calibrated_train.loc[
        train_group.index, "NASA_CALIBRATED"
    ] = calibration_model.predict(
        train_group[["NASA_IRRADIATION"]]
    )

    # Apply same correction to test data
    calibrated_test.loc[
        test_group.index, "NASA_CALIBRATED"
    ] = calibration_model.predict(
        test_group[["NASA_IRRADIATION"]]
    )

    print(f"\nRange {lower} to {upper}")
    print("Training records:", len(train_group))
    print("Slope:", calibration_model.coef_[0])
    print("Intercept:", calibration_model.intercept_)


# Prevent physically invalid negative radiation
calibrated_train["NASA_CALIBRATED"] = (
    calibrated_train["NASA_CALIBRATED"].clip(lower=0)
)

calibrated_test["NASA_CALIBRATED"] = (
    calibrated_test["NASA_CALIBRATED"].clip(lower=0)
)


# =========================
# 6. CREATE FEATURES
# =========================

features = [
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "hour_sin",
    "hour_cos"
]

features_kaggle = features + ["IRRADIATION"]

features_nasa = features + ["NASA_IRRADIATION"]

features_calibrated = features + ["NASA_CALIBRATED"]


# =========================
# 7. TRAIN RANDOM FOREST
# =========================

def evaluate_model(X_train, X_test, y_train, y_test):

    model = RandomForestRegressor(
        n_estimators=100,
        random_state=42,
        n_jobs=1
    )

    model.fit(X_train, y_train)

    predictions = model.predict(X_test)

    mae = mean_absolute_error(y_test, predictions)

    rmse = np.sqrt(mean_squared_error(y_test, predictions))

    r2 = r2_score(y_test, predictions)

    return mae, rmse, r2


y_train = train["AC_POWER"]
y_test = test["AC_POWER"]


# Kaggle baseline
kaggle_results = evaluate_model(
    train[features_kaggle],
    test[features_kaggle],
    y_train,
    y_test
)


# Raw NASA radiation
nasa_results = evaluate_model(
    train[features_nasa],
    test[features_nasa],
    y_train,
    y_test
)


# Piecewise-calibrated NASA radiation
calibrated_results = evaluate_model(
    calibrated_train[features_calibrated],
    calibrated_test[features_calibrated],
    y_train,
    y_test
)


# =========================
# 8. PRINT RESULTS
# =========================

results = pd.DataFrame(
    {
        "Model": [
            "Kaggle Radiation",
            "Raw NASA Radiation",
            "Piecewise Calibrated NASA"
        ],
        "MAE": [
            kaggle_results[0],
            nasa_results[0],
            calibrated_results[0]
        ],
        "RMSE": [
            kaggle_results[1],
            nasa_results[1],
            calibrated_results[1]
        ],
        "R2": [
            kaggle_results[2],
            nasa_results[2],
            calibrated_results[2]
        ]
    }
)

print("\n========== EXPERIMENT 11 RESULTS ==========")

print(results.round(4).to_string(index=False))