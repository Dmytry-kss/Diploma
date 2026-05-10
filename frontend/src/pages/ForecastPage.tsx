import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine,
} from 'recharts';
import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useProducts } from '../hooks/useProducts';
import { useForecastPolling } from '../hooks/useForecastPolling';
import { forecastsApi } from '../api/forecasts';
import { salesApi } from '../api/sales';
import type {
  Forecast, ForecastValues, ShapValues, ForecastComponents,
  ComparisonResponse, RecommendationResponse, ModelType, SaleRecord,
} from '../types';
import {
  Play, Download, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle, Activity, BarChart2,
  Layers, Lightbulb, CloudSun, Search, ChevronDown,
  Clock, RefreshCw, History,
} from 'lucide-react';

type Tab = 'forecast' | 'shap' | 'components' | 'comparison' | 'insights';

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'forecast',   label: 'Forecast',    Icon: TrendingUp },
  { id: 'shap',       label: 'Importance',  Icon: BarChart2 },
  { id: 'components', label: 'Seasonality', Icon: Activity },
  { id: 'comparison', label: 'Comparison',  Icon: Layers },
  { id: 'insights',   label: 'Insights',    Icon: Lightbulb },
];

const MODEL_LABELS: Record<string, string> = {
  prophet:  'Prophet',
  lstm:     'LSTM',
  ensemble: 'Ensemble',
};

const STATUS_CFG = {
  completed: { cls: 'text-green-600', Icon: CheckCircle },
  running:   { cls: 'text-blue-500',  Icon: Clock },
  pending:   { cls: 'text-amber-500', Icon: Clock },
  failed:    { cls: 'text-red-500',   Icon: AlertTriangle },
};

