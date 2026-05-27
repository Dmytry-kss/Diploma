"""Generate realistic sales CSV files for diploma forecasting demo."""
import numpy as np
import pandas as pd
from pathlib import Path

rng = np.random.default_rng(42)
OUT = Path(__file__).parent


def _save(df: pd.DataFrame, name: str):
    path = OUT / name
    df.to_csv(path, index=False)
    print(f"Saved {name}: {len(df)} rows, qty range [{df.quantity.min():.0f}, {df.quantity.max():.0f}]")


# ─── Electronics (laptops/phones) ────────────────────────────────────────────
# 3 years daily, growing trend, Christmas+Black Friday peaks, weekend boost
def gen_electronics():
    dates = pd.date_range("2022-01-01", periods=1095, freq="D")
    t = np.arange(len(dates))

    trend = 40 + t * (20 / 1095)                   # 40 → 60 units over 3 years
    weekly = np.where(dates.dayofweek >= 5, 1.3, 1.0)  # weekend +30%

    # Yearly seasonality: Christmas peak (Dec) + back-to-school (Sep)
    day_of_year = dates.dayofyear.values
    yearly = (
        1.0
        + 0.25 * np.sin(2 * np.pi * day_of_year / 365 - np.pi * 0.7)   # summer low
        + 0.60 * np.exp(-((day_of_year - 355) ** 2) / (2 * 10 ** 2))   # Christmas
        + 0.25 * np.exp(-((day_of_year - 250) ** 2) / (2 * 12 ** 2))   # back-to-school
    )

    # Black Friday (4th Friday of November)
    black_friday_mask = (dates.month == 11) & (dates.dayofweek == 4) & (dates.day >= 22)
    yearly[black_friday_mask] += 1.5

    base = trend * yearly * weekly
    noise = rng.normal(1.0, 0.12, len(dates))
    qty = np.clip(np.round(base * noise), 1, None).astype(int)

    return pd.DataFrame({"date": dates.strftime("%Y-%m-%d"), "quantity": qty})


# ─── Coffee / food ───────────────────────────────────────────────────────────
# 3.5 years daily, stable growth, strong weekly (Mon-Fri work pattern), winter boost
def gen_coffee():
    dates = pd.date_range("2022-01-01", periods=1277, freq="D")
    t = np.arange(len(dates))

    trend = 70 + t * (15 / 1277)                   # 70 → 85 units over 3.5 years

    # Weekly: strong Mon–Fri (coffee at work), low weekend
    dow = dates.dayofweek.values
    weekly_factor = np.where(dow < 5, 1.15, 0.65)  # weekday vs weekend

    # Monthly seasonality: winter higher (warm drinks), summer lower
    month = dates.month.values
    monthly = 1.0 + 0.18 * np.cos(2 * np.pi * (month - 1) / 12)  # peak Jan

    base = trend * weekly_factor * monthly
    noise = rng.normal(1.0, 0.08, len(dates))
    qty = np.clip(np.round(base * noise), 1, None).astype(int)

    return pd.DataFrame({"date": dates.strftime("%Y-%m-%d"), "quantity": qty})


# ─── Sports nutrition ─────────────────────────────────────────────────────────
# 4 years daily, moderate trend, summer fitness peak + Jan NY-resolution boost
# Designed for balanced Prophet/LSTM ensemble (alpha ~0.4–0.6)
def gen_sports():
    rng2 = np.random.default_rng(123)
    dates = pd.date_range("2021-01-01", periods=1461, freq="D")
    t = np.arange(len(dates))
    n = len(dates)

    trend = 60 + 20 * (t / n)                           # 60 → 80 units (+33%)

    # Weekly: gym training pattern — moderate spread (not as extreme as coffee)
    dow = dates.dayofweek.values
    weekly = np.select(
        [dow == 0, dow == 1, dow == 2, dow == 3, dow == 4, dow == 5],
        [1.08,     0.95,     1.08,     0.95,     1.06,     0.88],
        default=0.82,  # Sunday
    )

    # Annual: summer fitness peak (Jul 4) + small Jan New-Year-resolution boost
    doy = dates.dayofyear.values
    annual = 1.0 + 0.15 * np.cos(2 * np.pi * (doy - 185) / 365)
    annual += 0.08 * np.exp(-((doy - 12) ** 2) / (2 * 10 ** 2))

    base = trend * weekly * annual
    noise = rng2.normal(1.0, 0.07, n)
    qty = np.clip(np.round(base * noise), 1, None).astype(int)

    return pd.DataFrame({"date": dates.strftime("%Y-%m-%d"), "quantity": qty})


# ─── Vitamins D3+K2 ───────────────────────────────────────────────────────────
# 3 years daily, winter peak, AR(7,14) autoregressive structure
# Designed so LSTM is competitive with Prophet → balanced ensemble alpha ~0.4-0.5
def gen_vitamins():
    rng3 = np.random.default_rng(77)
    dates = pd.date_range("2021-01-01", "2023-12-31", freq="D")
    n = len(dates)
    t = np.arange(n)

    trend = 48 + 6 * (t / n)

    doy = np.array([d.timetuple().tm_yday for d in dates])
    seasonal = 8 * np.cos(2 * np.pi * (doy - 15) / 365)   # reduced: 10 → 8

    dow = np.array([d.dayofweek for d in dates])
    weekly = np.select(                                     # stronger: 0.82–1.18
        [dow == 0, dow == 1, dow == 2, dow == 3, dow == 4, dow == 5],
        [1.18,     1.14,     1.06,     0.97,     0.91,     0.87],
        default=0.82,
    )

    base = (trend + seasonal) * weekly

    noise = rng3.normal(0, 2.0, n)                          # reduced: 3.5 → 2.0
    sales = np.zeros(n)
    for i in range(n):
        if i < 14:
            sales[i] = base[i] + noise[i]
        else:
            ar7  = 0.12 * (sales[i - 7]  - base[i - 7])   # reduced: 0.30 → 0.12
            ar14 = 0.08 * (sales[i - 14] - base[i - 14])   # reduced: 0.20 → 0.08
            sales[i] = base[i] + ar7 + ar14 + noise[i]

    sales = np.maximum(sales, 15)
    return pd.DataFrame({"date": dates.strftime("%Y-%m-%d"),
                         "quantity": sales.round().astype(int)})


if __name__ == "__main__":
    _save(gen_electronics(), "test_electronics.csv")
    _save(gen_coffee(), "test_coffee.csv")
    _save(gen_sports(), "test_sports.csv")
    _save(gen_vitamins(), "test_vitamins.csv")
    print("Done.")
