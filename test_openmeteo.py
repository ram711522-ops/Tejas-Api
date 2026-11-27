
import pandas as pd

# Load matched data
data = pd.read_csv("plant1_matched_weather.csv")

# Calculate temperature difference
data["temperature_difference"] = (
    data["open_temperature"]
    - data["AMBIENT_TEMPERATURE"]
)

# Extract hour and date
data["hour_of_day"] = pd.to_datetime(
    data["hour"]
).dt.hour

data["date"] = pd.to_datetime(
    data["hour"]
).dt.date

# 1. Temperature difference by hour of day
hourly_analysis = data.groupby("hour_of_day")[
    "temperature_difference"
].agg(["mean", "min", "max", "std"])

print("\n===== TEMPERATURE DIFFERENCE BY HOUR =====")
print(hourly_analysis.round(2))

# 2. Temperature difference by date
daily_analysis = data.groupby("date")[
    "temperature_difference"
].agg(["mean", "min", "max"])

print("\n===== TEMPERATURE DIFFERENCE BY DATE =====")
print(daily_analysis.round(2))

# 3. Daytime-only comparison
daytime = data[
    (data["open_radiation"] > 50)
]

print("\n===== DAYTIME TEMPERATURE ANALYSIS =====")
print("Daytime records:", len(daytime))
print(
    "Daytime average temperature difference:",
    round(daytime["temperature_difference"].mean(), 2)
)

# 4. Nighttime-only comparison
nighttime = data[
    (data["open_radiation"] <= 0)
]

print("\n===== NIGHTTIME TEMPERATURE ANALYSIS =====")
print("Nighttime records:", len(nighttime))
print(
    "Nighttime average temperature difference:",
    round(nighttime["temperature_difference"].mean(), 2)
)
