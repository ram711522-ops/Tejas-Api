import pandas as pd
import numpy as np

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# --------------------------------------------------
# 1. Load Kaggle data
# --------------------------------------------------
kaggle = pd.read_csv("data/processed/solar_processed.csv")

kaggle["DATE_TIME"] = pd.to_datetime(kaggle["DATE_TIME"])

# Plant 1 only (NASA data we have is for Plant 1)
kaggle = kaggle[kaggle["PLANT_ID"] == 4135001].copy()
# Convert plant ID into model code
kaggle["plant_code"] = 0
# --------------------------------------------------
# 2. Load NASA data
# --------------------------------------------------
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

# NASA timestamps are UTC.
# Convert to India time (UTC + 5 hours 30 minutes)
nasa["DATE_TIME"] = nasa["DATE_TIME"] + pd.Timedelta(hours=5, minutes=30)

# NASA radiation: Wh/m² -> provisional scaling to match Kaggle units
nasa["NASA_IRRADIATION"] = nasa["ALLSKY_SFC_SW_DWN"] / 1000

nasa = nasa[["DATE_TIME", "T2M", "NASA_IRRADIATION"]]
nasa = nasa.set_index("DATE_TIME").sort_index()

# --------------------------------------------------
# 3. Interpolate NASA hourly data to Kaggle timestamps
# --------------------------------------------------
all_times = nasa.index.union(kaggle["DATE_TIME"])

nasa = nasa.reindex(all_times)
nasa = nasa.interpolate(method="time")

nasa = nasa.reset_index()
nasa = nasa.rename(columns={"index": "DATE_TIME"})

# --------------------------------------------------
# 4. Merge datasets
# --------------------------------------------------
df = pd.merge(
    kaggle,
    nasa,
    on="DATE_TIME",
    how="inner"
)

print("Matched records:", len(df))

# --------------------------------------------------
# 5. Features
# --------------------------------------------------
features = [
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

target = "AC_POWER"

# --------------------------------------------------
# 6. Prepare baseline and NASA datasets
# --------------------------------------------------
X_kaggle = df[features]
X_nasa = df[nasa_features].copy()

# Rename NASA radiation column to keep feature names consistent
X_nasa = X_nasa.rename(
    columns={"NASA_IRRADIATION": "IRRADIATION"}
)

y = df[target]

# --------------------------------------------------
# 7. Same chronological 80/20 split
# --------------------------------------------------
split = int(len(df) * 0.8)

X_train_kaggle = X_kaggle.iloc[:split]
X_test_kaggle = X_kaggle.iloc[split:]

X_train_nasa = X_nasa.iloc[:split]
X_test_nasa = X_nasa.iloc[split:]

y_train = y.iloc[:split]
y_test = y.iloc[split:]

# --------------------------------------------------
# 8. Train both Random Forest models
# --------------------------------------------------
model_kaggle = RandomForestRegressor(
    n_estimators=100,
    random_state=42,
    n_jobs=1
)

model_nasa = RandomForestRegressor(
    n_estimators=100,
    random_state=42,
    n_jobs=-1
)

model_kaggle.fit(X_train_kaggle, y_train)
model_nasa.fit(X_train_nasa, y_train)

# --------------------------------------------------
# 9. Predictions
# --------------------------------------------------
pred_kaggle = model_kaggle.predict(X_test_kaggle)
pred_nasa = model_nasa.predict(X_test_nasa)

# --------------------------------------------------
# 10. Evaluation function
# --------------------------------------------------
def evaluate(name, actual, predicted):

    mae = mean_absolute_error(actual, predicted)
    rmse = np.sqrt(mean_squared_error(actual, predicted))
    r2 = r2_score(actual, predicted)

    print(f"\n===== {name} =====")
    print("MAE :", mae)
    print("RMSE:", rmse)
    print("R²  :", r2)

    return mae, rmse, r2

# --------------------------------------------------
# 11. Compare results
# --------------------------------------------------
results_kaggle = evaluate(
    "RANDOM FOREST - KAGGLE WEATHER",
    y_test,
    pred_kaggle
)

results_nasa = evaluate(
    "RANDOM FOREST - NASA RADIATION",
    y_test,
    pred_nasa
)

# --------------------------------------------------
# 12. Difference
# --------------------------------------------------
print("\n===== COMPARISON =====")

print("MAE difference (NASA - Kaggle):",
      results_nasa[0] - results_kaggle[0])

print("RMSE difference (NASA - Kaggle):",
      results_nasa[1] - results_kaggle[1])

print("R² difference (NASA - Kaggle):",
      results_nasa[2] - results_kaggle[2])
# --------------------------------------------------
# 13. Daytime vs low-irradiation comparison
# --------------------------------------------------

test_irradiation = df["IRRADIATION"].iloc[split:].values

day_mask = test_irradiation > 0.05
low_mask = test_irradiation <= 0.05

def compare_period(period_name, mask):

    print(f"\n===== {period_name} =====")
    print("Records:", mask.sum())

    if mask.sum() == 0:
        return

    actual = y_test.values[mask]

    # Kaggle model
    kaggle_pred = pred_kaggle[mask]

    # NASA model
    nasa_pred = pred_nasa[mask]

    print("\nKAGGLE RADIATION")
    print("MAE :", mean_absolute_error(actual, kaggle_pred))
    print("RMSE:", np.sqrt(mean_squared_error(actual, kaggle_pred)))
    print("R²  :", r2_score(actual, kaggle_pred))

    print("\nNASA RADIATION")
    print("MAE :", mean_absolute_error(actual, nasa_pred))
    print("RMSE:", np.sqrt(mean_squared_error(actual, nasa_pred)))
    print("R²  :", r2_score(actual, nasa_pred))


compare_period("DAYTIME (IRRADIATION > 0.05)", day_mask)
compare_period("LOW IRRADIATION / NIGHT (<= 0.05)", low_mask)