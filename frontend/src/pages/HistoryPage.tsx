import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { Skeleton } from '../components/ui/Skeleton';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useToast } from '../context/ToastContext';
import { useProducts } from '../hooks/useProducts';
import { forecastsApi } from '../api/forecasts';
import type { Forecast, ComparisonResponse } from '../types';
import {
  Download, Eye, BarChart2, CheckCircle,
  Clock, AlertCircle, ChevronDown, X, Package,
  TrendingUp, Layers, AlertTriangle, RefreshCw,
} from 'lucide-react';

type ForecastWithProduct = Forecast & { productName: string };

const MODEL_LABELS: Record<string, string> = {
  prophet:  'Prophet',
  lstm:     'LSTM',
  ensemble: 'Ensemble',
};

const STATUS_CFG = {
  completed: { cls: 'bg-green-100 text-green-700',  Icon: CheckCircle, label: 'Completed' },
  running:   { cls: 'bg-blue-100 text-blue-700',    Icon: Clock,       label: 'Running'   },
  pending:   { cls: 'bg-amber-100 text-amber-700',  Icon: Clock,       label: 'Pending'   },
  failed:    { cls: 'bg-red-100 text-red-700',      Icon: AlertCircle, label: 'Failed'    },
};

const METRIC_FMT: Record<string, (v: number) => string> = {
  mae:  (v) => v.toFixed(2),
  rmse: (v) => v.toFixed(2),
  mape: (v) => v.toFixed(2) + '%',
  r2:   (v) => v.toFixed(4),
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

export function HistoryPage() {
  const { products, loading: productsLoading } = useProducts();
  const navigate = useNavigate();
  const toast = useToast();

  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [forecasts, setForecasts] = useState<ForecastWithProduct[]>([]);
  const [loading, setLoading] = useState(false);

  const [compareId, setCompareId]       = useState<string | null>(null);
  const [compareData, setCompareData]   = useState<ComparisonResponse | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [exportingId, setExportingId]   = useState<string | null>(null);

  const fetchForecasts = useCallback(async () => {
    if (products.length === 0) { setForecasts([]); return; }
    setLoading(true);
    try {
      const targets = selectedProductId === 'all'
        ? products
        : products.filter((p) => p.id === selectedProductId);

      const settled = await Promise.allSettled(
        targets.map(async (p) => {
          const list = await forecastsApi.getAll(p.id);
          return list.map((f) => ({ ...f, productName: p.name }));
        })
      );

      const flat = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      flat.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
      setForecasts(flat);
    } catch {
      setForecasts([]);
    } finally {
      setLoading(false);
    }
  }, [products, selectedProductId]);

  useEffect(() => { fetchForecasts(); }, [fetchForecasts]);

  const handleView = (f: ForecastWithProduct) => {
    navigate('/forecast', { state: { forecastId: f.id, productId: f.product_id } });
  };

  const handleCompare = async (f: ForecastWithProduct) => {
    setCompareId(f.id);
    setCompareData(null);
    setLoadingCompare(true);
    try {
      const data = await forecastsApi.getComparison(f.id);
      setCompareData(data);
    } catch {
      setCompareData(null);
      toast.error('Failed to load comparison data.');
    } finally {
      setLoadingCompare(false);
    }
  };

  const handleExport = async (f: ForecastWithProduct) => {
    setExportingId(f.id);
    try {
      const blob = await forecastsApi.exportCsv(f.id);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `forecast-${f.id.slice(0, 8)}-${f.productName.replace(/\s+/g, '-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded successfully.');
    } catch {
      toast.error('Failed to export CSV.');
    } finally {
      setExportingId(null);
    }
  };

  const showProductCol = selectedProductId === 'all';

  return (
    <Layout>
      <Header title="History">
        <button
          onClick={fetchForecasts}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </Header>

      <div className="p-4 md:p-6 space-y-4">

        {/* Filter row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              disabled={productsLoading}
              className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 pr-8 outline-none focus:ring-2 focus:ring-indigo-500 appearance-none min-w-0 w-full sm:w-auto sm:min-w-[180px]"
            >
              <option value="all">All products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" />
          </div>
          {!loading && (
            <span className="text-sm text-gray-400">
              {forecasts.length} forecast{forecasts.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Content */}
        {productsLoading || loading ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="px-4 py-3.5 flex gap-4 items-center">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-5 w-20 ml-auto rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products yet"
            desc="Upload sales data to start generating forecasts."
            link="/upload"
            linkLabel="Upload Data"
          />
        ) : forecasts.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No forecasts yet"
            desc="Run a forecast to see your history here."
            link="/forecast"
            linkLabel="Run Forecast"
          />
        ) : (
          <>
            {/* Mobile card view (< md) */}
            <div className="md:hidden space-y-2">
              {forecasts.map((f) => {
                const cfg = STATUS_CFG[f.status] ?? STATUS_CFG.pending;
                const { Icon } = cfg;
                return (
                  <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {showProductCol && (
                          <div className="text-sm font-semibold text-gray-900 truncate">{f.productName}</div>
                        )}
                        <div className="text-xs text-gray-500 mt-0.5">
                          {MODEL_LABELS[f.model_type] ?? f.model_type} · {f.horizon_days}d
                          {f.created_at && ` · ${fmtDate(f.created_at)}`}
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${cfg.cls}`}>
                        <Icon size={10} /> {cfg.label}
                      </span>
                    </div>
                    {(f.mae != null || f.mape != null || f.r2 != null) && (
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                        {f.mae  != null && <span>MAE <strong className="text-gray-800">{METRIC_FMT.mae(f.mae)}</strong></span>}
                        {f.mape != null && <span>MAPE <strong className="text-gray-800">{METRIC_FMT.mape(f.mape)}</strong></span>}
                        {f.r2   != null && <span>R² <strong className="text-gray-800">{METRIC_FMT.r2(f.r2)}</strong></span>}
                      </div>
                    )}
                    {f.status === 'completed' && (
                      <div className="flex gap-2 pt-1 border-t border-gray-100">
                        <ActionBtn icon={Eye}    label="View"    cls="text-indigo-600 hover:bg-indigo-50"  onClick={() => handleView(f)} />
                        <ActionBtn icon={Layers} label="Compare" cls="text-violet-600 hover:bg-violet-50"  onClick={() => handleCompare(f)} />
                        <ActionBtn
                          icon={exportingId === f.id ? RefreshCw : Download}
                          label="Export"
                          cls="text-gray-600 hover:bg-gray-100"
                          disabled={exportingId === f.id}
                          onClick={() => handleExport(f)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop table view (≥ md) */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {showProductCol && (
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Product</th>
                      )}
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Model</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Horizon</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">MAE</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">MAPE</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">R²</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Date</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {forecasts.map((f) => {
                      const cfg = STATUS_CFG[f.status] ?? STATUS_CFG.pending;
                      const { Icon } = cfg;
                      return (
                        <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                          {showProductCol && (
                            <td className="px-4 py-3 font-medium text-gray-900 max-w-[160px]">
                              <span className="truncate block">{f.productName}</span>
                            </td>
                          )}
                          <td className="px-4 py-3 font-medium text-gray-700">
                            {MODEL_LABELS[f.model_type] ?? f.model_type}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{f.horizon_days}d</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
                              <Icon size={10} /> {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 tabular-nums">
                            {f.mae  != null ? METRIC_FMT.mae(f.mae)   : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 tabular-nums">
                            {f.mape != null ? METRIC_FMT.mape(f.mape) : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 tabular-nums">
                            {f.r2   != null ? METRIC_FMT.r2(f.r2)     : '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">
                            {f.created_at ? fmtDate(f.created_at) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {f.status === 'completed' && (
                                <>
                                  <ActionBtn
                                    icon={Eye}
                                    label="View"
                                    cls="text-indigo-600 hover:bg-indigo-50"
                                    onClick={() => handleView(f)}
                                  />
                                  <ActionBtn
                                    icon={Layers}
                                    label="Compare"
                                    cls="text-violet-600 hover:bg-violet-50"
                                    onClick={() => handleCompare(f)}
                                  />
                                  <ActionBtn
                                    icon={exportingId === f.id ? RefreshCw : Download}
                                    label="Export"
                                    cls="text-gray-600 hover:bg-gray-100"
                                    disabled={exportingId === f.id}
                                    onClick={() => handleExport(f)}
                                  />
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Compare modal */}
      {compareId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => { setCompareId(null); setCompareData(null); }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart2 size={16} className="text-indigo-500" />
                  <h3 className="font-semibold text-gray-900 text-sm">Model Comparison</h3>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">Performance metrics on held-out validation set</p>
              </div>
              <button
                onClick={() => { setCompareId(null); setCompareData(null); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 sm:p-6">
              {loadingCompare ? (
                <div className="flex justify-center py-10"><LoadingSpinner size="lg" /></div>
              ) : compareData ? (
                <ComparisonModal data={compareData} />
              ) : (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <AlertTriangle size={28} className="text-amber-400" />
                  <p className="text-sm text-gray-500">Comparison data not available for this forecast.</p>
                  <p className="text-xs text-gray-400">The forecast may have used only one model or failed before computing metrics.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

/* ─────────── Helpers ─────────── */

function ActionBtn({
  icon: Icon, label, cls, disabled, onClick,
}: {
  icon: React.ElementType;
  label: string;
  cls: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${cls}`}
    >
      <Icon size={12} /> {label}
    </button>
  );
}

function EmptyState({
  icon: Icon, title, desc, link, linkLabel,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  link: string;
  linkLabel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
        <Icon size={24} className="text-indigo-400" />
      </div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-xs text-gray-400 mb-4 max-w-xs leading-relaxed">{desc}</p>
      <Link
        to={link}
        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {linkLabel}
      </Link>
    </div>
  );
}

function ComparisonModal({ data }: { data: ComparisonResponse }) {
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
      <div className="flex gap-3 text-xs text-gray-500 flex-wrap">
        <span>Ensemble α = <strong className="text-gray-700">{data.alpha}</strong></span>
        <span>Horizon = <strong className="text-gray-700">{data.horizon_days}d</strong></span>
        <span>Created <strong className="text-gray-700">{new Date(data.created_at).toLocaleDateString('en-GB')}</strong></span>
      </div>

      {/* Mobile: per-metric cards (< sm) */}
      <div className="sm:hidden space-y-2">
        {metrics.map(({ key, label, desc }) => {
          const bestVal = best(key);
          return (
            <div key={key} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="mb-3">
                <div className="text-sm font-semibold text-gray-900">{label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
              </div>
              <div className="flex gap-2">
                {modelKeys.map((m) => {
                  const val = data.models[m]?.[key];
                  const isBest = val != null && bestVal != null && Math.abs(val - bestVal) < 1e-9;
                  return (
                    <div key={m} className={`flex-1 rounded-lg p-2.5 text-center ${isBest ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                      <div className="text-[11px] text-gray-400 mb-1">{MODEL_LABELS[m] ?? m}</div>
                      <div className={`text-sm font-bold flex items-center justify-center gap-1 ${isBest ? 'text-green-700' : 'text-gray-800'}`}>
                        {isBest && <CheckCircle size={10} />}
                        {val != null ? (METRIC_FMT[key]?.(val) ?? val) : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: table (≥ sm) */}
      <div className="hidden sm:block overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Metric</th>
              {modelKeys.map((m) => (
                <th key={m} className="text-center px-4 py-2.5 text-xs font-semibold text-gray-700">
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
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900 text-xs">{label}</div>
                    <div className="text-xs text-gray-400">{desc}</div>
                  </td>
                  {modelKeys.map((m) => {
                    const val = data.models[m]?.[key];
                    const isBest = val != null && bestVal != null && Math.abs(val - bestVal) < 1e-9;
                    return (
                      <td key={m} className="px-4 py-3 text-center">
                        {val != null ? (
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${isBest ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                            {isBest && <CheckCircle size={10} />}
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

      <p className="text-xs text-gray-400">Green highlight = best-performing model for that metric.</p>
    </div>
  );
}

