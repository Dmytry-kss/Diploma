export interface User {
  id: string;
  email: string;
  full_name?: string;
  created_at?: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  search_keyword?: string;
  latitude?: number;
  longitude?: number;
  created_at?: string;
}

export interface SaleRecord {
  id: string;
  product_id: string;
  date: string;
  quantity: number;
  price?: number;
}

export interface SalesStats {
  product_id: string;
  total_rows: number;
  date_from: string;
  date_to: string;
  missing_values: number;
  mean_quantity: number;
  std_quantity: number;
  min_quantity: number;
  max_quantity: number;
  seasonality_detected: boolean;
  sufficient_for_forecast: boolean;
}

export interface UploadResponse {
  inserted: number;
  warnings: string[];
}

export type ForecastStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ModelType = 'prophet' | 'lstm' | 'ensemble';

export interface ModelMetrics {
  mae: number;
  rmse: number;
  mape: number;
  r2: number;
  residual_mean?: number;
  residual_std?: number;
  ljung_box_p?: number;
}

export interface Forecast {
  id: string;
  product_id: string;
  status: ForecastStatus;
  horizon_days: number;
  model_type: ModelType;
  alpha?: number;
  created_at?: string;
  mae?: number;
  rmse?: number;
  mape?: number;
  r2?: number;
}

// Raw API response — per-row forecast value from /forecasts/{id}/values
export interface ForecastValueOut {
  id: string;
  forecast_id: string;
  date: string;
  predicted_quantity: number;
  lower_bound?: number;
  upper_bound?: number;
}

// Raw API response — SHAP value row from /forecasts/{id}/shap
export interface SHAPValueOut {
  id: string;
  forecast_id: string;
  feature_name: string;
  shap_value: number;
  mean_abs_shap?: number;
}

// Transformed — merged forecast + actual sales, ready for charts
export interface ForecastValues {
  forecast_id: string;
  dates: string[];
  actual: (number | null)[];
  ensemble: number[];
  lower: (number | null)[];
  upper: (number | null)[];
}

// Transformed — SHAP arrays ready for ShapBarChart
export interface ShapValues {
  forecast_id: string;
  features: string[];
  values: number[];
  importance: number[];
}

export interface ForecastComponents {
  forecast_id: string;
  dates: string[];
  trend: number[];
  weekly: number[];
  yearly: number[];
  holidays: number[];
}

export interface ComparisonResponse {
  forecast_id: string;
  product_id: string;
  created_at: string;
  horizon_days: number;
  alpha: number;
  models: {
    ensemble: ModelMetrics;
    prophet?: ModelMetrics;
    lstm?: ModelMetrics;
  };
}

export interface RecommendationResponse {
  forecast_id: string;
  trend_direction: 'growing' | 'stable' | 'declining';
  trend_percent: number;
  risk_level: 'low' | 'medium' | 'high';
  recommendations: string[];
}
