import pandas as pd

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# Load dataset
df = pd.read_csv("data/processed/solar_processed.csv")

# Features
features = [
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "hour_sin",
    "hour_cos",
    "IRRADIATION"
]

target = "AC_POWER"

plants = {
    "Plant 1": 4135001,
    "Plant 2": 4136001
}

results = []

# Evaluate each plant
for plant_name, plant_id in plants.items():

    plant_df = df[df["PLANT_ID"] == plant_id].copy()

    # Sort chronologically
    plant_df = plant_df.sort_values("DATE_TIME").reset_index(drop=True)

    # Train-test split
    split = int(len(plant_df) * 0.8)

    train = plant_df.iloc[:split]
    test = plant_df.iloc[split:]

    # Train model
    model = RandomForestRegressor(
        n_estimators=100,
        random_state=42,
        n_jobs=1
    )

    model.fit(train[features], train[target])

    # Operating conditions
    daytime = test[test["IRRADIATION"] > 0.05]
    nighttime = test[test["IRRADIATION"] <= 0.05]

    conditions = {
        "Overall": test,
        "Daytime": daytime,
        "Nighttime / Low Irradiance": nighttime
    }

    # Evaluate
    for condition_name, subset in conditions.items():

        predictions = model.predict(subset[features])

        mae = mean_absolute_error(subset[target], predictions)

        rmse = mean_squared_error(
            subset[target],
            predictions
        ) ** 0.5

        r2 = r2_score(subset[target], predictions)

        results.append({
            "Plant": plant_name,
            "Plant ID": plant_id,
            "Condition": condition_name,
            "Samples": len(subset),
            "MAE": mae,
            "RMSE": rmse,
            "R2": r2
        })

# Results table
results_df = pd.DataFrame(results)

print("\n===== EXPERIMENT 18: CROSS-PLANT COMPARISON =====")
print(results_df.round(4).to_string(index=False))