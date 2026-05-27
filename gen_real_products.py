"""
Generate 2 realistic sales datasets based on REAL Kyiv historical weather
(Open-Meteo archive API, same endpoint as the forecasting pipeline).

Because the pipeline fetches the same weather for training, correlations are
genuine - MAPE actually drops when weather regressors are enabled.

Products:
  1. sports_drink.csv  -- isotonic drinks
       Weather: temperature (positive correlation, summer peak)
       Wikipedia keyword: Sports_drink
       LSTM edge: AR(7) weekly restock + daily temp variation

  2. cold_medicine.csv -- cold & flu remedies
       Weather: temperature (negative) + precipitation (positive) -> winter peak
       Wikipedia keyword: Common_cold
       LSTM edge: AR(14) biweekly purchase cycle + weather daily variation

Target properties for balanced ensemble (alpha ~0.4-0.6):
  - ratio max/min < 3.2:1  (MinMaxScaler friendly)
  - weekly SNR > 3.0        (LSTM learns weekly cycle)
  - AR coefficient 0.13-0.18 (LSTM sees memory, Prophet cannot)
"""

import sys
import numpy as np
import pandas as pd
import requests
from pathlib import Path

rng = np.random.default_rng(42)
OUT = Path(__file__).parent

START = "2021-01-01"
END   = "2023-12-31"
LAT, LON = 50.4501, 30.5234   # Kyiv -- same as pipeline default


# --- Weather -----------------------------------------------------------------

def fetch_kyiv_weather() -> pd.DataFrame:
    print("Fetching real Kyiv weather from Open-Meteo archive...")
    r = requests.get(
        "https://archive-api.open-meteo.com/v1/archive",
        params={
            "latitude": LAT, "longitude": LON,
            "start_date": START, "end_date": END,
            "daily": "temperature_2m_max,precipitation_sum",
            "timezone": "Europe/Kiev",
        },
        timeout=30,
    )
    r.raise_for_status()
    d = r.json()["daily"]
    df = pd.DataFrame({
        "date":          pd.to_datetime(d["time"]),
        "temperature":   [float(x) if x is not None else 0.0 for x in d["temperature_2m_max"]],
        "precipitation": [float(x) if x is not None else 0.0 for x in d["precipitation_sum"]],
    })
    print(f"  {len(df)} rows | temp {df.temperature.min():.1f}..{df.temperature.max():.1f}C "
          f"| precip max {df.precipitation.max():.1f} mm")
    return df


# --- Product 1: Sports / isotonic drinks -------------------------------------

def gen_sports_drink(w: pd.DataFrame) -> pd.DataFrame:
    """
    Isotonic drinks, Kyiv 2021-2023.

    Mechanism: people buy cold drinks on hot days and restock weekly after gym.
    Pipeline regressors: temperature (positive correlation expected).
    Wikipedia: 'Sports_drink' -- article views peak in summer.
    """
    n = len(w)
    t = np.arange(n)

    # Trend: growing sports nutrition market
    trend = 52.0 + 10.0 * (t / n)          # 52 -> 62 units/day

    # Temperature effect: weaker coefficient (7 vs 13) so Prophet can compete
    temp_effect = 7.0 * np.tanh((w["temperature"].values - 18.0) / 12.0)
    # Range: ~-7 (bitter cold) .. +7 (heat wave)

    # Hot-day bonus: extra boost above 20 C (outdoor activities spike)
    temp_v = w["temperature"].values
    hot_bonus = 2.0 * np.clip((temp_v - 20.0) / 10.0, 0.0, 1.0)
    # Range: 0 (below 20C) .. +2 (above 30C)

    # Explicit annual cosine — Prophet captures this with yearly_seasonality
    # LSTM must learn it implicitly from 30-day window (harder)
    doy = w["date"].dt.dayofyear.values
    annual_cycle = 6.0 * np.cos(2 * np.pi * (doy - 185) / 365)  # peak ~Jul 4

    # Additive weekly pattern (centred near 0, spread = 17 units)
    #   Mon  Tue  Wed  Thu  Fri  Sat  Sun
    dow = w["date"].dt.dayofweek.values
    weekly_add = np.select(
        [dow == 0, dow == 1, dow == 2, dow == 3, dow == 4, dow == 5],
        [  +1.0,    -4.0,    -5.0,    -2.0,    +5.0,   +12.0],
        default=+11.0,   # Sunday
    )
    # Weekly amplitude = (12 - (-5)) / 2 = 8.5;  SNR = 8.5 / 2.5 = 3.4

    base = trend + temp_effect + hot_bonus + annual_cycle

    # AR(7): gym-goers buy a box on Saturday -> restock next Saturday, etc.
    noise = rng.normal(0.0, 2.5, n)
    sales = np.zeros(n)
    for i in range(n):
        b = base[i] + weekly_add[i]
        if i < 7:
            sales[i] = b + noise[i]
        else:
            ar7 = 0.10 * (sales[i - 7] - (base[i - 7] + weekly_add[i - 7]))
            sales[i] = b + ar7 + noise[i]

    sales = np.maximum(sales, 15.0)
    return pd.DataFrame({
        "date":     w["date"].dt.strftime("%Y-%m-%d"),
        "quantity": sales.round().astype(int),
    })


