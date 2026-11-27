import pandas as pd

from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# Load dataset
df = pd.read_csv("data/processed/solar_processed.csv")

# Select Plant 1
df = df[df["PLANT_ID"] == 4135001].copy()

# Features
features = [
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "hour_sin",
    "hour_cos",
    "IRRADIATION"
]

target = "AC_POWER"

# Sort chronologically
df = df.sort_values("DATE_TIME").reset_index(drop=True)

# Train-test split (80% training, 20% testing)
split = int(len(df) * 0.8)

train = df.iloc[:split]
test = df.iloc[split:]

# Define feature combinations
feature_sets = {
    "Baseline": features,

    "Without Ambient Temperature": [
        "MODULE_TEMPERATURE",
        "hour_sin",
        "hour_cos",
        "IRRADIATION"
    ],

    "Without Module Temperature": [
        "AMBIENT_TEMPERATURE",
        "hour_sin",
        "hour_cos",
        "IRRADIATION"
    ],

    "Without Both Temperatures": [
        "hour_sin",
        "hour_cos",
        "IRRADIATION"
    ],

    "Without Time Features": [
        "AMBIENT_TEMPERATURE",
        "MODULE_TEMPERATURE",
        "IRRADIATION"
    ]
}

results = []

# Train and evaluate each model
for name, selected_features in feature_sets.items():

    model = RandomForestRegressor(
        n_estimators=100,
        random_state=42,
        n_jobs=1
    )

    model.fit(train[selected_features], train[target])

    predictions = model.predict(test[selected_features])

    mae = mean_absolute_error(test[target], predictions)

    rmse = mean_squared_error(
        test[target],
        predictions
    ) ** 0.5

    r2 = r2_score(test[target], predictions)

    results.append({
        "Model": name,
        "MAE": mae,
        "RMSE": rmse,
        "R2": r2
    })

# Display results
results_df = pd.DataFrame(results)

print("\n===== EXPERIMENT 15: FEATURE ABLATION =====")
print(results_df.round(4).to_string(index=False))