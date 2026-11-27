
import pandas as pd
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error

# 1. Load Plant 2 Kaggle weather data
kaggle = pd.read_csv(
    "data/raw/Plant_2_Weather_Sensor_Data.csv"
)

kaggle["DATE_TIME"] = pd.to_datetime(
    kaggle["DATE_TIME"],
    format="%Y-%m-%d %H:%M:%S"
)

kaggle = kaggle[
    ["DATE_TIME", "AMBIENT_TEMPERATURE"]
].copy()

# 2. Load Open-Meteo weather data
weather = pd.read_csv(
    "openmeteo_plant2.csv",
    skiprows=2
)

weather["time"] = pd.to_datetime(weather["time"])

weather = weather[
    ["time", "temperature_2m (°C)",
     "shortwave_radiation (W/m²)"]
].copy()

# 3. Match Kaggle 15-minute records to hourly data
kaggle["hour"] = kaggle["DATE_TIME"].dt.floor("h")
weather["hour"] = weather["time"]

matched = pd.merge(
    kaggle,
    weather,
    on="hour",
    how="inner"
)

# 4. Calculate temperature difference
matched["temperature_difference"] = (
    matched["temperature_2m (°C)"]
    - matched["AMBIENT_TEMPERATURE"]
)

# 5. Overall temperature comparison
actual = matched["AMBIENT_TEMPERATURE"]
predicted = matched["temperature_2m (°C)"]

print("MATCHED RECORDS:", len(matched))

print("\nKAGGLE AMBIENT TEMPERATURE")
print(actual.describe())

print("\nOPEN-METEO TEMPERATURE")
print(predicted.describe())

print("\nOVERALL TEMPERATURE RESULTS")
print("MAE:", mean_absolute_error(actual, predicted))
print("RMSE:", np.sqrt(mean_squared_error(actual, predicted)))
print("BIAS:", matched["temperature_difference"].mean())
print("CORRELATION:", actual.corr(predicted))

# 6. Daytime comparison
daytime = matched[
    matched["shortwave_radiation (W/m²)"] > 50
]

print("\nDAYTIME RECORDS:", len(daytime))
print("Daytime MAE:", mean_absolute_error(
    daytime["AMBIENT_TEMPERATURE"],
    daytime["temperature_2m (°C)"]
))
print("Daytime RMSE:", np.sqrt(mean_squared_error(
    daytime["AMBIENT_TEMPERATURE"],
    daytime["temperature_2m (°C)"]
)))
print("Daytime bias:", daytime[
    "temperature_difference"
].mean())

# 7. Nighttime comparison
nighttime = matched[
    matched["shortwave_radiation (W/m²)"] <= 50
]

print("\nNIGHTTIME RECORDS:", len(nighttime))
print("Nighttime MAE:", mean_absolute_error(
    nighttime["AMBIENT_TEMPERATURE"],
    nighttime["temperature_2m (°C)"]
))
print("Nighttime bias:", nighttime[
    "temperature_difference"
].mean())

# 8. Sample records
print("\nFIRST 16 MATCHED RECORDS")
print(matched[
    ["DATE_TIME", "AMBIENT_TEMPERATURE",
     "temperature_2m (°C)"]
].head(16).to_string(index=False))

