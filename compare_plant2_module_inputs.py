
import pandas as pd
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error

# Load Kaggle Plant 2 weather data
kaggle = pd.read_csv(
    "data/raw/Plant_2_Weather_Sensor_Data.csv"
)

kaggle["DATE_TIME"] = pd.to_datetime(
    kaggle["DATE_TIME"],
    format="%Y-%m-%d %H:%M:%S"
)

kaggle["hour"] = kaggle["DATE_TIME"].dt.floor("h")

# Load Open-Meteo data
weather = pd.read_csv(
    "openmeteo_plant2.csv",
    skiprows=2
)

weather["time"] = pd.to_datetime(weather["time"])
weather["hour"] = weather["time"]

# Match records
matched = pd.merge(
    kaggle,
    weather,
    on="hour",
    how="inner"
)

# Convert radiation to provisional scale
matched["open_scaled"] = (
    matched["shortwave_radiation (W/m²)"] / 1000
)

# Estimator A: Kaggle sensor inputs
matched["estimate_kaggle"] = (
    1.026476 * matched["AMBIENT_TEMPERATURE"]
    + 28.363679 * matched["IRRADIATION"]
    - 2.138474
)

# Estimator B: Open-Meteo inputs
matched["estimate_openmeteo"] = (
    1.026476 * matched["temperature_2m (°C)"]
    + 28.363679 * matched["open_scaled"]
    - 2.138474
)

actual = matched["MODULE_TEMPERATURE"]

# Compare both estimators
for name, estimate in [
    ("KAGGLE INPUTS", matched["estimate_kaggle"]),
    ("OPEN-METEO INPUTS", matched["estimate_openmeteo"])
]:
    print("\n", name)
    print("MAE:", mean_absolute_error(actual, estimate))
    print("RMSE:", np.sqrt(mean_squared_error(actual, estimate)))
    print("Bias:", (estimate - actual).mean())
    print("Correlation:", actual.corr(estimate))

# Daytime comparison
daytime = matched[
    matched["shortwave_radiation (W/m²)"] > 50
]

print("\nDAYTIME COMPARISON")

for name, estimate in [
    ("KAGGLE INPUTS", daytime["estimate_kaggle"]),
    ("OPEN-METEO INPUTS", daytime["estimate_openmeteo"])
]:
    print("\n", name)
    print("MAE:", mean_absolute_error(
        daytime["MODULE_TEMPERATURE"], estimate
    ))
    print("RMSE:", np.sqrt(mean_squared_error(
        daytime["MODULE_TEMPERATURE"], estimate
    )))

print("\nMATCHED RECORDS:", len(matched))
