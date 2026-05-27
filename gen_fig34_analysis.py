"""
Time series analysis for diploma Section 3.2 / 2.X
Generates:
  fig34_timeseries.png   — raw series with trend overlay
  fig35_acf_pacf.png     — ACF + PACF (confirm weekly/yearly lags)
  fig36_decomposition.png — STL decomposition (trend + seasonal + residual)

Usage:
  python gen_fig34_analysis.py                   # uses test_electronics.csv
  python gen_fig34_analysis.py test_coffee.csv
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from statsmodels.tsa.stattools import adfuller, acf, pacf
from statsmodels.tsa.seasonal import STL

# ── Config ────────────────────────────────────────────────────────────────────
BASE = Path(__file__).parent
csv_name = sys.argv[1] if len(sys.argv) > 1 else "test_electronics.csv"
csv_path = BASE / csv_name
label = csv_name.replace("test_", "").replace(".csv", "").capitalize()

df = pd.read_csv(csv_path, parse_dates=["date"])
df = df.sort_values("date").reset_index(drop=True)
qty = df["quantity"].values.astype(float)
dates = df["date"]

# ── ADF stationarity test ─────────────────────────────────────────────────────
adf_result = adfuller(qty, autolag="AIC")
adf_stat, adf_p = adf_result[0], adf_result[1]
is_stationary = adf_p < 0.05
print(f"\nADF test ({label}):")
print(f"  ADF statistic = {adf_stat:.4f}")
print(f"  p-value       = {adf_p:.4f}")
print(f"  Conclusion    : {'STATIONARY' if is_stationary else 'NON-STATIONARY'} at 5% significance")
print(f"  => {'No differencing needed' if is_stationary else 'Series has unit root / trend => Prophet & LSTM handle non-stationarity internally'}")

# ── Fig 34: Time series with rolling trend ────────────────────────────────────
fig, ax = plt.subplots(figsize=(14, 4))
ax.plot(dates, qty, color="#4A90D9", linewidth=0.8, alpha=0.75, label="Щоденні продажі")
roll = pd.Series(qty).rolling(30, center=True).mean()
ax.plot(dates, roll, color="#E05C5C", linewidth=2.0, label="Ковзне середнє (30 днів)")
ax.set_title(f"Часовий ряд продажів — {label}", fontsize=14, pad=10)
ax.set_xlabel("Дата")
ax.set_ylabel("Кількість, од.")
ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
ax.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
plt.xticks(rotation=30)
ax.legend(fontsize=10)
ax.grid(True, alpha=0.3)

stat_label = (
    f"ADF p={adf_p:.3f} → {'Стаціонарний' if is_stationary else 'Нестаціонарний'}"
)
ax.text(0.01, 0.97, stat_label, transform=ax.transAxes,
        fontsize=9, verticalalignment="top",
        bbox=dict(boxstyle="round,pad=0.3", facecolor="lightyellow", alpha=0.8))

plt.tight_layout()
out34 = BASE / "fig34_timeseries.png"
plt.savefig(out34, dpi=150, bbox_inches="tight")
plt.close()
print(f"\nSaved {out34}")

# ── Fig 35: ACF + PACF ────────────────────────────────────────────────────────
nlags = 60
acf_vals = acf(qty, nlags=nlags, fft=True)
pacf_vals = pacf(qty, nlags=nlags, method="ols")
ci = 1.96 / np.sqrt(len(qty))

fig, axes = plt.subplots(1, 2, figsize=(14, 4))
for ax, vals, title in zip(axes, [acf_vals, pacf_vals], ["ACF", "PACF"]):
    lags = np.arange(len(vals))
    ax.bar(lags, vals, color="#4A90D9", alpha=0.75, width=0.6)
    ax.axhline(ci,  color="red", linestyle="--", linewidth=1, label=f"95% CI (±{ci:.3f})")
    ax.axhline(-ci, color="red", linestyle="--", linewidth=1)
    ax.axhline(0, color="black", linewidth=0.8)
    # Mark weekly lags
    for lag in [7, 14, 21, 28]:
        ax.axvline(lag, color="orange", linewidth=0.7, alpha=0.6)
    ax.set_title(f"{title} — {label}", fontsize=12)
    ax.set_xlabel("Лаг (дні)")
    ax.set_ylabel("Кореляція")
    ax.set_xlim(-0.5, nlags + 0.5)
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.25)

plt.tight_layout()
out35 = BASE / "fig35_acf_pacf.png"
plt.savefig(out35, dpi=150, bbox_inches="tight")
plt.close()
print(f"Saved {out35}")

# ── Fig 36: STL Decomposition ─────────────────────────────────────────────────
stl = STL(pd.Series(qty, index=dates), period=7, robust=True)
res = stl.fit()

fig, axes = plt.subplots(4, 1, figsize=(14, 10), sharex=True)
components = [
    (qty,          "Вихідний ряд",   "#4A90D9"),
    (res.trend,    "Тренд",          "#E05C5C"),
    (res.seasonal, "Сезонність",     "#50B86C"),
    (res.resid,    "Залишки",        "#9B59B6"),
]
for ax, (data, title, color) in zip(axes, components):
    ax.plot(dates, data, color=color, linewidth=0.9)
    ax.set_ylabel(title, fontsize=10)
    ax.grid(True, alpha=0.25)
    if title == "Залишки":
        ax.axhline(0, color="black", linewidth=0.8, linestyle="--")

axes[0].set_title(f"STL-декомпозиція часового ряду — {label}", fontsize=13, pad=8)
axes[-1].set_xlabel("Дата")
axes[-1].xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
axes[-1].xaxis.set_major_locator(mdates.MonthLocator(interval=3))
plt.xticks(rotation=30)
plt.tight_layout()
out36 = BASE / "fig36_decomposition.png"
plt.savefig(out36, dpi=150, bbox_inches="tight")
plt.close()
print(f"Saved {out36}")

print("\nAll figures generated successfully.")
