import numpy as np
from scipy.optimize import minimize_scalar
from typing import List, Tuple


def combine_ensemble(
    prophet_future: List[dict],
    lstm_future: List[dict],
    prophet_val_preds: List[float],
    lstm_val_preds: List[float],
    y_val: np.ndarray,
) -> Tuple[List[dict], float]:
    """Find optimal blending weight alpha (Prophet) vs (1-alpha) (LSTM) on validation set."""
    p_val = np.array(prophet_val_preds, dtype=float)
    l_val = np.array(lstm_val_preds, dtype=float)
    y = np.array(y_val, dtype=float)

    min_len = min(len(p_val), len(l_val), len(y))
    p_val, l_val, y = p_val[-min_len:], l_val[-min_len:], y[-min_len:]

    def mae_loss(alpha: float) -> float:
        return float(np.mean(np.abs(y - (alpha * p_val + (1 - alpha) * l_val))))

    result = minimize_scalar(mae_loss, bounds=(0.20, 0.80), method="bounded")
    alpha = float(result.x)

    n = min(len(prophet_future), len(lstm_future))
    blended = []
    for i in range(n):
        p = prophet_future[i]
        lp = lstm_future[i]
        pred = alpha * p["predicted"] + (1 - alpha) * lp["predicted"]
        lower = alpha * p.get("lower", pred * 0.8) + (1 - alpha) * lp.get("lower", pred * 0.8)
        upper = alpha * p.get("upper", pred * 1.2) + (1 - alpha) * lp.get("upper", pred * 1.2)
        blended.append({
            "date": p["date"],
            "predicted": max(0.0, pred),
            "lower": max(0.0, lower),
            "upper": max(0.0, upper),
        })

    return blended, alpha
