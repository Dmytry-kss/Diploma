import os
import random
import warnings
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

warnings.filterwarnings("ignore")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

LOOKBACK = 30
_SEED = 42


def _set_seeds():
    random.seed(_SEED)
    np.random.seed(_SEED)
    import tensorflow as tf
    tf.random.set_seed(_SEED)


def _build_sequences(data: np.ndarray, lookback: int):
    """Build (X, y) sequences.

    For external regressors (columns 1+), the last position in each sequence
    is replaced with the CURRENT step's values so LSTM can use today's weather
    to predict today's quantity — not yesterday's.
    """
    X, y = [], []
    for i in range(lookback, len(data)):
        seq = data[i - lookback:i].copy()
        if data.shape[1] > 1:
            seq[-1, 1:] = data[i, 1:]  # today's ext features in last window slot
        X.append(seq)
        y.append(data[i, 0])
    return np.array(X), np.array(y)


def train_predict_lstm(
    hist_df: pd.DataFrame,
    horizon: int,
    regressors: list | None = None,
    future_regressors_df: pd.DataFrame | None = None,
) -> dict:
    _set_seeds()

    import tensorflow as tf
    tf.get_logger().setLevel("ERROR")
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import LSTM, Dense, Dropout
    from tensorflow.keras.callbacks import EarlyStopping

    regressors = regressors or []
    feature_cols = ["quantity"] + [r for r in regressors if r in hist_df.columns]
    n_features = len(feature_cols)

    series = hist_df[feature_cols].values.astype(float)
    n = len(series)
    last_date = pd.to_datetime(hist_df["date"].iloc[-1])
    future_dates = pd.date_range(start=last_date + pd.Timedelta(days=1), periods=horizon, freq="D")

    if n < LOOKBACK + 10:
        mean_val = float(np.mean(series[:, 0])) if n > 0 else 0.0
        return {
            "predictions": [
                {"date": d.date().isoformat(), "predicted": mean_val,
                 "lower": max(0.0, mean_val * 0.8), "upper": mean_val * 1.2}
                for d in future_dates
            ]
        }

    scaler = MinMaxScaler()
    scaled = scaler.fit_transform(series)

    X_all, y_all = _build_sequences(scaled, LOOKBACK)

    model = Sequential([
        LSTM(64, return_sequences=True, input_shape=(LOOKBACK, n_features)),
        Dropout(0.2),
        LSTM(32),
        Dropout(0.2),
        Dense(1),
    ])
    model.compile(optimizer="adam", loss="mse")
    model.fit(
        X_all, y_all,
        epochs=100,
        batch_size=16,
        validation_split=0.1,
        callbacks=[EarlyStopping(patience=10, restore_best_weights=True)],
        verbose=0,
    )

    future_ext = _get_future_external(
        feature_cols[1:], future_dates, future_regressors_df, hist_df
    )

    # Recursive prediction — inject current step's ext features BEFORE predicting
    # so LSTM uses today's precipitation/temperature (not yesterday's).
    last_seq = scaled[-LOOKBACK:].copy()
    future_scaled_qty = []
    for step in range(horizon):
        if n_features > 1:
            ext_raw = future_ext[step]
            dummy = np.zeros((1, n_features))
            dummy[0, 1:] = ext_raw
            dummy_scaled = scaler.transform(dummy)
            last_seq[-1, 1:] = dummy_scaled[0, 1:]

        x = last_seq.reshape(1, LOOKBACK, n_features)
        pred_scaled = float(model.predict(x, verbose=0)[0][0])
        future_scaled_qty.append(pred_scaled)

        next_row = np.zeros(n_features)
        next_row[0] = pred_scaled
        if n_features > 1:
            next_row[1:] = dummy_scaled[0, 1:]

        last_seq = np.vstack([last_seq[1:], next_row])

    qty_dummy = np.zeros((horizon, n_features))
    qty_dummy[:, 0] = future_scaled_qty
    future_vals = scaler.inverse_transform(qty_dummy)[:, 0]
    future_vals = np.clip(future_vals, 0.0, None)

    predictions = [
        {
            "date": d.date().isoformat(),
            "predicted": float(v),
            "lower": float(max(0.0, v * 0.8)),
            "upper": float(v * 1.2),
        }
        for d, v in zip(future_dates, future_vals)
    ]
    return {"predictions": predictions}


def _get_future_external(
    ext_cols: list,
    future_dates: pd.DatetimeIndex,
    future_regressors_df: pd.DataFrame | None,
    hist_df: pd.DataFrame,
) -> np.ndarray:
    """Return shape (horizon, len(ext_cols)) with raw future external values."""
    horizon = len(future_dates)
    result = np.zeros((horizon, len(ext_cols)))
    if not ext_cols:
        return result

    for i, col in enumerate(ext_cols):
        fallback = float(hist_df[col].iloc[-7:].mean()) if col in hist_df.columns else 0.0

        if future_regressors_df is not None and col in future_regressors_df.columns:
            fr = future_regressors_df.copy()
            fr["date"] = pd.to_datetime(fr["date"])
            fr = fr.set_index("date")[col]
            for step, dt in enumerate(future_dates):
                result[step, i] = fr.get(dt, fallback)
        else:
            result[:, i] = fallback

    return result
