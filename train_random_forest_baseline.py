import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# 1. Load dataset
df = pd.read_csv("data/processed/solar_processed.csv")

# 2. Convert timestamp
df["DATE_TIME"] = pd.to_datetime(df["DATE_TIME"])

# 3. Convert plant IDs into model codes
df["plant_code"] = df["PLANT_ID"].map({
    4135001: 0,
    4136001: 1
})

# 4. Select features
features = [
    "plant_code",
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "IRRADIATION",
    "hour_sin",
    "hour_cos"
]

target = "AC_POWER"

# 5. Remove missing values
df = df.dropna(subset=features + [target])

# 6. Sort chronologically
df = df.sort_values("DATE_TIME")

X = df[features]
y = df[target]

# 7. Split into training and testing data (80/20)
split = int(len(df) * 0.8)

X_train = X.iloc[:split]
X_test = X.iloc[split:]

y_train = y.iloc[:split]
y_test = y.iloc[split:]

# 8. Train Random Forest
model = RandomForestRegressor(
    n_estimators=100,
    random_state=42,
    n_jobs=-1
)

model.fit(X_train, y_train)

# 9. Make predictions
y_pred = model.predict(X_test)

# 10. Evaluate model
mae = mean_absolute_error(y_test, y_pred)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
r2 = r2_score(y_test, y_pred)

print("\n===== RANDOM FOREST BASELINE =====")
print("MAE :", mae)
print("RMSE:", rmse)
print("R²  :", r2)

# 11. Actual vs Predicted graph
plt.figure(figsize=(8, 6))

plt.scatter(y_test, y_pred, alpha=0.5)

plt.xlabel("Actual AC Power")
plt.ylabel("Predicted AC Power")
plt.title("Random Forest: Actual vs Predicted")

plt.grid(True)
plt.show()

# 12. Feature importance
importance = pd.Series(
    model.feature_importances_,
    index=features
).sort_values(ascending=True)

importance.plot(kind="barh", figsize=(8, 5))

plt.title("Random Forest Feature Importance")
plt.xlabel("Importance")
plt.tight_layout()
plt.show()