"""
Pick the best store+item from Kaggle Store Item Demand dataset.
Criteria:
  - Strong weekly SNR (LSTM can learn weekly cycle)
  - Moderate noise (not too chaotic)
  - 5 years of data (1826 rows)

Usage:
  python prepare_kaggle_demand.py
  --> outputs best_item.csv  (date, quantity)
  --> prints top-5 candidates
"""
import numpy as np
import pandas as pd

SRC = "train.csv"   # Kaggle Store Item Demand train.csv
OUT = "real_demand.csv"


def weekly_snr(series: pd.Series) -> float:
    """Signal-to-noise ratio of weekly pattern."""
    dow_means = series.groupby(series.index.dayofweek).mean()
    amplitude = (dow_means.max() - dow_means.min()) / 2
    noise = series.std()
    return float(amplitude / noise) if noise > 0 else 0.0


def max_min_ratio(series: pd.Series) -> float:
    mn = series.min()
    return float(series.max() / mn) if mn > 0 else 999.0


def ar7_strength(series: pd.Series) -> float:
    """Correlation of series with its 7-day lag (measures AR weekly memory)."""
    s = series.values.astype(float)
    if len(s) < 14:
        return 0.0
    return float(np.corrcoef(s[7:], s[:-7])[0, 1])


def score(snr, ratio, ar7):
    """Higher is better. Want: SNR > 0.3, ratio < 4, ar7 > 0.7"""
    snr_score  = min(snr / 0.5, 1.0)          # normalized to [0,1]
    ratio_score = max(0.0, 1.0 - (ratio - 2.0) / 6.0)
    ar7_score  = min(ar7 / 0.9, 1.0)
    return snr_score * 0.4 + ratio_score * 0.3 + ar7_score * 0.3


def analyze(df: pd.DataFrame):
    df["date"] = pd.to_datetime(df["date"])
    results = []

    for store in df["store"].unique():
        for item in df["item"].unique():
            sub = df[(df["store"] == store) & (df["item"] == item)].set_index("date")["sales"]
            if len(sub) < 1000:
                continue
            snr = weekly_snr(sub)
            ratio = max_min_ratio(sub)
            ar7 = ar7_strength(sub)
            sc = score(snr, ratio, ar7)
            results.append({
                "store": store, "item": item,
                "rows": len(sub), "mean": round(sub.mean(), 1),
                "snr": round(snr, 3), "ratio": round(ratio, 2),
                "ar7": round(ar7, 3), "score": round(sc, 4)
            })

    return pd.DataFrame(results).sort_values("score", ascending=False)


def main():
    print(f"Loading {SRC} ...")
    df = pd.read_csv(SRC)
    print(f"  Shape: {df.shape}, date range: {df['date'].min()} – {df['date'].max()}")

    print("Analyzing all store×item combos ...")
    ranking = analyze(df)

    print("\n=== TOP 10 candidates ===")
    print(ranking.head(10).to_string(index=False))

    best = ranking.iloc[0]
    store, item = int(best["store"]), int(best["item"])
    print(f"\n→ Best pick: Store {store}, Item {item}  (score={best['score']}, SNR={best['snr']}, ratio={best['ratio']}, ar7={best['ar7']})")

    sub = df[(df["store"] == store) & (df["item"] == item)][["date", "sales"]]
    sub = sub.rename(columns={"sales": "quantity"})
    sub["date"] = pd.to_datetime(sub["date"]).dt.strftime("%Y-%m-%d")
    sub = sub.sort_values("date").reset_index(drop=True)

    sub.to_csv(OUT, index=False)
    print(f"\nSaved → {OUT}  ({len(sub)} rows, qty range [{sub['quantity'].min()}, {sub['quantity'].max()}])")
    print(f"Ratio max/min: {sub['quantity'].max()/sub['quantity'].min():.2f}:1")


if __name__ == "__main__":
    main()
