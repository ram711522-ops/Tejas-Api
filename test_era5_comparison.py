
import pandas as pd
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error

# 1. Load Kaggle weather data
kaggle = pd.read_csv(
    "data/raw/Plant_1_Weather_Sensor_Data.csv"
)

kaggle["DATE_TIME"] = pd.to_datetime(
    kaggle["DATE_TIME"],
    format="%Y-%m-%d %H:%M:%S"
)

# 2. Convert Kaggle data to hourly averages
kaggle["hour"] = kaggle["DATE_TIME"].dt.floor("h")

kaggle_hourly = kaggle.groupby("hour").agg(
    kaggle_temperature=("AMBIENT_TEMPERATURE", "mean"),
    kaggle_irradiation=("IRRADIATION", "mean")
).reset_index()

# 3. Load ERA5 data
era5 = pd.read_csv(
    "era5_plant1.csv",
    skiprows=2
)

era5["time"] = pd.to_datetime(era5["time"])

era5 = era5.rename(columns={
    "temperature_2m (°C)": "era5_temperature",
    "shortwave_radiation (W/m²)": "era5_radiation"
})

# 4. Load original Open-Meteo data
openmeteo = pd.read_csv(
    r"C:\Users\Rama\Downloads\open-meteo-14.80N78.18E203m.csv",
    skiprows=2
)

openmeteo["time"] = pd.to_datetime(openmeteo["time"])

openmeteo = openmeteo.rename(columns={
    "temperature_2m (°C)": "open_temperature",
    "shortwave_radiation (W/m²)": "open_radiation"
})

# 5. Match all datasets by timestamp
data = kaggle_hourly.merge(
    era5[["time", "era5_temperature", "era5_radiation"]],
    left_on="hour",
    right_on="time"
)

data = data.merge(
    openmeteo[["time", "open_temperature", "open_radiation"]],
    on="time"
)

print("Matched records:", len(data))

# 6. Compare temperature
for name, column in [
    ("ERA5", "era5_temperature"),
    ("Original Open-Meteo", "open_temperature")
]:
    actual = data["kaggle_temperature"]
    predicted = data[column]

    print(f"\n{name} TEMPERATURE")
    print("MAE:", mean_absolute_error(actual, predicted))
    print("RMSE:", np.sqrt(mean_squared_error(actual, predicted)))
    print("Bias:", (predicted - actual).mean())
    print("Correlation:", actual.corr(predicted))

# 7. Compare radiation
for name, column in [
    ("ERA5", "era5_radiation"),
    ("Original Open-Meteo", "open_radiation")
]:
    print(f"\n{name} RADIATION")
    print("Correlation:",
          data["kaggle_irradiation"].corr(data[column] / 1000))

print("\nFirst 10 matched records:")
print(data[[
    "hour",
    "kaggle_temperature",
    "era5_temperature",
    "open_temperature",
    "kaggle_irradiation",
    "era5_radiation",
    "open_radiation"
]].head(10).to_string(index=False))
