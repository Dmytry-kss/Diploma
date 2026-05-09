import warnings
import pandas as pd
import numpy as np
from prophet import Prophet
from typing import List, Optional

warnings.filterwarnings("ignore")


def train_predict_prophet(
    hist_df: pd.DataFrame,
    horizon: int,
    regressors: List[str],
    future_regressors: Optional[pd.DataFrame] = None,
) -> dict:
    """Train Prophet on hist_df, predict `horizon` steps forward.

    future_regressors: DataFrame with columns [date, *regressors] for the forecast period.
    Returns predictions as list of {date, predicted, lower, upper}.
    """
    valid_regs = [r for r in regressors if r in hist_df.columns]

    train = hist_df[["date", "quantity"] + valid_regs].copy()
    train["date"] = pd.to_datetime(train["date"])
    train = train.rename(columns={"date": "ds", "quantity": "y"})

    model = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=False,
        interval_width=0.95,
        changepoint_prior_scale=0.05,
    )
    for reg in valid_regs:
        model.add_regressor(reg)

    model.fit(train)

    future = model.make_future_dataframe(periods=horizon, freq="D")

    # Fill regressor values: historical from train, future from future_regressors or mean
    for reg in valid_regs:
        hist_reg = train.set_index("ds")[reg]
        future = future.set_index("ds")
        future[reg] = hist_reg.reindex(future.index)

        if future_regressors is not None and reg in future_regressors.columns:
            fr = future_regressors.copy()
            fr["date"] = pd.to_datetime(fr["date"])
            fr_indexed = fr.set_index("date")[reg]
            mask_missing = future[reg].isna()
            future.loc[mask_missing, reg] = fr_indexed.reindex(
                future.index[mask_missing]
            ).values

        fallback = float(hist_reg.dropna().iloc[-7:].mean()) if len(hist_reg.dropna()) >= 7 else 0.0
        future[reg] = future[reg].fillna(fallback)
        future = future.reset_index()

    forecast = model.predict(future)
    hist_len = len(train)
    future_fc = forecast.iloc[hist_len:][["ds", "yhat", "yhat_lower", "yhat_upper"]]

    predictions = [
        {
            "date": row["ds"].date().isoformat(),
            "predicted": max(0.0, float(row["yhat"])),
            "lower": max(0.0, float(row["yhat_lower"])),
            "upper": max(0.0, float(row["yhat_upper"])),
        }
        for _, row in future_fc.iterrows()
    ]

    # Extract Prophet decomposition components (trend, seasonality)
    # Use iloc for proper indexing of future forecast rows
    future_forecast = forecast.iloc[hist_len:hist_len + len(future_fc)]
    
    prophet_components = {
        "dates": [d.date().isoformat() for d in future_fc["ds"]],
        "trend": future_forecast["trend"].tolist() if "trend" in future_forecast.columns else [0.0] * len(future_fc),
        "weekly": future_forecast["weekly"].tolist() if "weekly" in future_forecast.columns else [0.0] * len(future_fc),
        "yearly": future_forecast["yearly"].tolist() if "yearly" in future_forecast.columns else [0.0] * len(future_fc),
        "holidays": future_forecast["holidays"].tolist() if "holidays" in future_forecast.columns else [0.0] * len(future_fc),
    }

    # Mean absolute regressor contribution for SHAP-like reporting
    regressor_components = {}
    for reg in valid_regs:
        if reg in forecast.columns:
            regressor_components[reg] = float(np.abs(forecast[reg]).mean())

    return {
        "predictions": predictions,
        "components": regressor_components,
        "prophet_components": prophet_components,
    }