const METRIC_FMT: Record<string, (v: number) => string> = {
  mae:  (v) => v.toFixed(2),
  rmse: (v) => v.toFixed(2),
  mape: (v) => v.toFixed(2) + '%',
  r2:   (v) => v.toFixed(4),
};

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function fmtShort(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface ResultsState {
  forecastId:      string;
  values:          ForecastValues | null;
  shap:            ShapValues | null;
  components:      ForecastComponents | null;
  comparison:      ComparisonResponse | null;
  recommendations: RecommendationResponse | null;
  historicalSales: SaleRecord[];
}

export function ForecastPage() {
  const { products, loading: productsLoading } = useProducts();

  const [selectedProductId, setSelectedProductId] = useState('');
  const [modelType, setModelType]     = useState<ModelType>('ensemble');
  const [horizonDays, setHorizonDays] = useState(30);
  const [inclWeather, setInclWeather] = useState(false);
  const [inclTrends,  setInclTrends]  = useState(false);

  const [currentForecastId, setCurrentForecastId] = useState<string | null>(null);
  const [running, setRunning]   = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const [recentForecasts, setRecentForecasts] = useState<Forecast[]>([]);
  const [loadingHistory, setLoadingHistory]   = useState(false);
  const fetchHistoryRef = useRef<(() => Promise<void>) | null>(null);

  const [results, setResults]           = useState<ResultsState | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [loadError, setLoadError]       = useState<string | null>(null);
  const [activeTab, setActiveTab]       = useState<Tab>('forecast');

  const { status: pollStatus, progress, metrics: pollMetrics, error: pollError } =
    useForecastPolling(currentForecastId);

  /* fetch history for selected product */
  const fetchHistory = useCallback(async (productId: string) => {
    if (!productId) return;
    setLoadingHistory(true);
    try {
      const list = await forecastsApi.getAll(productId);
      setRecentForecasts(
        [...list].sort(
          (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
        ).slice(0, 8)
      );
    } catch { /* silent */ }
    finally { setLoadingHistory(false); }
  }, []);

  fetchHistoryRef.current = () => fetchHistory(selectedProductId);

  useEffect(() => {
    if (selectedProductId) fetchHistory(selectedProductId);
  }, [selectedProductId, fetchHistory]);

  /* pre-select first product */
  useEffect(() => {
    if (!selectedProductId && products.length > 0) setSelectedProductId(products[0].id);
  }, [products, selectedProductId]);

  /* load all result data for a forecast */
  const loadResults = useCallback(async (forecastId: string, productId: string) => {
    setLoadingResults(true);
    setLoadError(null);
    setResults(null);
    try {
      const [v, s, c, cmp, rec, salesRes] = await Promise.allSettled([
        forecastsApi.getValues(forecastId, productId),
        forecastsApi.getShap(forecastId),
        forecastsApi.getComponents(forecastId),
        forecastsApi.getComparison(forecastId),
        forecastsApi.getRecommendations(forecastId),
        salesApi.getSales(productId),
      ]);

      const values = v.status === 'fulfilled' ? v.value : null;

      if (!values || values.ensemble.length === 0) {
        setLoadError('No forecast data available yet. The model may still be running or encountered an error.');
        setResults(null);
      } else {
        const historicalSales = salesRes.status === 'fulfilled'
          ? [...salesRes.value]
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(-60)
          : [];
        setResults({
          forecastId,
          values,
          shap:            s.status   === 'fulfilled' ? s.value   : null,
          components:      c.status   === 'fulfilled' ? c.value   : null,
          comparison:      cmp.status === 'fulfilled' ? cmp.value : null,
          recommendations: rec.status === 'fulfilled' ? rec.value : null,
          historicalSales,
        });
        setActiveTab('forecast');
      }
    } catch {
      setLoadError('Failed to load forecast results. Please try again.');
    } finally {
      setLoadingResults(false);
    }
  }, []);

  /* trigger load when polling completes */
  useEffect(() => {
    if (pollStatus === 'completed' && currentForecastId && selectedProductId) {
      loadResults(currentForecastId, selectedProductId);
      fetchHistoryRef.current?.();
    }
  }, [pollStatus, currentForecastId, selectedProductId, loadResults]);

  const handleRun = async () => {
    if (!selectedProductId) return;
    setRunning(true);
    setRunError(null);
    setResults(null);
    setLoadError(null);
    setCurrentForecastId(null);
    try {
      const res = await forecastsApi.run(selectedProductId, {
        horizon_days:    horizonDays,
        model_type:      modelType,
        include_weather: inclWeather,
        include_trends:  inclTrends,
      });
      setCurrentForecastId(res.forecast_id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setRunError(msg ?? 'Failed to start forecast. Make sure the product has sufficient sales data (≥ 90 rows).');
    } finally {
      setRunning(false);
    }
  };

  const handleExport = async () => {
    if (!results?.forecastId) return;
    const blob = await forecastsApi.exportCsv(results.forecastId);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `forecast-${results.forecastId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleViewForecast = (f: Forecast) => {
    setCurrentForecastId(null);
    setRunError(null);
    loadResults(f.id, f.product_id);
  };

  const isPolling     = pollStatus === 'pending' || pollStatus === 'running';
  const hasResults    = !!results;
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  /* current metrics — from polling if available, else from results comparison */
  const activeMetrics = pollMetrics ?? (results?.comparison
    ? {
        mae:  results.comparison.models.ensemble?.mae,
        rmse: results.comparison.models.ensemble?.rmse,
        mape: results.comparison.models.ensemble?.mape,
        r2:   results.comparison.models.ensemble?.r2,
      }
    : null);

  return (
    <Layout>
      <Header title="Forecast">
        {hasResults && (
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Download size={14} /> Export CSV
          </button>
        )}
      </Header>

      <div className="flex h-[calc(100vh-56px)]">

        {/* ── Left config panel ── */}
        <div className="w-72 flex-shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto flex flex-col">
          <div className="p-5 space-y-5 flex-1">

            {/* Product */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Product</label>
              {productsLoading ? <LoadingSpinner size="sm" /> : products.length === 0 ? (
                <p className="text-xs text-gray-400">No products. Upload data first.</p>
              ) : (
                <div className="relative">
                  <select
                    value={selectedProductId}
                    onChange={(e) => { setSelectedProductId(e.target.value); setResults(null); setCurrentForecastId(null); }}
                    className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2.5 pr-8 outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
                  >
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
                </div>
              )}
            </div>

            {/* Model */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Model</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['prophet', 'lstm', 'ensemble'] as ModelType[]).map((m) => (
                  <button key={m} onClick={() => setModelType(m)}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${modelType === m ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'}`}>
                    {MODEL_LABELS[m]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {modelType === 'prophet'  && 'Additive time-series with trend & seasonality.'}
                {modelType === 'lstm'     && 'Deep learning for sequential demand patterns.'}
                {modelType === 'ensemble' && 'Weighted combination of Prophet + LSTM.'}
              </p>
            </div>

            {/* Horizon */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Forecast Horizon</label>
              <div className="flex flex-wrap gap-1.5">
                {[7, 14, 30, 60, 90].map((d) => (
                  <button key={d} onClick={() => setHorizonDays(d)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${horizonDays === d ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'}`}>
                    {d}d
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Predicting next {horizonDays} days.</p>
            </div>

            {/* External signals */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">External Signals</label>
              <div className="space-y-2">
                <Toggle icon={CloudSun} label="Weather data"   hint="Open-Meteo API"    checked={inclWeather} onChange={setInclWeather} />
                <Toggle icon={Search}   label="Google Trends"  hint="Keyword interest"  checked={inclTrends}  onChange={setInclTrends} />
              </div>
            </div>

            {/* Run button */}
            <button
              onClick={handleRun}
              disabled={!selectedProductId || isPolling || running}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-xl transition-colors"
            >
              {isPolling || running ? <LoadingSpinner size="sm" /> : <Play size={15} />}
              {isPolling ? 'Running…' : running ? 'Starting…' : 'Run Forecast'}
            </button>

            {runError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-600 flex items-start gap-2">
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" /> {runError}
              </div>
            )}
          </div>

          {/* ── Recent forecasts history ── */}
          {selectedProductId && (
            <div className="border-t border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <History size={11} /> History
                </div>
                <button onClick={() => fetchHistory(selectedProductId)} className="text-gray-400 hover:text-gray-600">
                  <RefreshCw size={11} />
                </button>
              </div>
              {loadingHistory ? (
                <div className="flex justify-center py-2"><LoadingSpinner size="sm" /></div>
              ) : recentForecasts.length === 0 ? (
                <p className="text-xs text-gray-400 py-1">No forecasts yet for this product.</p>
              ) : (
                <div className="space-y-1">
                  {recentForecasts.map((f) => {
                    const cfg = STATUS_CFG[f.status] ?? STATUS_CFG.pending;
                    const { Icon } = cfg;
                    const isActive = results?.forecastId === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => handleViewForecast(f)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors ${isActive ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-white border border-transparent'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium text-gray-700 truncate">
                            {MODEL_LABELS[f.model_type]} · {f.horizon_days}d
                          </div>
                          <Icon size={11} className={cfg.cls} />
                        </div>
                        {f.created_at && (
                          <div className="text-xs text-gray-400 mt-0.5">{fmtShort(f.created_at)}</div>
                        )}
                        {f.mape != null && (
                          <div className="text-xs text-indigo-600 font-medium mt-0.5">MAPE {f.mape.toFixed(1)}%</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right results area ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Progress bar during polling */}
          {(isPolling || (pollError && !hasResults)) && (
            <div className="p-6 space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {!pollError && <LoadingSpinner size="sm" />}
                    <span className="text-sm font-semibold text-gray-900">
                      {pollError ? 'Forecast timed out' : pollStatus === 'pending' ? 'Queued…' : 'Training models…'}
                    </span>
                  </div>
                  <span className="text-sm text-gray-400">{progress}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${pollError ? 'bg-amber-400' : 'bg-indigo-600'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {pollError && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-amber-600">{pollError}</p>
                    {currentForecastId && (
                      <button
                        onClick={() => currentForecastId && selectedProductId && loadResults(currentForecastId, selectedProductId)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-200 px-3 py-1.5 rounded-lg"
                      >
                        <RefreshCw size={12} /> Try Loading Results Anyway
                      </button>
                    )}
                  </div>
                )}
                {!pollError && pollStatus === 'running' && (
                  <p className="text-xs text-gray-400 mt-2">
                    Training Prophet, LSTM, and combining into Ensemble. This may take 1–3 minutes.
                  </p>
                )}
              </div>

              {!pollError && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Prophet',  done: progress >= 35 },
                    { label: 'LSTM',     done: progress >= 65 },
                    { label: 'Ensemble', done: progress >= 90 },
                  ].map(({ label, done }) => (
                    <div key={label} className={`bg-white rounded-lg border px-4 py-3 flex items-center gap-2 ${done ? 'border-green-200' : 'border-gray-200'}`}>
                      {done
                        ? <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                        : <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 flex-shrink-0" />}
                      <span className={`text-xs font-medium ${done ? 'text-green-700' : 'text-gray-400'}`}>{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Loading results */}
          {loadingResults && (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <LoadingSpinner size="lg" />
              <p className="text-sm text-gray-400">Loading forecast results…</p>
            </div>
          )}

          {/* Load error */}
          {loadError && !loadingResults && !hasResults && (
            <div className="p-6">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Results not available</p>
                  <p className="text-xs text-amber-700 mt-1">{loadError}</p>
                  <p className="text-xs text-amber-600 mt-2">
                    The forecast may still be running in the background. Wait a few minutes and click the forecast in the History panel on the left to reload.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isPolling && !pollError && !hasResults && !loadingResults && !loadError && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <TrendingUp size={28} className="text-indigo-400" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Configure & run a forecast</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Select a product, choose your model and horizon, then click <strong>Run Forecast</strong>.
                  You can also click any entry in the History panel to view previous results.
                </p>
              </div>
            </div>
          )}

          {/* ── Results ── */}
          {hasResults && !loadingResults && (
            <div className="flex flex-col h-full">

              {/* Metrics bar */}
              {activeMetrics && (
                <div className="px-6 pt-5 pb-0">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: 'MAE',  value: activeMetrics.mae  != null ? activeMetrics.mae.toFixed(2)              : '—' },
                      { label: 'RMSE', value: activeMetrics.rmse != null ? activeMetrics.rmse.toFixed(2)             : '—' },
                      { label: 'MAPE', value: activeMetrics.mape != null ? activeMetrics.mape.toFixed(2) + '%'       : '—' },
                      { label: 'R²',   value: activeMetrics.r2   != null ? activeMetrics.r2.toFixed(4)               : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                        <div className="text-xs text-gray-400 mb-0.5">{label}</div>
                        <div className="text-lg font-bold text-gray-900">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab bar */}
              <div className="px-6 border-b border-gray-200 flex gap-1 bg-white sticky top-0 z-10">
                {TABS.map(({ id, label, Icon }) => (
                  <button key={id} onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-3 border-b-2 transition-colors ${activeTab === id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 p-6">
                {activeTab === 'forecast'   && results?.values          && <ForecastChart    data={results.values}          productName={selectedProduct?.name} horizonDays={horizonDays} historicalSales={results.historicalSales} />}
                {activeTab === 'shap'       && results?.shap             && <ShapChart        data={results.shap} />}
                {activeTab === 'components' && results?.components       && <ComponentsChart  data={results.components} />}
                {activeTab === 'comparison' && results?.comparison       && <ComparisonTable  data={results.comparison} />}
                {activeTab === 'insights'   && results?.recommendations  && <InsightsPanel    data={results.recommendations} />}
                {activeTab === 'forecast'   && !results?.values          && <TabEmpty label="Forecast values not available for this entry." />}
                {activeTab === 'shap'       && !results?.shap            && <TabEmpty label="Feature importance data not available." />}
                {activeTab === 'components' && !results?.components      && <TabEmpty label="Seasonality components not available (Prophet/Ensemble only)." />}
                {activeTab === 'comparison' && !results?.comparison      && <TabEmpty label="Model comparison not available." />}
                {activeTab === 'insights'   && !results?.recommendations && <TabEmpty label="Business insights not available." />}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

/* ─────────────────────── Sub-components ─────────────────────── */

function Toggle({ icon: Icon, label, hint, checked, onChange }: {
  icon: React.ElementType; label: string; hint: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors text-left ${checked ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
      <div className="flex items-center gap-2">
        <Icon size={13} className={checked ? 'text-indigo-600' : 'text-gray-400'} />
        <div>
          <div className={`text-xs font-semibold ${checked ? 'text-indigo-700' : 'text-gray-700'}`}>{label}</div>
          <div className="text-xs text-gray-400">{hint}</div>
        </div>
      </div>
      <div className="relative flex-shrink-0" style={{ width: 32, height: 18 }}>
        <div className={`absolute inset-0 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-gray-200'}`} />
        <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-[14px]' : 'left-0.5'}`} />
      </div>
    </button>
  );
}

function TabEmpty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-2 text-center">
      <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
        <BarChart2 size={18} className="text-gray-300" />
      </div>
      <p className="text-sm text-gray-400 max-w-xs">{label}</p>
    </div>
  );
}

/* ─── Forecast chart ─── */
function ForecastChart({ data, productName, horizonDays, historicalSales = [] }: {
  data: ForecastValues; productName?: string; horizonDays: number; historicalSales?: SaleRecord[];
}) {
  const historicalRows = historicalSales.map((s) => ({
    date:      fmtDate(s.date),
    actual:    s.quantity as number | null,
    predicted: null as number | null,
    bandLow:   null as number | null,
    bandRange: null as number | null,
  }));

  const forecastRows = data.dates.map((d, i) => {
    const lower = data.lower[i];
    const upper = data.upper[i];
    const hasBand = lower != null && upper != null;
    return {
      date:      fmtDate(d),
      actual:    data.actual[i] as number | null,
      predicted: data.ensemble[i] as number | null,
      bandLow:   hasBand ? lower : null,
      bandRange: hasBand ? upper! - lower! : null,
    };
  });

  const chartData = [...historicalRows, ...forecastRows];
  const splitDate = forecastRows.length > 0 ? forecastRows[0].date : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {horizonDays}-Day Demand Forecast{productName ? ` — ${productName}` : ''}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Shaded area = 95% confidence interval · Dashed = historical actuals · Solid = forecast
          </p>
        </div>
        {splitDate && (
          <div className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-medium flex-shrink-0">
            Forecast starts {splitDate}
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
            formatter={(value, name) => {
              const v = value as number | null | undefined;
              const label = name === 'actual' ? 'Actual Sales' : name === 'predicted' ? 'Forecast' : String(name);
              return [v != null ? Math.round(v) : '—', label] as [string | number, string];
            }}
          />
          <Legend iconType="circle" iconSize={8}
            formatter={(v) => v === 'actual' ? 'Actual Sales' : v === 'predicted' ? 'Forecast' : v}
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {splitDate && (
            <ReferenceLine
              x={splitDate}
              stroke="#6366f1"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: '▶ Forecast', position: 'insideTopRight', fontSize: 10, fill: '#6366f1', fontWeight: 600 }}
            />
          )}
          <Area dataKey="bandLow"   stackId="conf" fill="transparent"    stroke="none" legendType="none" dot={false} activeDot={false} />
          <Area dataKey="bandRange" stackId="conf" fill="url(#confGrad)" stroke="none" legendType="none" dot={false} activeDot={false} />
          <Line dataKey="predicted" stroke="#6366f1" strokeWidth={2}   dot={false} connectNulls      name="predicted" />
          <Line dataKey="actual"    stroke="#64748b" strokeWidth={1.5} dot={false} strokeDasharray="5 4" connectNulls={false} name="actual" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── SHAP chart ─── */
function ShapChart({ data }: { data: ShapValues }) {
  const chartData = data.features
    .map((f, i) => ({ feature: f.replace(/_/g, ' '), importance: parseFloat(data.importance[i].toFixed(4)) }))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 12);
  const maxVal = Math.max(...chartData.map((d) => d.importance));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Feature Importance (SHAP)</h3>
        <p className="text-xs text-gray-400 mt-0.5">Mean absolute SHAP values — higher = more influence on predictions</p>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 36)}>
        <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="feature" width={150} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(v: unknown) => [(v as number).toFixed(4), 'SHAP value']} />
          <Bar dataKey="importance" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={`rgba(99,102,241,${0.35 + 0.65 * (entry.importance / maxVal)})`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Components chart ─── */
function ComponentsChart({ data }: { data: ForecastComponents }) {
  const chartData = data.dates.map((d, i) => ({
    date:   fmtDate(d),
    trend:  data.trend[i],
    yearly: data.yearly[i] ?? null,
  }));

  // Group weekly values by day-of-week and average them (Mon=0..Sun=6)
  const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const agg = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  data.dates.forEach((d, i) => {
    const jsDay = new Date(d + 'T00:00:00').getDay(); // 0=Sun,1=Mon,...,6=Sat
    const idx = jsDay === 0 ? 6 : jsDay - 1;          // remap to Mon=0..Sun=6
    agg[idx].sum += data.weekly[i];
    agg[idx].count += 1;
  });
  const weeklyBarData = DOW_LABELS.map((day, i) => ({
    day,
    effect: agg[i].count > 0 ? parseFloat((agg[i].sum / agg[i].count).toFixed(2)) : 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Seasonality Components</h3>
        <p className="text-xs text-gray-400 mt-0.5">Prophet decomposition: long-term trend, weekly pattern, and seasonal effects</p>
      </div>
      <ChartPanel title="Trend" color="#6366f1">
        <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={44} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          <Line dataKey="trend" stroke="#6366f1" strokeWidth={2} dot={false} name="Trend" />
        </ComposedChart>
      </ChartPanel>
      <ChartPanel title="Weekly Seasonality" subtitle="Average demand effect by day of week" color="#8b5cf6">
        <BarChart data={weeklyBarData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={44} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(v: unknown) => [(v as number).toFixed(2), 'Effect']} />
          <Bar dataKey="effect" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={40} name="Weekly effect" />
        </BarChart>
      </ChartPanel>
      {chartData.some((d) => d.yearly != null) && (
        <ChartPanel title="Seasonal Pattern" subtitle="How the seasonal component evolves over the forecast period" color="#06b6d4">
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={44} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
            <Line dataKey="yearly" stroke="#06b6d4" strokeWidth={2} dot={false} name="Seasonal effect" />
          </ComposedChart>
        </ChartPanel>
      )}
    </div>
  );
}

function ChartPanel({ title, subtitle, color, children }: { title: string; subtitle?: string; color: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold text-gray-700">{title}</span>
      </div>
      {subtitle && <p className="text-xs text-gray-400 pl-4 mb-2">{subtitle}</p>}
      <ResponsiveContainer width="100%" height={140}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Comparison table ─── */
function ComparisonTable({ data }: { data: ComparisonResponse }) {
  const modelKeys = Object.keys(data.models) as (keyof typeof data.models)[];
  const metrics = [
    { key: 'mae',  label: 'MAE',  desc: 'Mean Absolute Error — lower is better' },
    { key: 'rmse', label: 'RMSE', desc: 'Root Mean Square Error — lower is better' },
    { key: 'mape', label: 'MAPE', desc: 'Mean Absolute % Error — lower is better' },
    { key: 'r2',   label: 'R²',   desc: 'Coefficient of Determination — higher is better' },
  ] as const;

  const best = (k: 'mae' | 'rmse' | 'mape' | 'r2') => {
    const vals = modelKeys.map((m) => data.models[m]?.[k]).filter((v): v is number => v != null);
    if (!vals.length) return null;
    return k === 'r2' ? Math.max(...vals) : Math.min(...vals);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Model Comparison</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Performance on held-out test set · Ensemble weight α = {data.alpha}
        </p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Metric</th>
              {modelKeys.map((m) => (
                <th key={m} className="text-center px-5 py-3 text-xs font-semibold text-gray-700">
                  {MODEL_LABELS[m] ?? m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {metrics.map(({ key, label, desc }) => {
              const bestVal = best(key);
              return (
                <tr key={key} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-gray-900">{label}</div>
                    <div className="text-xs text-gray-400">{desc}</div>
                  </td>
                  {modelKeys.map((m) => {
                    const val = data.models[m]?.[key];
                    const isBest = val != null && bestVal != null && Math.abs(val - bestVal) < 1e-9;
                    return (
                      <td key={m} className="px-5 py-3.5 text-center">
                        {val != null ? (
                          <span className={`inline-flex items-center gap-1 text-sm font-semibold px-2.5 py-0.5 rounded-full ${isBest ? 'bg-green-100 text-green-700' : 'text-gray-700'}`}>
                            {isBest && <CheckCircle size={11} />}
                            {METRIC_FMT[key]?.(val) ?? val}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Insights panel ─── */
function InsightsPanel({ data }: { data: RecommendationResponse }) {
  const trendCfg = {
    growing:   { Icon: TrendingUp,   cls: 'bg-green-50 text-green-700 border-green-200',  label: 'Growing demand' },
    stable:    { Icon: Minus,        cls: 'bg-blue-50 text-blue-700 border-blue-200',     label: 'Stable demand' },
    declining: { Icon: TrendingDown, cls: 'bg-amber-50 text-amber-700 border-amber-200',  label: 'Declining demand' },
  };
  const riskCfg = {
    low:    { cls: 'bg-green-100 text-green-700', label: 'Low Risk' },
    medium: { cls: 'bg-amber-100 text-amber-700', label: 'Medium Risk' },
    high:   { cls: 'bg-red-100 text-red-700',     label: 'High Risk' },
  };

  const trend = trendCfg[data.trend_direction];
  const risk  = riskCfg[data.risk_level];
  const { Icon: TrendIcon } = trend;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Business Insights</h3>
        <p className="text-xs text-gray-400 mt-0.5">AI-generated recommendations based on forecast results</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className={`rounded-xl border p-4 ${trend.cls}`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendIcon size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">Demand Trend</span>
          </div>
          <div className="text-xl font-bold">{trend.label}</div>
          <div className="text-sm mt-0.5 opacity-80">
            {data.trend_percent > 0 ? '+' : ''}{data.trend_percent.toFixed(1)}% over horizon
          </div>
        </div>
        <div className={`rounded-xl border p-4 ${risk.cls}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">Risk Level</span>
          </div>
          <div className="text-xl font-bold">{risk.label}</div>
          <div className="text-sm mt-0.5 opacity-80">Forecast uncertainty</div>
        </div>
      </div>
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recommendations</h4>
        {data.recommendations.map((rec, i) => (
          <div key={i} className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:border-indigo-200 transition-colors">
            <div className="w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">
              {i + 1}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{rec}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
