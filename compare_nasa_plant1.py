import pandas as pd
import numpy as np

# -----------------------------
# 1. Load Kaggle processed data
# -----------------------------
kaggle = pd.read_csv("data/processed/solar_processed.csv")

kaggle["DATE_TIME"] = pd.to_datetime(kaggle["DATE_TIME"])

# Plant 1
kaggle = kaggle[kaggle["PLANT_ID"] == 4135001].copy()

# Round timestamps down to the hour for matching
kaggle["HOUR"] = kaggle["DATE_TIME"].dt.floor("h")


# -----------------------------
# 2. Load NASA POWER data
# -----------------------------
nasa = pd.read_csv("nasa_plant1.csv", skiprows=10)

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

nasa = nasa.rename(
    columns={
        "T2M": "NASA_TEMP",
        "ALLSKY_SFC_SW_DWN": "NASA_RADIATION"
    }
)

# Remove missing NASA values
nasa = nasa[
    (nasa["NASA_TEMP"] != -999) &
    (nasa["NASA_RADIATION"] != -999)
].copy()


# -----------------------------
# 3. Match hourly NASA data
# -----------------------------
merged = pd.merge(
    kaggle,
    nasa[["DATE_TIME", "NASA_TEMP", "NASA_RADIATION"]],
    left_on="HOUR",
    right_on="DATE_TIME",
    how="inner"
)

print("MATCHED RECORDS:", len(merged))


# -----------------------------
# 4. Temperature comparison
# -----------------------------
def metrics(actual, predicted):
    mae = np.mean(np.abs(actual - predicted))
    rmse = np.sqrt(np.mean((actual - predicted) ** 2))
    bias = np.mean(predicted - actual)
    corr = np.corrcoef(actual, predicted)[0, 1]

    print("MAE:", mae)
    print("RMSE:", rmse)
    print("Bias:", bias)
    print("Correlation:", corr)


print("\n========== TEMPERATURE ==========")

print("\nKAGGLE TEMPERATURE:")
print(merged["AMBIENT_TEMPERATURE"].describe())

print("\nNASA TEMPERATURE:")
print(merged["NASA_TEMP"].describe())

metrics(
    merged["AMBIENT_TEMPERATURE"].values,
    merged["NASA_TEMP"].values
)


# -----------------------------
# 5. Radiation comparison
# -----------------------------
print("\n========== RADIATION ==========")

print("\nKAGGLE IRRADIATION:")
print(merged["IRRADIATION"].describe())

print("\nNASA RADIATION (Wh/m²):")
print(merged["NASA_RADIATION"].describe())

print("\nNASA RADIATION DIVIDED BY 1000:")
print((merged["NASA_RADIATION"] / 1000).describe())


print("\nNASA RAW RADIATION vs KAGGLE:")
metrics(
    merged["IRRADIATION"].values,
    merged["NASA_RADIATION"].values
)

print("\nNASA RADIATION / 1000 vs KAGGLE:")
metrics(
    merged["IRRADIATION"].values,
    (merged["NASA_RADIATION"] / 1000).values
)


# -----------------------------
# 6. Daytime comparison
# -----------------------------
daytime = merged[merged["IRRADIATION"] > 0.05].copy()

print("\n========== DAYTIME ==========")
print("Daytime matched records:", len(daytime))

print("\nTEMPERATURE:")
metrics(
    daytime["AMBIENT_TEMPERATURE"].values,
    daytime["NASA_TEMP"].values
)

print("\nRADIATION NASA / 1000:")
metrics(
    daytime["IRRADIATION"].values,
    (daytime["NASA_RADIATION"] / 1000).values
)
