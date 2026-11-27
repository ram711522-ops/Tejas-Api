
import pandas as pd
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error

# 1. Load Kaggle Plant 2 weather data
kaggle = pd.read_csv(
    "data/raw/Plant_2_Weather_Sensor_Data.csv"
)

kaggle["DATE_TIME"] = pd.to_datetime(
    kaggle["DATE_TIME"],
    format="%Y-%m-%d %H:%M:%S"
)

kaggle = kaggle[
    ["DATE_TIME", "MODULE_TEMPERATURE"]
].copy()

# 2. Load Open-Meteo data
weather = pd.read_csv(
    "openmeteo_plant2.csv",
    skiprows=2
)

weather["time"] = pd.to_datetime(weather["time"])

weather = weather[
    ["time", "temperature_2m (°C)",
     "shortwave_radiation (W/m²)"]
].copy()

# 3. Match timestamps
kaggle["hour"] = kaggle["DATE_TIME"].dt.floor("h")
weather["hour"] = weather["time"]

matched = pd.merge(
    kaggle,
    weather,
    on="hour",
    how="inner"
)

# 4. Convert Open-Meteo radiation to provisional scale
matched["open_scaled"] = (
    matched["shortwave_radiation (W/m²)"] / 1000
)

# 5. Estimate module temperature using the earlier formula
matched["estimated_module_temp"] = (
    1.026476 * matched["temperature_2m (°C)"]
    + 28.363679 * matched["open_scaled"]
    - 2.138474
)

# 6. Compare with actual Kaggle module temperature
actual = matched["MODULE_TEMPERATURE"]
estimated = matched["estimated_module_temp"]

print("MATCHED RECORDS:", len(matched))

print("\nACTUAL MODULE TEMPERATURE")
print(actual.describe())

print("\nESTIMATED MODULE TEMPERATURE")
print(estimated.describe())

print("\nMODULE TEMPERATURE RESULTS")
print("MAE:", mean_absolute_error(actual, estimated))
print("RMSE:", np.sqrt(mean_squared_error(actual, estimated)))
print("BIAS:", (estimated - actual).mean())
print("CORRELATION:", actual.corr(estimated))

# 7. Daytime comparison
daytime = matched[
    matched["shortwave_radiation (W/m²)"] > 50
]

print("\nDAYTIME RECORDS:", len(daytime))

print("Daytime MAE:", mean_absolute_error(
    daytime["MODULE_TEMPERATURE"],
    daytime["estimated_module_temp"]
))

print("Daytime RMSE:", np.sqrt(mean_squared_error(
    daytime["MODULE_TEMPERATURE"],
    daytime["estimated_module_temp"]
)))

# 8. Sample comparison
print("\nFIRST 20 COMPARISON RECORDS")

print(matched[
    ["DATE_TIME", "MODULE_TEMPERATURE",
     "estimated_module_temp"]
].head(20).to_string(index=False))
