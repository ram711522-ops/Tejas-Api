import pandas as pd
import numpy as np

# =====================================
# 1. LOAD KAGGLE PLANT 1
# =====================================
kaggle = pd.read_csv("data/processed/solar_processed.csv")
kaggle["DATE_TIME"] = pd.to_datetime(kaggle["DATE_TIME"])

kaggle = kaggle[kaggle["PLANT_ID"] == 4135001].copy()

# Hourly average
kaggle["HOUR"] = kaggle["DATE_TIME"].dt.floor("h")

kaggle_hourly = kaggle.groupby("HOUR").agg(
    KAGGLE_TEMP=("AMBIENT_TEMPERATURE", "mean"),
    KAGGLE_RAD=("IRRADIATION", "mean")
)


# =====================================
# 2. LOAD NASA
# =====================================
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

nasa = nasa.rename(columns={
    "T2M": "NASA_TEMP",
    "ALLSKY_SFC_SW_DWN": "NASA_RAD"
})

nasa = nasa[
    (nasa["NASA_TEMP"] != -999) &
    (nasa["NASA_RAD"] != -999)
].copy()


# =====================================
# 3. APPLY IST SHIFT = 5.5 HOURS
# =====================================
nasa["IST_TIME"] = (
    nasa["DATE_TIME"] + pd.Timedelta(hours=5, minutes=30)
)

nasa = nasa.set_index("IST_TIME").sort_index()

# Interpolate NASA hourly data to Kaggle hourly timestamps
nasa_interp = nasa[["NASA_TEMP", "NASA_RAD"]].resample("30min").interpolate()

# Align to Kaggle hourly timestamps
nasa_aligned = nasa_interp.reindex(
    kaggle_hourly.index,
    method="nearest",
    tolerance=pd.Timedelta("30min")
)

merged = kaggle_hourly.join(nasa_aligned)

merged = merged.dropna()

print("MATCHED RECORDS:", len(merged))


# =====================================
# 4. METRICS FUNCTION
# =====================================
def evaluate(actual, predicted, name):

    mae = np.mean(np.abs(actual - predicted))
    rmse = np.sqrt(np.mean((actual - predicted) ** 2))
    bias = np.mean(predicted - actual)
    corr = np.corrcoef(actual, predicted)[0, 1]

    print(f"\n{name}")
    print("MAE:", mae)
    print("RMSE:", rmse)
    print("Bias:", bias)
    print("Correlation:", corr)


# =====================================
# 5. TEMPERATURE
# =====================================
evaluate(
    merged["KAGGLE_TEMP"],
    merged["NASA_TEMP"],
    "TEMPERATURE - NASA vs KAGGLE"
)


# =====================================
# 6. RADIATION
# =====================================
evaluate(
    merged["KAGGLE_RAD"],
    merged["NASA_RAD"] / 1000,
    "RADIATION - NASA / 1000 vs KAGGLE"
)


# =====================================
# 7. DAYTIME
# =====================================
daytime = merged[merged["KAGGLE_RAD"] > 0.05]

print("\nDAYTIME RECORDS:", len(daytime))

evaluate(
    daytime["KAGGLE_TEMP"],
    daytime["NASA_TEMP"],
    "DAYTIME TEMPERATURE"
)

evaluate(
    daytime["KAGGLE_RAD"],
    daytime["NASA_RAD"] / 1000,
    "DAYTIME RADIATION"
)