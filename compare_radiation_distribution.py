import pandas as pd
import numpy as np

# ==========================================
# 1. LOAD KAGGLE DATA
# ==========================================

data = pd.read_csv("data/processed/solar_processed.csv")

# Plant 1 only
data = data[data["PLANT_ID"] == 4135001].copy()

data["DATE_TIME"] = pd.to_datetime(data["DATE_TIME"])
data = data.sort_values("DATE_TIME")

# ==========================================
# 2. LOAD NASA DATA
# ==========================================

# Skip NASA metadata (10 lines)
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

# Convert UTC to Indian Standard Time
nasa["DATE_TIME"] = nasa["DATE_TIME"] + pd.Timedelta(
    hours=5, minutes=30
)

# Convert NASA radiation using our provisional scaling
nasa["NASA_RADIATION"] = nasa["ALLSKY_SFC_SW_DWN"] / 1000

# ==========================================
# 3. INTERPOLATE NASA TO 15-MINUTE DATA
# ==========================================

nasa = nasa.set_index("DATE_TIME").sort_index()

nasa_15min = nasa[["NASA_RADIATION"]].resample(
    "15min"
).interpolate(method="time")

# ==========================================
# 4. MATCH DATA
# ==========================================

data = data.set_index("DATE_TIME")

matched = data.join(
    nasa_15min,
    how="inner"
)

print("Matched records:", len(matched))

# ==========================================
# 5. DISTRIBUTION SUMMARY
# ==========================================

def summary(series, name):
    print(f"\n========== {name} ==========")
    print("Count:", series.count())
    print("Mean:", series.mean())
    print("Standard Deviation:", series.std())
    print("Minimum:", series.min())
    print("25%:", series.quantile(0.25))
    print("Median:", series.median())
    print("75%:", series.quantile(0.75))
    print("Maximum:", series.max())

summary(matched["IRRADIATION"], "KAGGLE RADIATION")

summary(
    matched["NASA_RADIATION"],
    "NASA RADIATION / 1000"
)

# ==========================================
# 6. DAYTIME DISTRIBUTION
# ==========================================

daytime = matched["IRRADIATION"] > 0.05

print("\n========== DAYTIME ONLY ==========")
print("Daytime records:", daytime.sum())

summary(
    matched.loc[daytime, "IRRADIATION"],
    "KAGGLE DAYTIME RADIATION"
)

summary(
    matched.loc[daytime, "NASA_RADIATION"],
    "NASA DAYTIME RADIATION / 1000"
)

# ==========================================
# 7. COMPARISON
# ==========================================

print("\n========== DIRECT COMPARISON ==========")

print(
    "Mean Difference:",
    matched["NASA_RADIATION"].mean()
    - matched["IRRADIATION"].mean()
)

print(
    "Standard Deviation Ratio:",
    matched["NASA_RADIATION"].std()
    / matched["IRRADIATION"].std()
)

print(
    "Correlation:",
    matched["NASA_RADIATION"].corr(
        matched["IRRADIATION"]
    )
)

print("\n========== DAYTIME COMPARISON ==========")

print(
    "Daytime Mean Difference:",
    matched.loc[daytime, "NASA_RADIATION"].mean()
    - matched.loc[daytime, "IRRADIATION"].mean()
)

print(
    "Daytime Standard Deviation Ratio:",
    matched.loc[daytime, "NASA_RADIATION"].std()
    / matched.loc[daytime, "IRRADIATION"].std()
)

print(
    "Daytime Correlation:",
    matched.loc[daytime, "NASA_RADIATION"].corr(
        matched.loc[daytime, "IRRADIATION"]
    )
)

# ==========================================
# 8. SAVE COMPARISON DATA
# ==========================================

matched.reset_index().to_csv(
    "radiation_distribution_comparison.csv",
    index=False
)

print("\nSaved: radiation_distribution_comparison.csv")