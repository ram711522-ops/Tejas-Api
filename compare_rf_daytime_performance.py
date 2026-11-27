import pandas as pd
import numpy as np

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# =========================
# 1. LOAD KAGGLE DATA
# =========================

data = pd.read_csv("data/processed/solar_processed.csv")

data = data[data["PLANT_ID"] == 4135001].copy()

# Create plant_code manually
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

# Convert UTC to Indian Standard Time
nasa["DATE_TIME"] = nasa["DATE_TIME"] + pd.Timedelta(hours=5, minutes=30)

nasa = nasa[["DATE_TIME", "T2M"]]
nasa = nasa.rename(columns={"T2M": "NASA_AMBIENT_TEMPERATURE"})

# Convert hourly NASA data to 15-minute intervals
nasa = nasa.set_index("DATE_TIME")

nasa = nasa.resample("15min").interpolate(method="time")

nasa = nasa.reset_index()


# =========================
# 3. MERGE DATA
# =========================

data = pd.merge(data, nasa, on="DATE_TIME", how="inner")

data = data.sort_values("DATE_TIME").reset_index(drop=True)

print("Matched records:", len(data))


# =========================
# 4. FEATURES
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
    "MODULE_TEMPERATURE",
    "IRRADIATION",
    "hour_sin",
    "hour_cos"
]

features_both = [
    "plant_code",
    "AMBIENT_TEMPERATURE",
    "NASA_AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "IRRADIATION",
    "hour_sin",
    "hour_cos"
]

target = "AC_POWER"


# =========================
# 5. TRAIN-TEST SPLIT
# =========================

split_index = int(len(data) * 0.8)

train = data.iloc[:split_index]
test = data.iloc[split_index:]

print("Training records:", len(train))
print("Testing records:", len(test))


# =========================
# 6. EVALUATION FUNCTION
# =========================

def evaluate_model(features, model_name):

    model = RandomForestRegressor(
        n_estimators=100,
        random_state=42,
        n_jobs=1
    )

    model.fit(train[features], train[target])

    predictions = model.predict(test[features])

    # Daytime and low-irradiation masks
    daytime_mask = test["IRRADIATION"] > 0.05
    low_irradiation_mask = test["IRRADIATION"] <= 0.05

    print("\n==============================")
    print(model_name)
    print("==============================")

    # DAYTIME
    y_day = test.loc[daytime_mask, target]
    pred_day = predictions[daytime_mask]

    print("\n--- DAYTIME ---")
    print("Records:", len(y_day))
    print("MAE:", mean_absolute_error(y_day, pred_day))
    print("RMSE:", np.sqrt(mean_squared_error(y_day, pred_day)))
    print("R²:", r2_score(y_day, pred_day))

    # LOW IRRADIATION
    y_low = test.loc[low_irradiation_mask, target]
    pred_low = predictions[low_irradiation_mask]

    print("\n--- LOW IRRADIATION ---")
    print("Records:", len(y_low))
    print("MAE:", mean_absolute_error(y_low, pred_low))
    print("RMSE:", np.sqrt(mean_squared_error(y_low, pred_low)))
    print("R²:", r2_score(y_low, pred_low))


# =========================
# 7. RUN ALL EXPERIMENTS
# =========================

evaluate_model(features_kaggle, "KAGGLE TEMPERATURE")
evaluate_model(features_nasa, "NASA TEMPERATURE")
evaluate_model(features_both, "BOTH TEMPERATURE SOURCES")