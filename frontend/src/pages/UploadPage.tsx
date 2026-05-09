import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { Upload } from 'lucide-react';

export function UploadPage() {
  return (
    <Layout>
      <Header title="Upload Data" />
      <div className="p-6 flex flex-col items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-2xl mb-5">
            <Upload size={32} className="text-indigo-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Upload Sales Data</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            This page will let you upload CSV files and manage products. Coming in Phase 2.
          </p>
        </div>
      </div>
    </Layout>
  );
}
