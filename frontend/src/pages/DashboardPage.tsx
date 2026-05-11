import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { Skeleton } from '../components/ui/Skeleton';
import { useProducts } from '../hooks/useProducts';
import { forecastsApi } from '../api/forecasts';
import type { Forecast } from '../types';
import {
  BarChart2, Upload, TrendingUp, Package, Cpu,
  CheckCircle, Clock, AlertCircle, ArrowRight, Target, Activity,
} from 'lucide-react';

type ForecastWithProduct = Forecast & { productName: string };

interface DashboardStats {
  totalProducts: number;
  totalForecasts: number;
  completedForecasts: number;
  avgMape: number | null;
  recentForecasts: ForecastWithProduct[];
}

const STATUS_CFG = {
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700', Icon: CheckCircle },
  running:   { label: 'Running',   cls: 'bg-blue-100 text-blue-700',   Icon: Clock },
  pending:   { label: 'Pending',   cls: 'bg-amber-100 text-amber-700', Icon: Clock },
  failed:    { label: 'Failed',    cls: 'bg-red-100 text-red-700',     Icon: AlertCircle },
};

export function DashboardPage() {
  const { products, loading: productsLoading } = useProducts();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const buildStats = useCallback(async () => {
    if (products.length === 0) {
      setStats({ totalProducts: 0, totalForecasts: 0, completedForecasts: 0, avgMape: null, recentForecasts: [] });
      return;
    }
    setLoadingStats(true);
    try {
      const results = await Promise.allSettled(
        products.map(async (p) => {
          const forecasts = await forecastsApi.getAll(p.id);
          return forecasts.map((f) => ({ ...f, productName: p.name }));
        })
      );
      const flat: ForecastWithProduct[] = results.flatMap((r) =>
        r.status === 'fulfilled' ? r.value : []
      );
      const completed = flat.filter((f) => f.status === 'completed');
      const mapes = completed.filter((f) => f.mape != null).map((f) => f.mape!);
      const avgMape = mapes.length > 0 ? mapes.reduce((a, b) => a + b, 0) / mapes.length : null;
      const recent = [...flat]
        .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
        .slice(0, 8);
      setStats({ totalProducts: products.length, totalForecasts: flat.length, completedForecasts: completed.length, avgMape, recentForecasts: recent });
    } catch {
      setStats({ totalProducts: products.length, totalForecasts: 0, completedForecasts: 0, avgMape: null, recentForecasts: [] });
    } finally {
      setLoadingStats(false);
    }
  }, [products]);

  useEffect(() => { buildStats(); }, [buildStats]);

  const isLoading = productsLoading || loadingStats;

  if (isLoading) {
    return (
      <Layout>
        <Header title="Dashboard" />
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="lg:col-span-2 h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!stats || stats.totalProducts === 0) {
    return (
      <Layout>
        <Header title="Dashboard" />
        <div className="p-6 flex flex-col items-center justify-center min-h-[calc(100vh-56px)]">
          <div className="text-center max-w-md">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-2xl mb-5">
              <BarChart2 size={32} className="text-indigo-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Welcome to Demand Forecasting</h2>
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              Start by adding a product and uploading your historical sales data to generate AI-powered demand forecasts.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/upload" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
                <Upload size={16} /> Upload Sales Data
              </Link>
              <Link to="/forecast" className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg border border-gray-300 transition-colors">
                <TrendingUp size={16} /> Run Forecast
              </Link>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const accuracy = stats.avgMape != null ? Math.max(0, 100 - stats.avgMape).toFixed(1) + '%' : '—';

  return (
    <Layout>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Products"        value={stats.totalProducts}                     icon={Package}     color="indigo" href="/upload" />
          <StatCard label="Forecasts Run"   value={stats.totalForecasts}                    icon={Activity}    color="violet" href="/forecast" />
          <StatCard label="Completed"       value={stats.completedForecasts}                icon={CheckCircle} color="green" />
          <StatCard label="Avg Accuracy"    value={accuracy} subtext="100 − MAPE"           icon={Target}      color="blue" />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Recent forecasts */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-sm">Recent Forecasts</h3>
              <Link to="/forecast" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-medium">
                New forecast <ArrowRight size={12} />
              </Link>
            </div>
            {stats.recentForecasts.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <BarChart2 size={20} className="text-gray-400" />
                </div>
                <p className="text-sm text-gray-400">No forecasts yet. Run your first one to see results here.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {stats.recentForecasts.map((f) => {
                  const cfg = STATUS_CFG[f.status] ?? STATUS_CFG.pending;
                  const { Icon } = cfg;
                  return (
                    <div key={f.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Cpu size={15} className="text-indigo-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{f.productName}</div>
                          <div className="text-xs text-gray-400">
                            {f.model_type?.toUpperCase()} · {f.horizon_days}d
                            {f.created_at && ` · ${new Date(f.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {f.status === 'completed' && f.mape != null && (
                          <span className="text-xs text-gray-400 hidden sm:block">MAPE {f.mape.toFixed(1)}%</span>
                        )}
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
                          <Icon size={10} /> {cfg.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">

            {/* Products list */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex-1">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 text-sm">Products</h3>
                <Link to="/upload" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-medium">
                  Manage <ArrowRight size={12} />
                </Link>
              </div>
              <div className="divide-y divide-gray-50">
                {products.slice(0, 5).map((p) => (
                  <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-7 h-7 bg-violet-50 rounded-md flex items-center justify-center flex-shrink-0">
                      <Package size={13} className="text-violet-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{p.name}</div>
                      <div className="text-xs text-gray-400 truncate">{p.category}</div>
                    </div>
                  </div>
                ))}
                {products.length > 5 && (
                  <div className="px-5 py-2.5 text-xs text-gray-400">+{products.length - 5} more</div>
                )}
              </div>
            </div>

            {/* CTA card */}
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl p-5 text-white">
              <h3 className="font-semibold mb-1 text-sm">Ready to forecast?</h3>
              <p className="text-xs text-indigo-100 mb-4 leading-relaxed">
                Use Prophet, LSTM, or Ensemble models to predict future demand.
              </p>
              <Link
                to="/forecast"
                className="inline-flex items-center gap-2 bg-white text-indigo-700 text-xs font-semibold px-4 py-2 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <TrendingUp size={13} /> Run New Forecast
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({
  label, value, icon: Icon, color, href, subtext,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: 'indigo' | 'violet' | 'green' | 'blue';
  href?: string;
  subtext?: string;
}) {
  const colorMap = {
    indigo: 'bg-indigo-50 text-indigo-600',
    violet: 'bg-violet-50 text-violet-600',
    green:  'bg-green-50 text-green-600',
    blue:   'bg-blue-50 text-blue-600',
  };
  const inner = (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4 hover:border-gray-300 transition-colors h-full">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 leading-none mb-0.5">{value}</div>
        <div className="text-xs text-gray-500 font-medium">{label}</div>
        {subtext && <div className="text-xs text-gray-400 mt-0.5">{subtext}</div>}
      </div>
    </div>
  );
  return href ? <Link to={href} className="block">{inner}</Link> : inner;
}
