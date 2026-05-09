import { useState, useEffect, useRef } from 'react';
import { forecastsApi } from '../api/forecasts';
import type { ForecastStatus } from '../types';

interface PollingState {
  status: ForecastStatus | null;
  progress: number;
  metrics: { mae?: number; rmse?: number; mape?: number; r2?: number } | null;
  error: string | null;
}

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 5 * 60 * 1000;

function statusToProgress(status: string): number {
  if (status === 'pending') return 10;
  if (status === 'running') return 55;
  if (status === 'completed') return 100;
  return 0;
}

export function useForecastPolling(forecastId: string | null) {
  const [state, setState] = useState<PollingState>({
    status: null,
    progress: 0,
    metrics: null,
    error: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  useEffect(() => {
    if (!forecastId) return;

    setState({ status: 'pending', progress: 10, metrics: null, error: null });

    const poll = async () => {
      try {
        const data = await forecastsApi.getStatus(forecastId);
        const progress = statusToProgress(data.status);

        setState({
          status: data.status as ForecastStatus,
          progress,
          metrics: data.mae != null
            ? { mae: data.mae, rmse: data.rmse, mape: data.mape, r2: data.r2 }
            : null,
          error: null,
        });

        if (data.status === 'completed' || data.status === 'failed') {
          stopPolling();
          if (data.status === 'failed') {
            setState((prev) => ({ ...prev, error: 'Forecast failed. Please try again.' }));
          }
        }
      } catch {
        stopPolling();
        setState((prev) => ({ ...prev, error: 'Failed to get forecast status.' }));
      }
    };

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    timeoutRef.current = setTimeout(() => {
      stopPolling();
      setState((prev) => ({
        ...prev,
        error: 'Timeout: forecast is taking too long. Please check back later.',
      }));
    }, TIMEOUT_MS);

    return stopPolling;
  }, [forecastId]);

  return state;
}