# --- Product 2: Cold & flu medicine ------------------------------------------

def gen_cold_medicine(w: pd.DataFrame) -> pd.DataFrame:
    """
    Cold & flu over-the-counter remedies, Kyiv 2021-2023.

    Mechanism: illness risk rises on cold/rainy days; people buy a pack that
    lasts ~2 weeks (biweekly purchase cycle = AR(14)).
    Pipeline regressors: temperature (negative), precipitation (positive).
    Wikipedia: 'Common_cold' -- article views spike Nov-Feb.
    """
    n = len(w)
    t = np.arange(n)

    # Trend: stable market with slight growth
    trend = 42.0 + 5.0 * (t / n)           # 42 -> 47 units/day

    # Cold effect: more colds when temperatures are low
    temp_cold = -9.0 * np.tanh((w["temperature"].values - 10.0) / 12.0)
    # Cold day (-10 C): +8.5 | Hot day (+32 C): -8.6

    # Precipitation: wet weather -> people gather indoors -> more transmission
    precip_effect = 3.0 * np.tanh(w["precipitation"].values / 4.0)
    # 0 mm -> 0 | >= 4 mm -> ~+3

    # Additive weekly: weekdays higher (pharmacy visits after work)
    #   Mon  Tue  Wed  Thu  Fri  Sat  Sun
    dow = w["date"].dt.dayofweek.values
    weekly_add = np.select(
        [dow == 0, dow == 1, dow == 2, dow == 3, dow == 4, dow == 5],
        [  +5.0,    +4.0,    +2.0,     0.0,     -2.0,    -6.0],
        default=-7.0,   # Sunday
    )
    # Weekly amplitude = (5 - (-7)) / 2 = 6;  SNR = 6 / 1.8 = 3.3

    base = trend + temp_cold + precip_effect

    # AR(14): one pack ~ 2 weeks, biweekly restocking cycle
    noise = rng.normal(0.0, 1.8, n)
    sales = np.zeros(n)
    for i in range(n):
        b = base[i] + weekly_add[i]
        if i < 14:
            sales[i] = b + noise[i]
        else:
            ar14 = 0.18 * (sales[i - 14] - (base[i - 14] + weekly_add[i - 14]))
            sales[i] = b + ar14 + noise[i]

    sales = np.maximum(sales, 10.0)
    return pd.DataFrame({
        "date":     w["date"].dt.strftime("%Y-%m-%d"),
        "quantity": sales.round().astype(int),
    })


# --- Stats helper ------------------------------------------------------------

def _report(df: pd.DataFrame, name: str, wiki_keyword: str):
    q = df["quantity"]
    df2 = df.copy()
    df2["dow"] = pd.to_datetime(df2["date"]).dt.dayofweek
    dow_amp = (df2.groupby("dow")["quantity"].mean().max()
               - df2.groupby("dow")["quantity"].mean().min()) / 2
    snr = dow_amp / q.std()
    ratio = q.max() / q.min()

    path = OUT / f"{name}.csv"
    df.to_csv(path, index=False)

    ok = "[OK]  " if (snr > 3.0 and ratio < 3.5) else "[WARN]"
    print(
        f"{ok} {name}.csv: {len(df)} rows | qty [{q.min()}, {q.max()}] "
        f"| ratio {ratio:.2f}:1 | SNR {snr:.2f} | mean {q.mean():.1f} +- {q.std():.1f}"
    )
    print(f"       Wikipedia keyword: '{wiki_keyword}'")


# --- Main --------------------------------------------------------------------

if __name__ == "__main__":
    try:
        weather = fetch_kyiv_weather()
    except Exception as e:
        print(f"ERROR fetching weather: {e}")
        sys.exit(1)

    sd = gen_sports_drink(weather)
    cm = gen_cold_medicine(weather)

    print()
    _report(sd, "sports_drink",  "Sports_drink")
    _report(cm, "cold_medicine", "Common_cold")

    print()
    print("=== App setup =====================================================")
    print("Create TWO products in the app, then upload:")
    print()
    print("  Product 1: Izotonichnyy napiy (isotonic drinks)")
    print("    CSV:      sports_drink.csv")
    print("    Keyword:  Sports_drink")
    print("    Lat/Lon:  50.4501 / 30.5234  (Kyiv)")
    print()
    print("  Product 2: Liky vid zastud (cold medicine)")
    print("    CSV:      cold_medicine.csv")
    print("    Keyword:  Common_cold")
    print("    Lat/Lon:  50.4501 / 30.5234  (Kyiv)")
    print()
    print("  For each -> Forecast -> Ensemble -> Weather ON + Trends ON")
    print("===================================================================")
