
import pandas as pd
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error

# 1. Load Kaggle Plant 1 weather data
kaggle = pd.read_csv(
    "data/raw/Plant_1_Weather_Sensor_Data.csv"
)

kaggle["DATE_TIME"] = pd.to_datetime(
    kaggle["DATE_TIME"],
    format="%Y-%m-%d %H:%M:%S"
)

# Keep the original 15-minute records
kaggle = kaggle[["DATE_TIME", "IRRADIATION"]].copy()

# 2. Load Open-Meteo hourly data
open_meteo = pd.read_csv(
    r"C:\Users\Rama\Downloads\open-meteo-14.80N78.18E203m.csv",
    skiprows=2
)

open_meteo["time"] = pd.to_datetime(open_meteo["time"])

open_meteo = open_meteo[
    ["time", "shortwave_radiation (W/m²)"]
].copy()

# 3. Match every 15-minute record to its hour
kaggle["hour"] = kaggle["DATE_TIME"].dt.floor("h")
open_meteo["hour"] = open_meteo["time"]

matched = pd.merge(
    kaggle,
    open_meteo,
    on="hour",
    how="inner"
)

# 4. Convert Open-Meteo radiation from W/m² to a
# provisional comparable scale by dividing by 1000
matched["open_scaled"] = (
    matched["shortwave_radiation (W/m²)"] / 1000
)

matched["error"] = (
    matched["IRRADIATION"] - matched["open_scaled"]
)

# 5. Overall comparison
print("MATCHED 15-MINUTE RECORDS:", len(matched))

print("\nKAGGLE IRRADIATION")
print(matched["IRRADIATION"].describe())

print("\nOPEN-METEO SCALED RADIATION")
print(matched["open_scaled"].describe())

print("\n15-MINUTE ALIGNMENT RESULTS")
print("MAE:", mean_absolute_error(
    matched["IRRADIATION"],
    matched["open_scaled"]
))

print("RMSE:", np.sqrt(mean_squared_error(
    matched["IRRADIATION"],
    matched["open_scaled"]
)))

print("Correlation:", matched[
    ["IRRADIATION", "open_scaled"]
].corr().iloc[0, 1])

# 6. Daytime comparison
daytime = matched[
    matched["shortwave_radiation (W/m²)"] > 50
]

print("\nDAYTIME RECORDS:", len(daytime))

print("Daytime MAE:", mean_absolute_error(
    daytime["IRRADIATION"],
    daytime["open_scaled"]
))

print("Daytime RMSE:", np.sqrt(mean_squared_error(
    daytime["IRRADIATION"],
    daytime["open_scaled"]
)))

# 7. Show sample records
print("\nFIRST 16 MATCHED RECORDS")
print(matched[
    ["DATE_TIME", "IRRADIATION", "open_scaled"]
].head(16).to_string(index=False))
