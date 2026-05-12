import uuid
import asyncio
import logging
from functools import partial
import numpy as np
import pandas as pd
from datetime import date, timedelta
from supabase import Client

logger = logging.getLogger(__name__)

from app.services.open_meteo import fetch_weather
from app.services.google_trends import fetch_trends
from app.services.feature_eng import build_feature_matrix
from app.ml.prophet_model import train_predict_prophet
from app.ml.lstm_model import train_predict_lstm
from app.ml.ensemble import combine_ensemble
from app.ml.metrics import compute_metrics

MIN_ROWS = 14
LSTM_MIN_ROWS = 60


async def run_forecast_pipeline(
    product_id: str,
    forecast_id: str,
    horizon_days: int,
    model_type: str,
    include_weather: bool,
    include_trends: bool,
    supabase: Client,
):
    try:
        await _run(product_id, forecast_id, horizon_days, model_type,
                   include_weather, include_trends, supabase)
    except Exception as exc:
        supabase.table("forecasts").update({"status": "failed"}).eq("id", forecast_id).execute()
        raise exc


async def _run(product_id, forecast_id, horizon_days, model_type,
               include_weather, include_trends, supabase):

    # ── 1. Sales data ────────────────────────────────────────────────────────
    sales_result = (
        supabase.table("sales")
        .select("date,quantity")
        .eq("product_id", product_id)
        .order("date")
        .execute()
    )
    if not sales_result.data:
        raise ValueError("No sales data found for product")

    sales_df = pd.DataFrame(sales_result.data)
    sales_df["quantity"] = pd.to_numeric(sales_df["quantity"], errors="coerce").fillna(0.0)
    sales_df = sales_df.sort_values("date").reset_index(drop=True)

    if len(sales_df) < MIN_ROWS:
        raise ValueError(f"Need at least {MIN_ROWS} days of sales data")

    # ── 2. Product metadata ──────────────────────────────────────────────────
    product_result = (
        supabase.table("products")
        .select("latitude,longitude,search_keyword")
        .eq("id", product_id)
        .single()
        .execute()
    )
    product = product_result.data or {}
    lat = float(product.get("latitude") or 50.4501)
    lon = float(product.get("longitude") or 30.5234)
    keyword = product.get("search_keyword") or ""

    # ── 3. Date ranges ───────────────────────────────────────────────────────
    hist_start = sales_df["date"].iloc[0]
    today_str = date.today().isoformat()
    future_end = (date.today() + timedelta(days=horizon_days)).isoformat()

    # ── 4. External data — fetch from API, fallback to cache ─────────────────
    weather_df = pd.DataFrame(columns=["date", "temperature", "precipitation", "uv_index"])
    if include_weather:
        try:
            weather_df = await fetch_weather(lat, lon, hist_start, future_end)
        except Exception:
            weather_df, _ = _load_cached_external_features(supabase, product_id, hist_start, future_end)

    trends_df = pd.DataFrame(columns=["date", "search_interest"])
    if include_trends and keyword:
        try:
            loop = asyncio.get_event_loop()
            trends_df = await loop.run_in_executor(
                None, partial(fetch_trends, keyword, hist_start, today_str)
            )
        except Exception:
            _, trends_df = _load_cached_external_features(supabase, product_id, hist_start, today_str)

    # Persist fetched data to cache (upsert)
    _save_external_features(supabase, product_id, weather_df, trends_df)

    # ── 5. Historical feature matrix ─────────────────────────────────────────
    hist_weather = (
        weather_df[weather_df["date"] <= today_str].copy()
        if not weather_df.empty else weather_df
    )
    hist_df = build_feature_matrix(sales_df, hist_weather, trends_df)
    n = len(hist_df)

    # ── 6. Active regressors ─────────────────────────────────────────────────
    regressors = []
    if include_weather and not weather_df.empty:
        regressors += [c for c in ["temperature", "precipitation", "uv_index"] if c in hist_df.columns]
    if include_trends and not trends_df.empty and "search_interest" in hist_df.columns:
        regressors.append("search_interest")

    # ── 7. Future regressor dataframe ────────────────────────────────────────
    future_dates_range = pd.date_range(
        start=date.today() + timedelta(days=1), periods=horizon_days, freq="D"
    )
    future_df = pd.DataFrame({"date": [d.strftime("%Y-%m-%d") for d in future_dates_range]})

    if regressors and not weather_df.empty:
        future_weather = weather_df[weather_df["date"] > today_str].copy()
        if not future_weather.empty:
            future_df = future_df.merge(
                future_weather[["date", "temperature", "precipitation", "uv_index"]],
                on="date", how="left",
            )
        for col in ["temperature", "precipitation", "uv_index"]:
            if col not in future_df.columns:
                future_df[col] = float(hist_df[col].mean()) if col in hist_df.columns else 0.0
            else:
                fallback = float(hist_df[col].mean()) if col in hist_df.columns else 0.0
                future_df[col] = future_df[col].fillna(fallback)

    if "search_interest" in regressors:
        future_df["search_interest"] = float(hist_df["search_interest"].iloc[-7:].mean())

    # ── 8. Train/val split ───────────────────────────────────────────────────
    # Keep last min(30, 20%) rows as validation
    val_size = max(7, min(30, int(n * 0.2)))
    split = n - val_size
    train_hist = hist_df.iloc[:split].copy()
    val_actuals = hist_df["quantity"].values[split:]

    # Regressors for the val period (already in hist_df)
    val_future_df = hist_df.iloc[split:][["date"] + [c for c in regressors if c in hist_df.columns]].copy()
    val_future_df["date"] = pd.to_datetime(val_future_df["date"]).dt.strftime("%Y-%m-%d")

    # ── 9. Train models ──────────────────────────────────────────────────────
    use_lstm = model_type in ("lstm", "ensemble") and n >= LSTM_MIN_ROWS
    use_prophet = model_type in ("prophet", "ensemble") or (model_type == "lstm" and not use_lstm)

    prophet_val_preds = None
    lstm_val_preds = None
    prophet_final = None
    lstm_final = None

    loop = asyncio.get_event_loop()

    if use_prophet:
        # Prophet uses CmdStanPy which cannot run in a ThreadPoolExecutor — call directly
        p_val_result = train_predict_prophet(train_hist, val_size, regressors, val_future_df)
        prophet_val_preds = [p["predicted"] for p in p_val_result["predictions"]]
        prophet_final = train_predict_prophet(hist_df, horizon_days, regressors, future_df)

    if use_lstm:
        # Keras/TF also has issues with ThreadPoolExecutor — call directly
        l_val_result = train_predict_lstm(train_hist, val_size, regressors, val_future_df)
        lstm_val_preds = [p["predicted"] for p in l_val_result["predictions"]]
        lstm_final = train_predict_lstm(hist_df, horizon_days, regressors, future_df)

    # ── 10. Final predictions + alpha ────────────────────────────────────────
    if model_type == "ensemble" and prophet_final and lstm_final:
        final_preds, alpha = combine_ensemble(
            prophet_final["predictions"],
            lstm_final["predictions"],
            prophet_val_preds,
            lstm_val_preds,
            val_actuals,
        )
        min_len = min(len(prophet_val_preds), len(lstm_val_preds), len(val_actuals))
        val_preds = (
            alpha * np.array(prophet_val_preds[-min_len:])
            + (1 - alpha) * np.array(lstm_val_preds[-min_len:])
        )
        val_actuals_trimmed = val_actuals[-min_len:]
    elif prophet_final:
        final_preds = prophet_final["predictions"]
        alpha = 1.0
        min_len = min(len(prophet_val_preds), len(val_actuals))
        val_preds = np.array(prophet_val_preds[-min_len:])
        val_actuals_trimmed = val_actuals[-min_len:]
    else:
        final_preds = lstm_final["predictions"]
        alpha = 0.0
        min_len = min(len(lstm_val_preds), len(val_actuals))
        val_preds = np.array(lstm_val_preds[-min_len:])
        val_actuals_trimmed = val_actuals[-min_len:]

    # ── 11. Metrics ──────────────────────────────────────────────────────────
    metrics = compute_metrics(val_actuals_trimmed, val_preds)
    
    # Compute individual model metrics for comparison
    prophet_metrics = None
    lstm_metrics = None
    if prophet_val_preds and len(prophet_val_preds) > 0:
        min_len_p = min(len(prophet_val_preds), len(val_actuals))
        prophet_metrics = compute_metrics(val_actuals[-min_len_p:], np.array(prophet_val_preds[-min_len_p:]))
    if lstm_val_preds and len(lstm_val_preds) > 0:
        min_len_l = min(len(lstm_val_preds), len(val_actuals))
        lstm_metrics = compute_metrics(val_actuals[-min_len_l:], np.array(lstm_val_preds[-min_len_l:]))
    
    # Extract Prophet components
    prophet_components = prophet_final.get("prophet_components") if prophet_final else None

    # ── 12. Save forecast_values ─────────────────────────────────────────────
    values_rows = [
        {
            "id": str(uuid.uuid4()),
            "forecast_id": forecast_id,
            "date": pred["date"],
            "predicted_quantity": round(float(pred["predicted"]), 4),
            "lower_bound": round(float(max(0.0, pred.get("lower", 0.0))), 4),
            "upper_bound": round(float(pred.get("upper", pred["predicted"] * 1.2)), 4),
        }
        for pred in final_preds
    ]
    supabase.table("forecast_values").insert(values_rows).execute()

    # ── 13. SHAP values ──────────────────────────────────────────────────────
    shap_data = await loop.run_in_executor(
        None, partial(_compute_shap, hist_df, regressors)
    )
    if shap_data:
        shap_rows = [
            {
                "id": str(uuid.uuid4()),
                "forecast_id": forecast_id,
                "feature_name": feat,
                "shap_value": round(float(val), 6),
                "mean_abs_shap": round(float(abs(val)), 6),
            }
            for feat, val in shap_data.items()
        ]
        supabase.table("shap_values").insert(shap_rows).execute()

    # ── 14. Update forecast record ───────────────────────────────────────────
    update_data = {
        "status": "completed",
        "alpha": round(float(alpha), 4),
        "mae": round(metrics["mae"], 4),
        "rmse": round(metrics["rmse"], 4),
        "mape": round(metrics["mape"], 4),
        "r2": round(metrics["r2"], 4),
    }
    
    # Add individual model metrics as JSONB
    if prophet_metrics:
        update_data["prophet_metrics"] = {
            "mae": round(prophet_metrics["mae"], 4),
            "rmse": round(prophet_metrics["rmse"], 4),
            "mape": round(prophet_metrics["mape"], 4),
            "r2": round(prophet_metrics["r2"], 4),
        }
    if lstm_metrics:
        update_data["lstm_metrics"] = {
            "mae": round(lstm_metrics["mae"], 4),
            "rmse": round(lstm_metrics["rmse"], 4),
            "mape": round(lstm_metrics["mape"], 4),
            "r2": round(lstm_metrics["r2"], 4),
        }
    
    # Add Prophet components as JSONB
    if prophet_components:
        update_data["prophet_components"] = prophet_components
    
    supabase.table("forecasts").update(update_data).eq("id", forecast_id).execute()


