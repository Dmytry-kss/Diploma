import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


def compute_metrics(y_true, y_pred) -> dict:
    y_true = np.array(y_true, dtype=float)
    y_pred = np.array(y_pred, dtype=float)
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mask = y_true != 0
    mape = float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100) if mask.any() else 0.0
    r2 = float(r2_score(y_true, y_pred))
    return {"mae": mae, "rmse": rmse, "mape": mape, "r2": r2}


def compute_adequacy_metrics(y_true, y_pred) -> dict:
    """Residual diagnostics: mean/std of errors + Ljung-Box test for autocorrelation."""
    from statsmodels.stats.diagnostic import acorr_ljungbox
    residuals = np.array(y_true, dtype=float) - np.array(y_pred, dtype=float)
    ljung_box_p = None
    try:
        lb_df = acorr_ljungbox(residuals, lags=[10], return_df=True)
        ljung_box_p = float(lb_df["lb_pvalue"].iloc[0])
    except Exception:
        pass
    return {
        "residual_mean": float(np.mean(residuals)),
        "residual_std":  float(np.std(residuals)),
        "ljung_box_p":   ljung_box_p,
    }
