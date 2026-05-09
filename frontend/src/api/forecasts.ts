import client from './client';
import { salesApi } from './sales';
import type {
  Forecast,
  ForecastValues,
  ShapValues,
  ForecastComponents,
  ComparisonResponse,
  RecommendationResponse,
  ForecastValueOut,
  SHAPValueOut,
} from '../types';

interface ForecastRunRequest {
  horizon_days: number;
  model_type: string;
  include_weather: boolean;
  include_trends: boolean;
}

interface ForecastRunResponse {
  forecast_id: string;
  status: string;
}

export const forecastsApi = {
  run: async (productId: string, data: ForecastRunRequest): Promise<ForecastRunResponse> => {
    const res = await client.post<ForecastRunResponse>(`/forecasts/run/${productId}`, data);
    return res.data;
  },

  getAll: async (productId: string): Promise<Forecast[]> => {
    const res = await client.get<Forecast[]>(`/forecasts/${productId}`);
    return res.data;
  },

  getStatus: async (forecastId: string): Promise<Forecast> => {
    const res = await client.get<Forecast>(`/forecasts/${forecastId}/status`);
    return res.data;
  },

  getValues: async (forecastId: string, productId: string): Promise<ForecastValues> => {
    const [valuesRes, sales] = await Promise.all([
      client.get<ForecastValueOut[]>(`/forecasts/${forecastId}/values`),
      salesApi.getSales(productId),
    ]);

    const forecastRows = valuesRes.data;
    const actualMap = new Map(sales.map((s) => [s.date, s.quantity]));

    const dates = forecastRows.map((v) => v.date);
    const actual = dates.map((d) => actualMap.get(d) ?? null);
    const ensemble = forecastRows.map((v) => v.predicted_quantity);
    const lower = forecastRows.map((v) => v.lower_bound ?? null);
    const upper = forecastRows.map((v) => v.upper_bound ?? null);

    return { forecast_id: forecastId, dates, actual, ensemble, lower, upper };
  },

  getShap: async (forecastId: string): Promise<ShapValues> => {
    const res = await client.get<SHAPValueOut[]>(`/forecasts/${forecastId}/shap`);
    const rows = res.data;
    return {
      forecast_id: forecastId,
      features: rows.map((s) => s.feature_name),
      values: rows.map((s) => s.shap_value),
      importance: rows.map((s) => s.mean_abs_shap ?? Math.abs(s.shap_value)),
    };
  },

  getRecommendations: async (forecastId: string): Promise<RecommendationResponse> => {
    const res = await client.get<RecommendationResponse>(`/forecasts/${forecastId}/recommendations`);
    return res.data;
  },

  getComponents: async (forecastId: string): Promise<ForecastComponents> => {
    const res = await client.get<ForecastComponents>(`/forecasts/${forecastId}/components`);
    return res.data;
  },

  getComparison: async (forecastId: string): Promise<ComparisonResponse> => {
    const res = await client.get<ComparisonResponse>(`/forecasts/${forecastId}/comparison`);
    return res.data;
  },

  exportCsv: async (forecastId: string): Promise<Blob> => {
    const res = await client.get(`/forecasts/${forecastId}/export`, { responseType: 'blob' });
    return res.data as Blob;
  },
};