def _save_external_features(supabase: Client, product_id: str, weather_df: pd.DataFrame, trends_df: pd.DataFrame) -> None:
    """Upsert fetched weather + trends into external_features cache."""
    if weather_df.empty and trends_df.empty:
        return

    merged = pd.DataFrame()
    if not weather_df.empty:
        merged = weather_df[["date", "temperature", "precipitation", "uv_index"]].copy()
        merged["date"] = pd.to_datetime(merged["date"]).dt.strftime("%Y-%m-%d")

    if not trends_df.empty:
        t = trends_df[["date", "search_interest"]].copy()
        t["date"] = pd.to_datetime(t["date"]).dt.strftime("%Y-%m-%d")
        if merged.empty:
            merged = t
        else:
            merged = merged.merge(t, on="date", how="outer")

    if merged.empty:
        return

    for col in ["temperature", "precipitation", "uv_index", "search_interest"]:
        if col not in merged.columns:
            merged[col] = None

    merged["product_id"] = product_id

    import math

    def _clean(v):
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return v

    # to_dict keeps float NaN as float('nan') which is not JSON-serialisable;
    # fix it at the dict level where None actually stays None
    raw_rows = merged[
        ["product_id", "date", "temperature", "precipitation", "uv_index", "search_interest"]
    ].to_dict(orient="records")
    rows = [{k: _clean(v) for k, v in rec.items()} for rec in raw_rows]

    try:
        supabase.table("external_features").upsert(rows, on_conflict="product_id,date").execute()
        logger.info("external_features: upserted %d rows for product %s", len(rows), product_id)
    except Exception as exc:
        logger.error("external_features: upsert failed — %s", exc)


