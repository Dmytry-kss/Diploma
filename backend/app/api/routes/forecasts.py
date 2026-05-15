from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from app.db.models import ForecastRequest, ForecastOut, ForecastValueOut, SHAPValueOut
from app.db.supabase import get_supabase
from app.api.deps import get_current_user, get_user_product, get_user_forecast
from typing import List
import uuid

router = APIRouter()


@router.post("/run/{product_id}", status_code=202)
async def run_forecast(
    product_id: str,
    request: ForecastRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase()
    get_user_product(product_id, current_user["id"], supabase)

    forecast_id = str(uuid.uuid4())
    supabase.table("forecasts").insert({
        "id": forecast_id,
        "product_id": product_id,
        "model_type": request.model_type,
        "horizon_days": request.horizon_days,
        "status": "running",
    }).execute()

    from app.ml.pipeline import run_forecast_pipeline
    background_tasks.add_task(
        run_forecast_pipeline,
        product_id=product_id,
        forecast_id=forecast_id,
        horizon_days=request.horizon_days,
        model_type=request.model_type,
        include_weather=request.include_weather,
        include_trends=request.include_trends,
        supabase=supabase,
    )
    return {"forecast_id": forecast_id, "status": "running"}


@router.get("/{product_id}", response_model=List[ForecastOut])
def get_forecasts(product_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    get_user_product(product_id, current_user["id"], supabase)
    result = supabase.table("forecasts").select("*").eq("product_id", product_id).order("created_at", desc=True).execute()
    return result.data


@router.get("/{forecast_id}/status")
def get_forecast_status(forecast_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    forecast = get_user_forecast(forecast_id, current_user["id"], supabase)
    return {k: forecast[k] for k in ("id", "status", "mae", "rmse", "mape", "r2") if k in forecast}


@router.get("/{forecast_id}/values", response_model=List[ForecastValueOut])
def get_forecast_values(forecast_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    get_user_forecast(forecast_id, current_user["id"], supabase)
    result = supabase.table("forecast_values").select("*").eq("forecast_id", forecast_id).order("date").execute()
    return result.data


@router.get("/{forecast_id}/shap", response_model=List[SHAPValueOut])
def get_shap_values(forecast_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    get_user_forecast(forecast_id, current_user["id"], supabase)
    result = supabase.table("shap_values").select("*").eq("forecast_id", forecast_id).order("mean_abs_shap", desc=True).execute()
    return result.data


@router.get("/{forecast_id}/recommendations")
def get_recommendations(forecast_id: str, current_user: dict = Depends(get_current_user)):
    from app.db.models import RecommendationResponse
    import pandas as pd

    supabase = get_supabase()
    forecast = get_user_forecast(forecast_id, current_user["id"], supabase)

    values_result = supabase.table("forecast_values").select("*").eq("forecast_id", forecast_id).order("date").execute()
    if not values_result.data:
        raise HTTPException(status_code=404, detail="Forecast values not found")

    forecast_df = pd.DataFrame(values_result.data)
    forecast_df["date"] = pd.to_datetime(forecast_df["date"])

    product_id = forecast["product_id"]
    sales_result = supabase.table("sales").select("date,quantity").eq("product_id", product_id).order("date", desc=True).limit(7).execute()

    next_week_avg = forecast_df.head(7)["predicted_quantity"].mean()
    if sales_result.data and len(sales_result.data) > 0:
        prev_week_avg = pd.DataFrame(sales_result.data)["quantity"].mean()
    else:
        prev_week_avg = next_week_avg

    trend_percent = ((next_week_avg - prev_week_avg) / prev_week_avg * 100) if prev_week_avg > 0 else 0.0

    if trend_percent > 5:
        trend_direction = "growing"
    elif trend_percent < -5:
        trend_direction = "declining"
    else:
        trend_direction = "stable"

    mape = forecast.get("mape", 0.0) or 0.0
    if mape < 10:
        risk_level = "low"
    elif mape < 20:
        risk_level = "medium"
    else:
        risk_level = "high"

    recommendations = []
    if trend_direction == "growing" and risk_level == "low":
        recommendations = [
            "Demand is steadily growing — consider increasing your next order by 15–20%",
            "Explore expanding your product range with complementary items",
        ]
    elif trend_direction == "growing" and risk_level == "medium":
        recommendations = [
            "Demand is growing, but forecast accuracy is moderate — increase stock gradually",
            "Monitor sales weekly to validate the upward trend",
        ]
    elif trend_direction == "growing" and risk_level == "high":
        recommendations = [
            "Demand is growing, but forecast accuracy is low — be cautious with inventory increases",
            "Improve data quality and extend sales history to boost model accuracy",
        ]
    elif trend_direction == "declining" and risk_level == "low":
        recommendations = [
            "Demand decline is forecast — reduce your next order by 10–15%",
            "Consider a promotional campaign to clear existing inventory",
        ]
    elif trend_direction == "declining":
        recommendations = [
            "Demand is declining — reduce order quantities accordingly",
            "Consider marketing activities to stimulate sales",
        ]
    elif trend_direction == "stable" and risk_level == "low":
        recommendations = [
            "Demand is stable — maintain current order levels",
            "Good time to optimise warehouse and carrying costs",
        ]
    else:
        recommendations = [
            "Demand is stable — maintain current order levels",
            "Monitor the market for any emerging changes",
        ]

    return RecommendationResponse(
        forecast_id=forecast_id,
        trend_direction=trend_direction,
        trend_percent=round(trend_percent, 2),
        risk_level=risk_level,
        recommendations=recommendations,
    )


@router.get("/{forecast_id}/export")
def export_forecast(forecast_id: str, current_user: dict = Depends(get_current_user)):
    from fastapi.responses import StreamingResponse
    import pandas as pd
    import io

    supabase = get_supabase()
    get_user_forecast(forecast_id, current_user["id"], supabase)

    values_result = supabase.table("forecast_values").select("*").eq("forecast_id", forecast_id).order("date").execute()
    if not values_result.data:
        raise HTTPException(status_code=404, detail="Forecast not found")

    df = pd.DataFrame(values_result.data)
    df = df[["date", "predicted_quantity", "lower_bound", "upper_bound"]]
    df = df.rename(columns={
        "predicted_quantity": "ensemble",
        "lower_bound": "lower",
        "upper_bound": "upper"
    })
    df["actual"] = None
    df["prophet"] = None
    df["lstm"] = None
    df = df[["date", "actual", "prophet", "lstm", "ensemble", "lower", "upper"]]

    stream = io.StringIO()
    df.to_csv(stream, index=False)
    stream.seek(0)

    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=forecast_{forecast_id}.csv"}
    )


@router.get("/{forecast_id}/components")
def get_components(forecast_id: str, current_user: dict = Depends(get_current_user)):
    from app.db.models import ComponentsResponse

    supabase = get_supabase()
    get_user_forecast(forecast_id, current_user["id"], supabase)

    result = supabase.table("forecasts").select("prophet_components").eq("id", forecast_id).execute()
    forecast = result.data[0]
    components = forecast.get("prophet_components")

    if not components:
        raise HTTPException(status_code=404, detail="Prophet components not available for this forecast")

    return ComponentsResponse(
        forecast_id=forecast_id,
        dates=components.get("dates", []),
        trend=components.get("trend", []),
        weekly=components.get("weekly", []),
        yearly=components.get("yearly", []),
        holidays=components.get("holidays", []),
    )


@router.get("/{forecast_id}/comparison")
def get_comparison(forecast_id: str, current_user: dict = Depends(get_current_user)):
    from app.db.models import ComparisonResponse, ModelMetrics

    supabase = get_supabase()
    forecast = get_user_forecast(forecast_id, current_user["id"], supabase)

    models = {}
    models["ensemble"] = ModelMetrics(
        mae=forecast.get("mae", 0.0) or 0.0,
        rmse=forecast.get("rmse", 0.0) or 0.0,
        mape=forecast.get("mape", 0.0) or 0.0,
        r2=forecast.get("r2", 0.0) or 0.0,
    )

    prophet_metrics = forecast.get("prophet_metrics")
    if prophet_metrics:
        models["prophet"] = ModelMetrics(
            mae=prophet_metrics.get("mae", 0.0),
            rmse=prophet_metrics.get("rmse", 0.0),
            mape=prophet_metrics.get("mape", 0.0),
            r2=prophet_metrics.get("r2", 0.0),
        )

    lstm_metrics = forecast.get("lstm_metrics")
    if lstm_metrics:
        models["lstm"] = ModelMetrics(
            mae=lstm_metrics.get("mae", 0.0),
            rmse=lstm_metrics.get("rmse", 0.0),
            mape=lstm_metrics.get("mape", 0.0),
            r2=lstm_metrics.get("r2", 0.0),
        )

    return ComparisonResponse(
        forecast_id=forecast_id,
        product_id=forecast["product_id"],
        created_at=forecast["created_at"],
        horizon_days=forecast["horizon_days"],
        alpha=forecast.get("alpha", 0.0) or 0.0,
        models=models,
    )
