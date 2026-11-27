import pandas as pd
import matplotlib.pyplot as plt


# ==========================================
# 1. LOAD KAGGLE DATA
# ==========================================

kaggle = pd.read_csv("data/processed/solar_processed.csv")

kaggle["DATE_TIME"] = pd.to_datetime(
    kaggle["DATE_TIME"]
)

# Select Plant 1
kaggle = kaggle[
    kaggle["PLANT_ID"] == 4135001
].copy()


# ==========================================
# 2. LOAD NASA DATA
# ==========================================

nasa = pd.read_csv(
    "nasa_plant1.csv",
    skiprows=10
)

# Create datetime
nasa["DATE_TIME"] = pd.to_datetime(
    nasa[["YEAR", "MO", "DY", "HR"]].rename(
        columns={
            "YEAR": "year",
            "MO": "month",
            "DY": "day",
            "HR": "hour"
        }
    )
)

# Convert UTC to IST
nasa["DATE_TIME"] = (
    nasa["DATE_TIME"]
    + pd.Timedelta(hours=5, minutes=30)
)

# Rename radiation
nasa = nasa.rename(
    columns={
        "ALLSKY_SFC_SW_DWN": "NASA_IRRADIATION"
    }
)

# Provisional scaling
nasa["NASA_IRRADIATION"] = (
    nasa["NASA_IRRADIATION"] / 1000
)


# ==========================================
# 3. RESAMPLE NASA TO 15 MINUTES
# ==========================================

nasa = nasa.set_index("DATE_TIME")

nasa = nasa[
    ["NASA_IRRADIATION"]
].resample("15min").interpolate()

nasa = nasa.reset_index()


# ==========================================
# 4. MERGE
# ==========================================

data = pd.merge(
    kaggle,
    nasa,
    on="DATE_TIME",
    how="inner"
)

print("Matched records:", len(data))


# ==========================================
# 5. SCATTER PLOT
# ==========================================

plt.figure(figsize=(8, 6))

plt.scatter(
    data["IRRADIATION"],
    data["NASA_IRRADIATION"],
    alpha=0.4
)

# Perfect agreement reference line
maximum = max(
    data["IRRADIATION"].max(),
    data["NASA_IRRADIATION"].max()
)

plt.plot(
    [0, maximum],
    [0, maximum],
    linestyle="--"
)

plt.xlabel("Kaggle Irradiation")
plt.ylabel("NASA Irradiation")
plt.title("Kaggle vs NASA Irradiation")

plt.grid(True)
plt.tight_layout()

plt.show()


# ==========================================
# 6. DIFFERENCE PLOT
# ==========================================

data["RADIATION_DIFFERENCE"] = (
    data["NASA_IRRADIATION"]
    - data["IRRADIATION"]
)

plt.figure(figsize=(8, 6))

plt.scatter(
    data["IRRADIATION"],
    data["RADIATION_DIFFERENCE"],
    alpha=0.4
)

# Zero difference reference
plt.axhline(
    y=0,
    linestyle="--"
)

plt.xlabel("Kaggle Irradiation")
plt.ylabel("NASA - Kaggle Irradiation")
plt.title("NASA Radiation Difference vs Kaggle Irradiation")

plt.grid(True)
plt.tight_layout()

plt.show()


print("\nVISUALIZATION COMPLETED")