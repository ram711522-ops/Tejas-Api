import pandas as pd

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# Load dataset
df = pd.read_csv("data/processed/solar_processed.csv")

# Select Plant 2
df = df[df["PLANT_ID"] == 4136001].copy()

# Sort chronologically
df = df.sort_values("DATE_TIME").reset_index(drop=True)

# Features
baseline_features = [
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "hour_sin",
    "hour_cos",
    "IRRADIATION"
]

reduced_features = [
    "MODULE_TEMPERATURE",
    "hour_sin",
    "hour_cos",
    "IRRADIATION"
]

target = "AC_POWER"

# Train-test split
split = int(len(df) * 0.8)

train = df.iloc[:split]
test = df.iloc[split:]

# Train models
models = {
    "Baseline": baseline_features,
    "Without Ambient Temperature": reduced_features
}

trained_models = {}

for name, features in models.items():

    model = RandomForestRegressor(
        n_estimators=100,
        random_state=42,
        n_jobs=1
    )

    model.fit(train[features], train[target])

    trained_models[name] = model

# Operating conditions
daytime = test[test["IRRADIATION"] > 0.05]
nighttime = test[test["IRRADIATION"] <= 0.05]

conditions = {
    "Overall": test,
    "Daytime": daytime,
    "Nighttime / Low Irradiance": nighttime
}

results = []

# Evaluate models
for model_name, features in models.items():

    model = trained_models[model_name]

    for condition_name, subset in conditions.items():

        predictions = model.predict(subset[features])

        mae = mean_absolute_error(subset[target], predictions)

        rmse = mean_squared_error(
            subset[target],
            predictions
        ) ** 0.5

        r2 = r2_score(subset[target], predictions)

        results.append({
            "Model": model_name,
            "Condition": condition_name,
            "Samples": len(subset),
            "MAE": mae,
            "RMSE": rmse,
            "R2": r2
        })

# Display results
results_df = pd.DataFrame(results)

print("\n===== EXPERIMENT 17: PLANT 2 VALIDATION =====")
print(results_df.round(4).to_string(index=False))