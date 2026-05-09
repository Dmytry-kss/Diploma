import os
import warnings
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

warnings.filterwarnings("ignore")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

LOOKBACK = 30


def _build_sequences(data: np.ndarray, lookback: int):
    X, y = [], []
    for i in range(lookback, len(data)):
        X.append(data[i - lookback:i])
        y.append(data[i])
    return np.array(X), np.array(y)


def train_predict_lstm(hist_df: pd.DataFrame, horizon: int) -> dict:
    import tensorflow as tf
    tf.get_logger().setLevel("ERROR")
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import LSTM, Dense, Dropout
    from tensorflow.keras.callbacks import EarlyStopping

    series = hist_df["quantity"].values.astype(float)
    n = len(series)
    last_date = pd.to_datetime(hist_df["date"].iloc[-1])
    future_dates = pd.date_range(start=last_date + pd.Timedelta(days=1), periods=horizon, freq="D")

    if n < LOOKBACK + 10:
        mean_val = float(np.mean(series)) if n > 0 else 0.0
        return {
            "predictions": [
                {"date": d.date().isoformat(), "predicted": mean_val,
                 "lower": max(0.0, mean_val * 0.8), "upper": mean_val * 1.2}
                for d in future_dates
            ]
        }

    scaler = MinMaxScaler()
    scaled = scaler.fit_transform(series.reshape(-1, 1)).flatten()

    X_all, y_all = _build_sequences(scaled, LOOKBACK)
    X_all = X_all.reshape(-1, LOOKBACK, 1)

    model = Sequential([
        LSTM(64, return_sequences=True, input_shape=(LOOKBACK, 1)),
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

    # Recursive future prediction
    last_seq = scaled[-LOOKBACK:].copy()
    future_scaled = []
    for _ in range(horizon):
        x = last_seq.reshape(1, LOOKBACK, 1)
        pred = float(model.predict(x, verbose=0)[0][0])
        future_scaled.append(pred)
        last_seq = np.append(last_seq[1:], pred)

    future_vals = scaler.inverse_transform(
        np.array(future_scaled).reshape(-1, 1)
    ).flatten()
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
