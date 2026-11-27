import pandas as pd
import numpy as np

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# --------------------------------------------------
# 1. LOAD KAGGLE DATA
# --------------------------------------------------

kaggle = pd.read_csv("data/processed/solar_processed.csv")

# Convert DATE_TIME from text to datetime
kaggle["DATE_TIME"] = pd.to_datetime(kaggle["DATE_TIME"])

# Select Plant 1
kaggle = kaggle[kaggle["PLANT_ID"] == 4135001].copy()

# Plant 1 code used by our model
kaggle["plant_code"] = 0

# --------------------------------------------------
# 2. LOAD NASA DATA
# --------------------------------------------------

nasa = pd.read_csv("nasa_plant1.csv", skiprows=10)

# Create datetime
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

# NASA timestamps are UTC
# Convert to Indian Standard Time (+5:30)
nasa["DATE_TIME"] = (
    nasa["DATE_TIME"] + pd.Timedelta(hours=5, minutes=30)
)

# Rename NASA weather columns
nasa = nasa.rename(
    columns={
        "T2M": "NASA_AMBIENT",
        "ALLSKY_SFC_SW_DWN": "NASA_IRRADIATION"
    }
)

# Provisional radiation conversion
nasa["NASA_IRRADIATION"] = nasa["NASA_IRRADIATION"] / 1000


# --------------------------------------------------
# 3. PREPARE NASA DATA FOR 15-MINUTE MATCHING
# --------------------------------------------------

nasa = nasa.set_index("DATE_TIME")

nasa = nasa[
    ["NASA_AMBIENT", "NASA_IRRADIATION"]
].resample("15min").interpolate()

nasa = nasa.reset_index()


# --------------------------------------------------
# 4. MERGE KAGGLE AND NASA DATA
# --------------------------------------------------

data = pd.merge(
    kaggle,
    nasa,
    on="DATE_TIME",
    how="inner"
)

print("Matched records:", len(data))


# --------------------------------------------------
# 5. ESTIMATE MODULE TEMPERATURE FOR MODEL C
# --------------------------------------------------

data["NASA_MODULE"] = (
    1.026476 * data["NASA_AMBIENT"]
    + 28.363679 * data["NASA_IRRADIATION"]
    - 2.138474
)


# --------------------------------------------------
# 6. CHRONOLOGICAL TRAIN-TEST SPLIT
# --------------------------------------------------

data = data.sort_values("DATE_TIME")

split = int(len(data) * 0.8)

train = data.iloc[:split]
test = data.iloc[split:]

print("Training records:", len(train))
print("Testing records:", len(test))


# --------------------------------------------------
# 7. DEFINE FEATURES
# --------------------------------------------------

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
    "NASA_AMBIENT",
    "NASA_IRRADIATION",
    "hour_sin",
    "hour_cos"
]

features_nasa_module = [
    "plant_code",
    "NASA_AMBIENT",
    "NASA_MODULE",
    "NASA_IRRADIATION",
    "hour_sin",
    "hour_cos"
]


# --------------------------------------------------
# 8. TRAIN THREE RANDOM FOREST MODELS
# --------------------------------------------------

model_a = RandomForestRegressor(
    n_estimators=100,
    random_state=42,
    n_jobs=1
)

model_b = RandomForestRegressor(
    n_estimators=100,
    random_state=42,
    n_jobs=1
)

model_c = RandomForestRegressor(
    n_estimators=100,
    random_state=42,
    n_jobs=1
)


model_a.fit(
    train[features_kaggle],
    train["AC_POWER"]
)

model_b.fit(
    train[features_nasa],
    train["AC_POWER"]
)

model_c.fit(
    train[features_nasa_module],
    train["AC_POWER"]
)


# --------------------------------------------------
# 9. PREDICTIONS
# --------------------------------------------------

pred_a = model_a.predict(test[features_kaggle])
pred_b = model_b.predict(test[features_nasa])
pred_c = model_c.predict(test[features_nasa_module])


# --------------------------------------------------
# 10. ADD PREDICTIONS TO TEST DATA
# --------------------------------------------------

test = test.copy()

test["KAGGLE_PREDICTION"] = pred_a
test["NASA_PREDICTION"] = pred_b
test["NASA_MODULE_PREDICTION"] = pred_c


# --------------------------------------------------
# 11. CREATE IRRADIATION GROUPS
# --------------------------------------------------

def irradiation_category(value):

    if value <= 0.05:
        return "Low / Night"

    elif value <= 0.3:
        return "Moderate"

    elif value <= 0.6:
        return "High"

    else:
        return "Very High"


test["IRRADIATION_GROUP"] = test["IRRADIATION"].apply(
    irradiation_category
)


# --------------------------------------------------
# 12. EVALUATION FUNCTION
# --------------------------------------------------

def evaluate_model(actual, predicted):

    mae = mean_absolute_error(actual, predicted)

    rmse = np.sqrt(
        mean_squared_error(actual, predicted)
    )

    r2 = r2_score(actual, predicted)

    return mae, rmse, r2


# --------------------------------------------------
# 13. ANALYZE EACH IRRADIATION GROUP
# --------------------------------------------------

groups = [
    "Low / Night",
    "Moderate",
    "High",
    "Very High"
]

for group in groups:

    subset = test[
        test["IRRADIATION_GROUP"] == group
    ]

    if len(subset) == 0:
        continue

    print("\n" + "=" * 60)
    print("IRRADIATION GROUP:", group)
    print("=" * 60)

    actual = subset["AC_POWER"]

    print("Records:", len(subset))

    # Model A
    mae_a, rmse_a, r2_a = evaluate_model(
        actual,
        subset["KAGGLE_PREDICTION"]
    )

    # Model B
    mae_b, rmse_b, r2_b = evaluate_model(
        actual,
        subset["NASA_PREDICTION"]
    )

    # Model C
    mae_c, rmse_c, r2_c = evaluate_model(
        actual,
        subset["NASA_MODULE_PREDICTION"]
    )

    print("\nMODEL A - KAGGLE WEATHER")
    print("MAE:", mae_a)
    print("RMSE:", rmse_a)
    print("R2:", r2_a)

    print("\nMODEL B - NASA WEATHER")
    print("MAE:", mae_b)
    print("RMSE:", rmse_b)
    print("R2:", r2_b)

    print("\nMODEL C - NASA + ESTIMATED MODULE TEMP")
    print("MAE:", mae_c)
    print("RMSE:", rmse_c)
    print("R2:", r2_c)


print("\nIRRADIATION ANALYSIS COMPLETED")