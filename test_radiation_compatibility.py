
import pandas as pd
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error

# Load Kaggle Plant 1 weather data
kaggle = pd.read_csv(
    "data/raw/Plant_1_Weather_Sensor_Data.csv"
)

kaggle["DATE_TIME"] = pd.to_datetime(
    kaggle["DATE_TIME"],
    format="%Y-%m-%d %H:%M:%S"
)

# Convert 15-minute readings to hourly averages
kaggle["hour"] = kaggle["DATE_TIME"].dt.floor("h")

kaggle_hourly = (
    kaggle.groupby("hour")["IRRADIATION"]
    .mean()
    .reset_index()
)

# Load original Open-Meteo data
open_meteo = pd.read_csv(
    r"C:\Users\Rama\Downloads\open-meteo-14.80N78.18E203m.csv",
    skiprows=2
)

open_meteo["time"] = pd.to_datetime(open_meteo["time"])

open_meteo = open_meteo.rename(
    columns={
        "time": "hour",
        "shortwave_radiation (W/m²)": "radiation_wm2"
    }
)

# Match timestamps
data = pd.merge(
    kaggle_hourly,
    open_meteo[["hour", "radiation_wm2"]],
    on="hour",
    how="inner"
)

x = data["radiation_wm2"].to_numpy()
y = data["IRRADIATION"].to_numpy()

# Compare the raw values
print("Matched records:", len(data))
print("\nKAGGLE IRRADIATION")
print(data["IRRADIATION"].describe())

print("\nOPEN-METEO RADIATION")
print(data["radiation_wm2"].describe())

# Compare using the proposed conversion: divide W/m² by 1000
predicted_scale = x / 1000

print("\nCOMPARISON: OPEN-METEO / 1000")
print("MAE:", mean_absolute_error(y, predicted_scale))
print("RMSE:", np.sqrt(mean_squared_error(y, predicted_scale)))
print("Correlation:", np.corrcoef(y, x)[0, 1])

# Fit a diagnostic linear conversion
slope, intercept = np.polyfit(x, y, 1)
converted = slope * x + intercept

print("\nDIAGNOSTIC LINEAR CONVERSION")
print("Slope:", slope)
print("Intercept:", intercept)
print("MAE:", mean_absolute_error(y, converted))
print("RMSE:", np.sqrt(mean_squared_error(y, converted)))

print("\nFIRST 10 MATCHED RECORDS")
print(data.head(10).to_string(index=False))
