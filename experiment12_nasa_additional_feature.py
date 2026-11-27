
import pandas as pd
import numpy as np

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

# Convert NASA UTC timestamps to IST
nasa["DATE_TIME"] = (
    nasa["DATE_TIME"] + pd.Timedelta(hours=5, minutes=30)
)

# Radiation scaling is provisional
nasa["NASA_IRRADIATION"] = (
    nasa["ALLSKY_SFC_SW_DWN"] / 1000
)

nasa = nasa[["DATE_TIME", "NASA_IRRADIATION"]]

# Interpolate NASA hourly data to 15-minute intervals
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
matched = matched.sort_values("DATE_TIME")

print("Matched records:", len(matched))


# =========================
# 4. CHRONOLOGICAL SPLIT
# =========================

split = int(len(matched) * 0.8)

train = matched.iloc[:split].copy()
test = matched.iloc[split:].copy()

print("Training records:", len(train))
print("Testing records:", len(test))


# =========================
# 5. FEATURES
# =========================

base_features = [
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "hour_sin",
    "hour_cos"
]

# Model A: Kaggle radiation
features_kaggle = base_features + [
    "IRRADIATION"
]

# Model B: Kaggle + NASA radiation
features_both = base_features + [
    "IRRADIATION",
    "NASA_IRRADIATION"
]


# =========================
# 6. MODEL EVALUATION
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

    rmse = np.sqrt(
        mean_squared_error(y_test, predictions)
    )

    r2 = r2_score(y_test, predictions)

    return mae, rmse, r2


y_train = train["AC_POWER"]
y_test = test["AC_POWER"]


# =========================
# 7. RUN BOTH MODELS
# =========================

kaggle_results = evaluate_model(
    train[features_kaggle],
    test[features_kaggle],
    y_train,
    y_test
)

both_results = evaluate_model(
    train[features_both],
    test[features_both],
    y_train,
    y_test
)


# =========================
# 8. DISPLAY RESULTS
# =========================

results = pd.DataFrame({
    "Model": [
        "Kaggle Radiation Only",
        "Kaggle + NASA Radiation"
    ],
    "MAE": [
        kaggle_results[0],
        both_results[0]
    ],
    "RMSE": [
        kaggle_results[1],
        both_results[1]
    ],
    "R2": [
        kaggle_results[2],
        both_results[2]
    ]
})

print("\n========== EXPERIMENT 12 RESULTS ==========")
print(results.round(4).to_string(index=False))
