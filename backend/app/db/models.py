from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
import uuid


class ProductCreate(BaseModel):
    name: str
    category: str
    search_keyword: Optional[str] = None
    latitude: Optional[float] = 50.4501
    longitude: Optional[float] = 30.5234


class ProductOut(BaseModel):
    id: str
    name: str
    category: str
    search_keyword: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: Optional[datetime] = None


class SaleCreate(BaseModel):
    product_id: str
    date: date
    quantity: int
    price: Optional[float] = None


class SaleOut(BaseModel):
    id: str
    product_id: str
    date: date
    quantity: int
    price: Optional[float] = None


class ForecastRequest(BaseModel):
    horizon_days: int = 30
    model_type: str = "ensemble"
    include_weather: bool = True
    include_trends: bool = True


class ForecastOut(BaseModel):
    id: str
    product_id: str
    model_type: str
    horizon_days: int
    status: str
    alpha: Optional[float] = None
    mae: Optional[float] = None
    rmse: Optional[float] = None
    mape: Optional[float] = None
    r2: Optional[float] = None
    created_at: Optional[datetime] = None


class ForecastValueOut(BaseModel):
    id: str
    forecast_id: str
    date: date
    predicted_quantity: float
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None


class SHAPValueOut(BaseModel):
    id: str
    forecast_id: str
    feature_name: str
    shap_value: float
    mean_abs_shap: Optional[float] = None


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str = ""


class UserOut(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    created_at: Optional[datetime] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RecommendationResponse(BaseModel):
    forecast_id: str
    trend_direction: str  # growing / stable / declining
    trend_percent: float
    risk_level: str  # low / medium / high
    recommendations: list[str]


class ModelMetrics(BaseModel):
    mae: float
    rmse: float
    mape: float
    r2: float


class ComparisonResponse(BaseModel):
    forecast_id: str
    product_id: str
    created_at: datetime
    horizon_days: int
    alpha: float
    models: dict[str, ModelMetrics]


class ComponentsResponse(BaseModel):
    forecast_id: str
    dates: list[str]
    trend: list[float]
    weekly: list[float]
    yearly: list[float]
    holidays: list[float]


class DatasetStatsResponse(BaseModel):
    product_id: str
    total_rows: int
    date_from: str
    date_to: str
    missing_values: int
    mean_quantity: float
    std_quantity: float
    min_quantity: float
    max_quantity: float
    seasonality_detected: bool
    sufficient_for_forecast: bool
