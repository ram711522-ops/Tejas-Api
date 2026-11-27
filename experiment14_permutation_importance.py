
import pandas as pd

from sklearn.ensemble import RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error


# =========================
# 1. LOAD DATA
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

# Convert UTC to IST
nasa["DATE_TIME"] = (
    nasa["DATE_TIME"] + pd.Timedelta(hours=5, minutes=30)
)

# Provisional radiation scaling
nasa["NASA_IRRADIATION"] = (
    nasa["ALLSKY_SFC_SW_DWN"] / 1000
)

nasa = nasa[["DATE_TIME", "NASA_IRRADIATION"]]

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

train = matched.iloc[:split]
test = matched.iloc[split:]

print("Training records:", len(train))
print("Testing records:", len(test))


# =========================
# 5. FEATURES
# =========================

features = [
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "hour_sin",
    "hour_cos",
    "IRRADIATION"
]

X_train = train[features]
X_test = test[features]

y_train = train["AC_POWER"]
y_test = test["AC_POWER"]


# =========================
# 6. TRAIN MODEL
# =========================

model = RandomForestRegressor(
    n_estimators=100,
    random_state=42,
    n_jobs=1
)

model.fit(X_train, y_train)


# =========================
# 7. BASELINE TEST PERFORMANCE
# =========================

baseline_predictions = model.predict(X_test)

baseline_mae = mean_absolute_error(
    y_test,
    baseline_predictions
)

print("\nBaseline Test MAE:", baseline_mae)


# =========================
# 8. PERMUTATION IMPORTANCE
# =========================

importance = permutation_importance(
    model,
    X_test,
    y_test,
    scoring="neg_mean_absolute_error",
    n_repeats=10,
    random_state=42,
    n_jobs=1
)


# =========================
# 9. DISPLAY RESULTS
# =========================

results = pd.DataFrame({
    "Feature": features,
    "MAE Increase": importance.importances_mean,
    "Std": importance.importances_std
})

results = results.sort_values(
    "MAE Increase",
    ascending=False
)

print("\n===== EXPERIMENT 14: PERMUTATION IMPORTANCE =====")

print(results.round(4).to_string(index=False))


# =========================
# 10. PLOT RESULTS
# =========================

import matplotlib.pyplot as plt

plt.figure(figsize=(9, 5))

plt.barh(
    results["Feature"],
    results["MAE Increase"]
)

plt.xlabel("Increase in MAE after shuffling")
plt.title("Permutation Feature Importance - Test Set")

plt.gca().invert_yaxis()

plt.tight_layout()
plt.show()
