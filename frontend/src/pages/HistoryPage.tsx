import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { History } from 'lucide-react';

export function HistoryPage() {
  return (
    <Layout>
      <Header title="History" />
      <div className="p-6 flex flex-col items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-2xl mb-5">
            <History size={32} className="text-indigo-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Forecast History</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            View all past forecasts, compare model performance, and export results. Coming in Phase 3.
          </p>
        </div>
      </div>
    </Layout>
  );
}