def _load_cached_external_features(
    supabase: Client, product_id: str, start_date: str, end_date: str
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load cached external features; returns (weather_df, trends_df)."""
    empty_weather = pd.DataFrame(columns=["date", "temperature", "precipitation", "uv_index"])
    empty_trends = pd.DataFrame(columns=["date", "search_interest"])
    try:
        result = (
            supabase.table("external_features")
            .select("date,temperature,precipitation,uv_index,search_interest")
            .eq("product_id", product_id)
            .gte("date", start_date)
            .lte("date", end_date)
            .order("date")
            .execute()
        )
        if not result.data:
            return empty_weather, empty_trends

        df = pd.DataFrame(result.data)
        weather_cols = ["temperature", "precipitation", "uv_index"]
        trends_cols = ["search_interest"]

        weather_df = df[["date"] + weather_cols].dropna(subset=weather_cols, how="all")
        trends_df = df[["date"] + trends_cols].dropna(subset=trends_cols, how="all")

        return weather_df, trends_df
    except Exception:
        return empty_weather, empty_trends


def _compute_shap(hist_df: pd.DataFrame, regressors: list) -> dict:
    try:
        import shap
        from sklearn.ensemble import GradientBoostingRegressor

        feature_cols = [
            "day_of_week", "month", "week_of_year", "is_weekend",
            "lag_7", "lag_14", "lag_30", "rolling_7", "rolling_14",
        ] + regressors
        feature_cols = [c for c in feature_cols if c in hist_df.columns]

        X = hist_df[feature_cols].fillna(0.0).values
        y = hist_df["quantity"].values.astype(float)

        if len(X) < 20:
            return {}

        gbm = GradientBoostingRegressor(n_estimators=100, max_depth=4, random_state=42)
        gbm.fit(X, y)

        explainer = shap.TreeExplainer(gbm)
        shap_vals = explainer.shap_values(X)
        mean_abs = np.abs(shap_vals).mean(axis=0)
        return dict(zip(feature_cols, mean_abs.tolist()))
    except Exception:
        return {}
