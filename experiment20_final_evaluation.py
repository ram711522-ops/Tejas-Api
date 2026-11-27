import pandas as pd

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# Load dataset
df = pd.read_csv("data/processed/solar_processed.csv")

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

final_results = []

for plant_name, plant_id in plants.items():

    plant_df = df[df["PLANT_ID"] == plant_id].copy()

    plant_df = plant_df.sort_values("DATE_TIME").reset_index(drop=True)

    # Chronological split
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

    # Predictions
    predictions = model.predict(test[features])

    test = test.copy()
    test["Predicted"] = predictions

    # Evaluate conditions
    conditions = {
        "Overall": test,
        "Daytime": test[test["IRRADIATION"] > 0.05],
        "Nighttime / Low Irradiance": test[test["IRRADIATION"] <= 0.05]
    }

    for condition, subset in conditions.items():

        mae = mean_absolute_error(
            subset[target],
            subset["Predicted"]
        )

        rmse = mean_squared_error(
            subset[target],
            subset["Predicted"]
        ) ** 0.5

        r2 = r2_score(
            subset[target],
            subset["Predicted"]
        )

        final_results.append({
            "Plant": plant_name,
            "Condition": condition,
            "Samples": len(subset),
            "MAE": mae,
            "RMSE": rmse,
            "R2": r2
        })

# Final results table
results_df = pd.DataFrame(final_results)

print("\n========== EXPERIMENT 20 ==========")
print("FINAL MODEL EVALUATION")
print(results_df.round(4).to_string(index=False))

print("\n========== FINAL CONCLUSIONS ==========")

print("""
1. Plant 1 has better overall prediction performance than Plant 2.
2. Daytime prediction is more challenging than nighttime prediction.
3. Irradiation is the most important feature in the experiments.
4. Module temperature and time features improve prediction.
5. Ambient temperature contribution differs between plants.
6. Prediction errors increase at higher power levels.
7. The model performs well overall but has limitations at high generation.
""")