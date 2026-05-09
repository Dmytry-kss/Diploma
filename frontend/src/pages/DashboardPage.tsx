import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { BarChart2, Upload, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

export function DashboardPage() {
  return (
    <Layout>
      <Header title="Dashboard" />
      <div className="p-6 flex flex-col items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-2xl mb-5">
            <BarChart2 size={32} className="text-indigo-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No forecast yet</h2>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">
            Upload your sales data and run your first forecast to see predictions, metrics, and insights here.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              <Upload size={16} />
              Upload Sales Data
            </Link>
            <Link
              to="/forecast"
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg border border-gray-300 transition-colors"
            >
              <TrendingUp size={16} />
              Run Forecast
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
