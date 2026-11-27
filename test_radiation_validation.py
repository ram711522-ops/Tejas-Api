
import pandas as pd
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error

# Load Kaggle weather data
kaggle = pd.read_csv(
    "data/raw/Plant_1_Weather_Sensor_Data.csv"
)

kaggle["DATE_TIME"] = pd.to_datetime(
    kaggle["DATE_TIME"],
    format="%Y-%m-%d %H:%M:%S"
)

kaggle["hour"] = kaggle["DATE_TIME"].dt.floor("h")

kaggle_hourly = (
    kaggle.groupby("hour")["IRRADIATION"]
    .mean()
    .reset_index()
)

# Load Open-Meteo data
weather = pd.read_csv(
    r"C:\Users\Rama\Downloads\open-meteo-14.80N78.18E203m.csv",
    skiprows=2
)

weather["time"] = pd.to_datetime(weather["time"])

weather = weather.rename(columns={
    "time": "hour",
    "shortwave_radiation (W/m²)": "radiation"
})

# Match records
data = pd.merge(
    kaggle_hourly,
    weather[["hour", "radiation"]],
    on="hour",
    how="inner"
).sort_values("hour").reset_index(drop=True)

x = data["radiation"].to_numpy()
y = data["IRRADIATION"].to_numpy()

# Chronological 70/30 split
split = int(len(data) * 0.70)

x_train, x_test = x[:split], x[split:]
y_train, y_test = y[:split], y[split:]

# Method 1: divide by 1000
pred_1000 = x_test / 1000

# Method 2: learn conversion from training data only
slope, intercept = np.polyfit(x_train, y_train, 1)
pred_linear = slope * x_test + intercept

# Prevent physically impossible negative irradiation
pred_linear = np.maximum(pred_linear, 0)

print("Training records:", len(x_train))
print("Testing records:", len(x_test))

print("\nMETHOD 1: DIVIDE BY 1000")
print("MAE:", mean_absolute_error(y_test, pred_1000))
print("RMSE:", np.sqrt(mean_squared_error(y_test, pred_1000)))

print("\nMETHOD 2: TRAINED LINEAR CONVERSION")
print("Slope:", slope)
print("Intercept:", intercept)
print("MAE:", mean_absolute_error(y_test, pred_linear))
print("RMSE:", np.sqrt(mean_squared_error(y_test, pred_linear)))

print("\nTEST DATA DATE RANGE")
print(data.iloc[split]["hour"], "to", data.iloc[-1]["hour"])
