import { create } from 'zustand';
import type { Forecast } from '../types';

interface ForecastState {
  activeForecast: Forecast | null;
  loading: boolean;
  setActiveForecast: (forecast: Forecast | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useForecastStore = create<ForecastState>((set) => ({
  activeForecast: null,
  loading: false,
  setActiveForecast: (forecast) => set({ activeForecast: forecast }),
  setLoading: (loading) => set({ loading }),
}));
