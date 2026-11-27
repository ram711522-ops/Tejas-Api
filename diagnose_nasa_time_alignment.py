import pandas as pd
import numpy as np

# ==========================================
# 1. LOAD KAGGLE DATA
# ==========================================
kaggle = pd.read_csv("data/processed/solar_processed.csv")

kaggle["DATE_TIME"] = pd.to_datetime(kaggle["DATE_TIME"])

# Select Plant 1
kaggle = kaggle[kaggle["PLANT_ID"] == 4135001].copy()

# Convert 15-minute Kaggle data into hourly averages
kaggle["HOUR"] = kaggle["DATE_TIME"].dt.floor("h")

kaggle_hourly = kaggle.groupby("HOUR").agg(
    KAGGLE_TEMP=("AMBIENT_TEMPERATURE", "mean"),
    KAGGLE_RAD=("IRRADIATION", "mean")
).reset_index()


# ==========================================
# 2. LOAD NASA DATA
# ==========================================
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


# ==========================================
# 3. TEST TIME SHIFTS
# ==========================================
results = []

for shift in range(-12, 13):

    # Shift NASA timestamps
    nasa_test = nasa.copy()
    nasa_test["MATCH_TIME"] = (
        nasa_test["DATE_TIME"] + pd.Timedelta(hours=shift)
    )

    merged = pd.merge(
        kaggle_hourly,
        nasa_test,
        left_on="HOUR",
        right_on="MATCH_TIME",
        how="inner"
    )

    if len(merged) < 100:
        continue

    # Correlations
    temp_corr = merged["KAGGLE_TEMP"].corr(merged["NASA_TEMP"])

    rad_corr = merged["KAGGLE_RAD"].corr(
        merged["NASA_RAD"] / 1000
    )

    # Daytime only
    daytime = merged[merged["KAGGLE_RAD"] > 0.05]

    daytime_rad_corr = daytime["KAGGLE_RAD"].corr(
        daytime["NASA_RAD"] / 1000
    )

    results.append({
        "Shift_Hours": shift,
        "Matched_Rows": len(merged),
        "Temperature_Correlation": temp_corr,
        "Radiation_Correlation": rad_corr,
        "Daytime_Radiation_Correlation": daytime_rad_corr
    })


# ==========================================
# 4. DISPLAY RESULTS
# ==========================================
results = pd.DataFrame(results)

print("\n========== ALL TIME SHIFTS ==========\n")
print(results.to_string(index=False))

print("\n========== BEST TEMPERATURE MATCH ==========\n")
print(
    results.sort_values(
        "Temperature_Correlation",
        ascending=False
    ).head(5).to_string(index=False)
)

print("\n========== BEST RADIATION MATCH ==========\n")
print(
    results.sort_values(
        "Radiation_Correlation",
        ascending=False
    ).head(5).to_string(index=False)
)

print("\n========== BEST DAYTIME RADIATION MATCH ==========\n")
print(
    results.sort_values(
        "Daytime_Radiation_Correlation",
        ascending=False
    ).head(5).to_string(index=False)
)