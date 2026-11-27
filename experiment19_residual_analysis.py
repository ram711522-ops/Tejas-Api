import pandas as pd
import matplotlib.pyplot as plt

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# Load dataset
df = pd.read_csv("data/processed/solar_processed.csv")

# Select Plant 1
df = df[df["PLANT_ID"] == 4135001].copy()

# Sort chronologically
df = df.sort_values("DATE_TIME").reset_index(drop=True)

# Features and target
features = [
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "hour_sin",
    "hour_cos",
    "IRRADIATION"
]

target = "AC_POWER"

# Chronological 80-20 split
split = int(len(df) * 0.8)

train = df.iloc[:split]
test = df.iloc[split:].copy()

# Train model
model = RandomForestRegressor(
    n_estimators=100,
    random_state=42,
    n_jobs=1
)

model.fit(train[features], train[target])

# Predictions
test["Predicted_AC_POWER"] = model.predict(test[features])

# Calculate residuals
test["Residual"] = (
    test["AC_POWER"] - test["Predicted_AC_POWER"]
)

# Evaluation
mae = mean_absolute_error(
    test["AC_POWER"],
    test["Predicted_AC_POWER"]
)

rmse = mean_squared_error(
    test["AC_POWER"],
    test["Predicted_AC_POWER"]
) ** 0.5

r2 = r2_score(
    test["AC_POWER"],
    test["Predicted_AC_POWER"]
)

print("\n===== EXPERIMENT 19: RESIDUAL ANALYSIS =====")
print(f"MAE:  {mae:.4f}")
print(f"RMSE: {rmse:.4f}")
print(f"R2:   {r2:.4f}")

print("\nResidual Statistics:")
print(test["Residual"].describe())

# -----------------------------
# Plot 1: Actual vs Predicted
# -----------------------------
plt.figure(figsize=(8, 6))

plt.scatter(
    test["AC_POWER"],
    test["Predicted_AC_POWER"],
    alpha=0.5
)

plt.plot(
    [0, test["AC_POWER"].max()],
    [0, test["AC_POWER"].max()],
    "r--"
)

plt.xlabel("Actual AC Power")
plt.ylabel("Predicted AC Power")
plt.title("Actual vs Predicted Power - Plant 1")
plt.grid(True)

plt.show()

# -----------------------------
# Plot 2: Residual Distribution
# -----------------------------
plt.figure(figsize=(8, 6))

plt.hist(test["Residual"], bins=30)

plt.axvline(0, color="red", linestyle="--")

plt.xlabel("Residual (Actual - Predicted)")
plt.ylabel("Frequency")
plt.title("Residual Distribution - Plant 1")
plt.grid(True)

plt.show()

# -----------------------------
# Plot 3: Residual vs Predicted
# -----------------------------
plt.figure(figsize=(8, 6))

plt.scatter(
    test["Predicted_AC_POWER"],
    test["Residual"],
    alpha=0.5
)

plt.axhline(0, color="red", linestyle="--")

plt.xlabel("Predicted AC Power")
plt.ylabel("Residual")
plt.title("Residual vs Predicted Power - Plant 1")
plt.grid(True)

plt.show()