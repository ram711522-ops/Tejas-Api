import pandas as pd
import matplotlib.pyplot as plt

from sklearn.ensemble import RandomForestRegressor


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
# 4. TRAIN-TEST SPLIT
# =========================

split = int(len(matched) * 0.8)

train = matched.iloc[:split]
test = matched.iloc[split:]

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

kaggle_features = base_features + [
    "IRRADIATION"
]

combined_features = base_features + [
    "IRRADIATION",
    "NASA_IRRADIATION"
]


# =========================
# 6. TRAIN KAGGLE MODEL
# =========================

model_kaggle = RandomForestRegressor(
    n_estimators=100,
    random_state=42,
    n_jobs=1
)

model_kaggle.fit(
    train[kaggle_features],
    train["AC_POWER"]
)


# =========================
# 7. TRAIN COMBINED MODEL
# =========================

model_combined = RandomForestRegressor(
    n_estimators=100,
    random_state=42,
    n_jobs=1
)

model_combined.fit(
    train[combined_features],
    train["AC_POWER"]
)


# =========================
# 8. FEATURE IMPORTANCE
# =========================

importance_kaggle = pd.DataFrame({
    "Feature": kaggle_features,
    "Importance": model_kaggle.feature_importances_
})

importance_combined = pd.DataFrame({
    "Feature": combined_features,
    "Importance": model_combined.feature_importances_
})


importance_kaggle = importance_kaggle.sort_values(
    "Importance",
    ascending=False
)

importance_combined = importance_combined.sort_values(
    "Importance",
    ascending=False
)


# =========================
# 9. DISPLAY RESULTS
# =========================

print("\n===== KAGGLE MODEL FEATURE IMPORTANCE =====")
print(importance_kaggle.round(4).to_string(index=False))

print("\n===== KAGGLE + NASA FEATURE IMPORTANCE =====")
print(importance_combined.round(4).to_string(index=False))


# =========================
# 10. PLOT KAGGLE MODEL
# =========================

plt.figure(figsize=(9, 5))

plt.barh(
    importance_kaggle["Feature"],
    importance_kaggle["Importance"]
)

plt.xlabel("Feature Importance")
plt.title("Random Forest Feature Importance - Kaggle Model")
plt.gca().invert_yaxis()

plt.tight_layout()
plt.show()


# =========================
# 11. PLOT COMBINED MODEL
# =========================

plt.figure(figsize=(9, 5))

plt.barh(
    importance_combined["Feature"],
    importance_combined["Importance"]
)

plt.xlabel("Feature Importance")
plt.title("Random Forest Feature Importance - Kaggle + NASA")
plt.gca().invert_yaxis()

plt.tight_layout()
plt.show()