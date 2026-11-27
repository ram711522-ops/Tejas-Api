
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

kaggle = kaggle[["DATE_TIME", "IRRADIATION"]].copy()

# 2. Load Plant 2 Open-Meteo data
weather = pd.read_csv(
    "openmeteo_plant2.csv",
    skiprows=2
)

weather["time"] = pd.to_datetime(weather["time"])

weather = weather[
    ["time", "shortwave_radiation (W/m²)"]
].copy()

# 3. Match hourly weather to 15-minute records
kaggle["hour"] = kaggle["DATE_TIME"].dt.floor("h")
weather["hour"] = weather["time"]

matched = pd.merge(
    kaggle,
    weather,
    on="hour",
    how="inner"
)

# 4. Convert radiation to provisional comparable scale
matched["open_scaled"] = (
    matched["shortwave_radiation (W/m²)"] / 1000
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

# 7. Sample records
print("\nFIRST 16 MATCHED RECORDS")
print(matched[
    ["DATE_TIME", "IRRADIATION", "open_scaled"]
].head(16).to_string(index=False))

