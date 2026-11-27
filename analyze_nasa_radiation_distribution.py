import pandas as pd
import numpy as np


# ==========================================
# 1. LOAD KAGGLE DATA
# ==========================================

kaggle = pd.read_csv("data/processed/solar_processed.csv")

kaggle["DATE_TIME"] = pd.to_datetime(kaggle["DATE_TIME"])

# Select Plant 1
kaggle = kaggle[kaggle["PLANT_ID"] == 4135001].copy()


# ==========================================
# 2. LOAD NASA DATA
# ==========================================

nasa = pd.read_csv("nasa_plant1.csv", skiprows=10)

# Create NASA datetime
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

# Convert UTC to IST (+5:30)
nasa["DATE_TIME"] = (
    nasa["DATE_TIME"] + pd.Timedelta(hours=5, minutes=30)
)

# Rename radiation column
nasa = nasa.rename(
    columns={
        "ALLSKY_SFC_SW_DWN": "NASA_IRRADIATION"
    }
)

# Provisional conversion
nasa["NASA_IRRADIATION"] = (
    nasa["NASA_IRRADIATION"] / 1000
)


# ==========================================
# 3. CONVERT NASA TO 15-MINUTE DATA
# ==========================================

nasa = nasa.set_index("DATE_TIME")

nasa = nasa[["NASA_IRRADIATION"]].resample(
    "15min"
).interpolate()

nasa = nasa.reset_index()


# ==========================================
# 4. MERGE BOTH DATASETS
# ==========================================

data = pd.merge(
    kaggle,
    nasa,
    on="DATE_TIME",
    how="inner"
)

print("Matched records:", len(data))


# ==========================================
# 5. BASIC DISTRIBUTION COMPARISON
# ==========================================

print("\n========================================")
print("KAGGLE IRRADIATION STATISTICS")
print("========================================")

print(data["IRRADIATION"].describe())


print("\n========================================")
print("NASA IRRADIATION STATISTICS")
print("========================================")

print(data["NASA_IRRADIATION"].describe())


# ==========================================
# 6. DIRECT COMPARISON
# ==========================================

data["RADIATION_DIFFERENCE"] = (
    data["NASA_IRRADIATION"] - data["IRRADIATION"]
)

print("\n========================================")
print("NASA - KAGGLE RADIATION DIFFERENCE")
print("========================================")

print("MAE:",
      np.mean(np.abs(data["RADIATION_DIFFERENCE"])))

print("RMSE:",
      np.sqrt(np.mean(data["RADIATION_DIFFERENCE"] ** 2)))

print("Mean Difference:",
      data["RADIATION_DIFFERENCE"].mean())

print("Correlation:",
      data["IRRADIATION"].corr(data["NASA_IRRADIATION"]))


# ==========================================
# 7. DAYTIME COMPARISON
# ==========================================

daytime = data[data["IRRADIATION"] > 0.05]

print("\n========================================")
print("DAYTIME RADIATION COMPARISON")
print("========================================")

print("Daytime records:", len(daytime))

print("Kaggle Mean:",
      daytime["IRRADIATION"].mean())

print("NASA Mean:",
      daytime["NASA_IRRADIATION"].mean())

print("Difference MAE:",
      np.mean(
          np.abs(
              daytime["NASA_IRRADIATION"]
              - daytime["IRRADIATION"]
          )
      ))

print("Correlation:",
      daytime["IRRADIATION"].corr(
          daytime["NASA_IRRADIATION"]
      ))


# ==========================================
# 8. HIGH IRRADIATION COMPARISON
# ==========================================

high = data[data["IRRADIATION"] > 0.6]

print("\n========================================")
print("HIGH IRRADIATION COMPARISON")
print("========================================")

print("Records:", len(high))

print("Kaggle Mean:",
      high["IRRADIATION"].mean())

print("NASA Mean:",
      high["NASA_IRRADIATION"].mean())

print("Difference MAE:",
      np.mean(
          np.abs(
              high["NASA_IRRADIATION"]
              - high["IRRADIATION"]
          )
      ))

print("Correlation:",
      high["IRRADIATION"].corr(
          high["NASA_IRRADIATION"]
      ))


# ==========================================
# 9. COMPARISON BY IRRADIATION RANGE
# ==========================================

def category(value):

    if value <= 0.05:
        return "Low / Night"

    elif value <= 0.3:
        return "Moderate"

    elif value <= 0.6:
        return "High"

    else:
        return "Very High"


data["GROUP"] = data["IRRADIATION"].apply(category)


print("\n========================================")
print("RADIATION COMPARISON BY GROUP")
print("========================================")

groups = [
    "Low / Night",
    "Moderate",
    "High",
    "Very High"
]

for group in groups:

    subset = data[data["GROUP"] == group]

    if len(subset) == 0:
        continue

    print("\n---", group, "---")

    print("Records:", len(subset))

    print("Kaggle Mean:",
          subset["IRRADIATION"].mean())

    print("NASA Mean:",
          subset["NASA_IRRADIATION"].mean())

    print("Mean Difference:",
          (
              subset["NASA_IRRADIATION"]
              - subset["IRRADIATION"]
          ).mean())

    print("MAE:",
          np.mean(
              np.abs(
                  subset["NASA_IRRADIATION"]
                  - subset["IRRADIATION"]
              )
          ))

    print("Correlation:",
          subset["IRRADIATION"].corr(
              subset["NASA_IRRADIATION"]
          ))


print("\nRADIATION DISTRIBUTION ANALYSIS COMPLETED")