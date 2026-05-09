import { useState, useEffect } from 'react';
import { forecastsApi } from '../api/forecasts';
import type { Forecast } from '../types';

export function useForecasts(productId: string | null) {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      setForecasts([]);
      return;
    }
    setLoading(true);
    setError(null);
    forecastsApi
      .getAll(productId)
      .then(setForecasts)
      .catch(() => setError('Failed to load forecasts'))
      .finally(() => setLoading(false));
  }, [productId]);

  return { forecasts, loading, error };
}
