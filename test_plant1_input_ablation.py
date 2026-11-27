
import pandas as pd
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error

# 1. Load Plant 1 Kaggle weather data
kaggle = pd.read_csv(
    "data/raw/Plant_1_Weather_Sensor_Data.csv"
)

kaggle["DATE_TIME"] = pd.to_datetime(
    kaggle["DATE_TIME"],
    format="%Y-%m-%d %H:%M:%S"
)

kaggle["hour"] = kaggle["DATE_TIME"].dt.floor("h")

# 2. Load Plant 1 Open-Meteo data
weather = pd.read_csv(
    r"C:\Users\Rama\Downloads\open-meteo-14.80N78.18E203m.csv",
    skiprows=2
)

weather["time"] = pd.to_datetime(weather["time"])
weather["hour"] = weather["time"]

# 3. Match records
matched = pd.merge(
    kaggle,
    weather,
    on="hour",
    how="inner"
)

# 4. Convert Open-Meteo radiation
matched["open_scaled"] = (
    matched["shortwave_radiation (W/m²)"] / 1000
)

# 5. Four input combinations
matched["A_kaggle_both"] = (
    1.026476 * matched["AMBIENT_TEMPERATURE"]
    + 28.363679 * matched["IRRADIATION"]
    - 2.138474
)

matched["B_open_temp"] = (
    1.026476 * matched["temperature_2m (°C)"]
    + 28.363679 * matched["IRRADIATION"]
    - 2.138474
)

matched["C_open_radiation"] = (
    1.026476 * matched["AMBIENT_TEMPERATURE"]
    + 28.363679 * matched["open_scaled"]
    - 2.138474
)

matched["D_open_both"] = (
    1.026476 * matched["temperature_2m (°C)"]
    + 28.363679 * matched["open_scaled"]
    - 2.138474
)

# 6. Evaluate all combinations
actual = matched["MODULE_TEMPERATURE"]

tests = {
    "A - Kaggle temperature + Kaggle radiation":
        matched["A_kaggle_both"],

    "B - Open-Meteo temperature + Kaggle radiation":
        matched["B_open_temp"],

    "C - Kaggle temperature + Open-Meteo radiation":
        matched["C_open_radiation"],

    "D - Open-Meteo temperature + Open-Meteo radiation":
        matched["D_open_both"]
}

print("MATCHED RECORDS:", len(matched))

for name, estimate in tests.items():
    print("\n", name)
    print("MAE:", mean_absolute_error(actual, estimate))
    print("RMSE:", np.sqrt(mean_squared_error(actual, estimate)))
    print("Bias:", (estimate - actual).mean())
    print("Correlation:", actual.corr(estimate))

# 7. Daytime comparison
daytime = matched[
    matched["shortwave_radiation (W/m²)"] > 50
]

print("\n========== DAYTIME RESULTS ==========")

for name, estimate in tests.items():
    print("\n", name)
    print("MAE:", mean_absolute_error(
        daytime["MODULE_TEMPERATURE"],
        estimate.loc[daytime.index]
    ))
    print("RMSE:", np.sqrt(mean_squared_error(
        daytime["MODULE_TEMPERATURE"],
        estimate.loc[daytime.index]
    )))

# 8. Final summary
results = []

for name, estimate in tests.items():
    results.append({
        "Test": name,
        "MAE": mean_absolute_error(actual, estimate),
        "RMSE": np.sqrt(mean_squared_error(actual, estimate)),
        "Bias": (estimate - actual).mean(),
        "Correlation": actual.corr(estimate)
    })

summary = pd.DataFrame(results)

print("\n========== FINAL SUMMARY ==========")
print(summary.to_string(index=False))
