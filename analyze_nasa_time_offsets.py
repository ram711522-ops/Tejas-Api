import pandas as pd
import numpy as np


# ==============================
# 1. LOAD KAGGLE DATA
# ==============================

df = pd.read_csv("data/processed/solar_processed.csv")

df = df[df["PLANT_ID"] == 4135001].copy()

df["DATE_TIME"] = pd.to_datetime(df["DATE_TIME"])

df = df.sort_values("DATE_TIME")


# ==============================
# 2. LOAD NASA DATA
# ==============================

nasa = pd.read_csv("nasa_plant1.csv", skiprows=10)

nasa["DATE_TIME"] = pd.to_datetime(
    nasa[["YEAR", "MO", "DY", "HR"]]
    .rename(columns={
        "YEAR": "year",
        "MO": "month",
        "DY": "day",
        "HR": "hour"
    })
)

# Convert UTC to IST
nasa["DATE_TIME"] = (
    nasa["DATE_TIME"] + pd.Timedelta(hours=5, minutes=30)
)

nasa["NASA_IRRADIATION"] = (
    nasa["ALLSKY_SFC_SW_DWN"] / 1000
)

nasa = nasa[["DATE_TIME", "NASA_IRRADIATION"]]

nasa = nasa.sort_values("DATE_TIME")


# ==============================
# 3. TEST DIFFERENT TIME OFFSETS
# ==============================

offsets = [-60, -45, -30, -15, 0, 15, 30, 45, 60]

results = []

for offset in offsets:

    shifted = nasa.copy()

    shifted["DATE_TIME"] = (
        shifted["DATE_TIME"] + pd.Timedelta(minutes=offset)
    )

    shifted = shifted.set_index("DATE_TIME")

    # Interpolate to 15-minute intervals
    shifted = shifted.resample("15min").interpolate(method="time")

    shifted = shifted.reset_index()

    # Match Kaggle and NASA
    merged = pd.merge(
        df[["DATE_TIME", "IRRADIATION"]],
        shifted,
        on="DATE_TIME",
        how="inner"
    )

    # Daytime only
    daytime = merged[
        merged["IRRADIATION"] > 0.05
    ]

    # High irradiation: top 25%
    threshold = merged["IRRADIATION"].quantile(0.75)

    high = merged[
        merged["IRRADIATION"] >= threshold
    ]

    # Metrics
    mae = np.mean(
        np.abs(
            merged["IRRADIATION"] -
            merged["NASA_IRRADIATION"]
        )
    )

    rmse = np.sqrt(
        np.mean(
            (
                merged["IRRADIATION"] -
                merged["NASA_IRRADIATION"]
            ) ** 2
        )
    )

    corr = merged["IRRADIATION"].corr(
        merged["NASA_IRRADIATION"]
    )

    daytime_mae = np.mean(
        np.abs(
            daytime["IRRADIATION"] -
            daytime["NASA_IRRADIATION"]
        )
    )

    daytime_corr = daytime["IRRADIATION"].corr(
        daytime["NASA_IRRADIATION"]
    )

    high_mae = np.mean(
        np.abs(
            high["IRRADIATION"] -
            high["NASA_IRRADIATION"]
        )
    )

    high_corr = high["IRRADIATION"].corr(
        high["NASA_IRRADIATION"]
    )

    results.append({
        "Offset_Minutes": offset,
        "Records": len(merged),
        "Overall_MAE": mae,
        "Overall_RMSE": rmse,
        "Overall_Correlation": corr,
        "Daytime_MAE": daytime_mae,
        "Daytime_Correlation": daytime_corr,
        "High_Irradiation_MAE": high_mae,
        "High_Irradiation_Correlation": high_corr
    })


# ==============================
# 4. DISPLAY RESULTS
# ==============================

results_df = pd.DataFrame(results)

print("\n===== NASA TIME OFFSET COMPARISON =====")

print(
    results_df.round(4).to_string(index=False)
)

print("\n===== BEST OFFSET BY DAYTIME MAE =====")

print(
    results_df.sort_values("Daytime_MAE")
    .head(3)
    .round(4)
    .to_string(index=False)
)

print("\n===== BEST OFFSET BY HIGH-IRRADIATION MAE =====")

print(
    results_df.sort_values("High_Irradiation_MAE")
    .head(3)
    .round(4)
    .to_string(index=False)
)

print("\n===== BEST OFFSET BY DAYTIME CORRELATION =====")

print(
    results_df.sort_values(
        "Daytime_Correlation",
        ascending=False
    )
    .head(3)
    .round(4)
    .to_string(index=False)
)