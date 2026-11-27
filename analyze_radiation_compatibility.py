import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

from sklearn.metrics import mean_absolute_error, mean_squared_error

# --------------------------------------------------
# 1. Load Kaggle data - Plant 1
# --------------------------------------------------
kaggle = pd.read_csv("data/processed/solar_processed.csv")

kaggle["DATE_TIME"] = pd.to_datetime(kaggle["DATE_TIME"])

kaggle = kaggle[kaggle["PLANT_ID"] == 4135001].copy()
kaggle["plant_code"] = 0

# --------------------------------------------------
# 2. Load NASA data
# --------------------------------------------------
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

# Convert UTC to India time
nasa["DATE_TIME"] = (
    nasa["DATE_TIME"] + pd.Timedelta(hours=5, minutes=30)
)

# Provisional radiation conversion
nasa["NASA_IRRADIATION"] = (
    nasa["ALLSKY_SFC_SW_DWN"] / 1000
)

nasa = nasa[["DATE_TIME", "NASA_IRRADIATION"]]
nasa = nasa.set_index("DATE_TIME").sort_index()

# --------------------------------------------------
# 3. Interpolate NASA hourly values to Kaggle timestamps
# --------------------------------------------------
all_times = nasa.index.union(kaggle["DATE_TIME"])

nasa = nasa.reindex(all_times)
nasa = nasa.interpolate(method="time")

nasa = nasa.reset_index()
nasa = nasa.rename(columns={"index": "DATE_TIME"})

# --------------------------------------------------
# 4. Match the records
# --------------------------------------------------
df = pd.merge(
    kaggle,
    nasa,
    on="DATE_TIME",
    how="inner"
)

df = df.sort_values("DATE_TIME").reset_index(drop=True)

print("Total matched records:", len(df))

# --------------------------------------------------
# 5. Use the same chronological 80/20 split
# --------------------------------------------------
split = int(len(df) * 0.8)

test_df = df.iloc[split:].copy()

print("Test records:", len(test_df))

# --------------------------------------------------
# 6. Radiation comparison function
# --------------------------------------------------
def radiation_analysis(name, data):

    kaggle_rad = data["IRRADIATION"]
    nasa_rad = data["NASA_IRRADIATION"]

    difference = nasa_rad - kaggle_rad

    print(f"\n===== {name} =====")
    print("Records:", len(data))

    print("\nKAGGLE RADIATION")
    print("Mean:", kaggle_rad.mean())
    print("Std :", kaggle_rad.std())
    print("Min :", kaggle_rad.min())
    print("Max :", kaggle_rad.max())

    print("\nNASA RADIATION")
    print("Mean:", nasa_rad.mean())
    print("Std :", nasa_rad.std())
    print("Min :", nasa_rad.min())
    print("Max :", nasa_rad.max())

    print("\nDIFFERENCE (NASA - KAGGLE)")
    print("Mean difference:", difference.mean())
    print("MAE:", mean_absolute_error(kaggle_rad, nasa_rad))
    print("RMSE:", np.sqrt(mean_squared_error(kaggle_rad, nasa_rad)))
    print("Correlation:", kaggle_rad.corr(nasa_rad))

# --------------------------------------------------
# 7. Overall test set
# --------------------------------------------------
radiation_analysis("ALL TEST RECORDS", test_df)

# --------------------------------------------------
# 8. Daytime test records
# --------------------------------------------------
daytime = test_df[test_df["IRRADIATION"] > 0.05]

radiation_analysis("DAYTIME TEST RECORDS", daytime)

# --------------------------------------------------
# 9. High irradiation test records
# --------------------------------------------------
high_irradiation = test_df[
    test_df["IRRADIATION"] > test_df["IRRADIATION"].quantile(0.75)
]

radiation_analysis("TOP 25% KAGGLE IRRADIATION", high_irradiation)

# --------------------------------------------------
# 10. Scatter plot: Kaggle vs NASA
# --------------------------------------------------
plt.figure(figsize=(8, 6))

plt.scatter(
    daytime["IRRADIATION"],
    daytime["NASA_IRRADIATION"],
    alpha=0.5
)

plt.xlabel("Kaggle Irradiation")
plt.ylabel("NASA Irradiation (scaled / 1000)")
plt.title("Daytime Radiation: Kaggle vs NASA")
plt.grid(True)

# Ideal agreement line
max_value = max(
    daytime["IRRADIATION"].max(),
    daytime["NASA_IRRADIATION"].max()
)

plt.plot([0, max_value], [0, max_value])

plt.tight_layout()
plt.show()

# --------------------------------------------------
# 11. Difference plot
# --------------------------------------------------
plt.figure(figsize=(8, 6))

plt.scatter(
    daytime["IRRADIATION"],
    daytime["NASA_IRRADIATION"] - daytime["IRRADIATION"],
    alpha=0.5
)

plt.axhline(0)

plt.xlabel("Kaggle Irradiation")
plt.ylabel("NASA - Kaggle Radiation")
plt.title("Radiation Difference During Daytime")
plt.grid(True)

plt.tight_layout()
plt.show()