import { useState, useRef, useCallback, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useProducts } from '../hooks/useProducts';
import { productsApi } from '../api/products';
import { salesApi } from '../api/sales';
import type { Product, SalesStats, UploadResponse } from '../types';
import {
  Upload, Plus, Package, Trash2, CheckCircle, AlertCircle, X,
  FileSpreadsheet, CloudUpload, BarChart2, Calendar, TrendingUp,
  AlertTriangle, MapPin, Search,
} from 'lucide-react';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

interface ProductForm {
  name: string;
  category: string;
  search_keyword: string;
  latitude: string;
  longitude: string;
}

const EMPTY_FORM: ProductForm = { name: '', category: '', search_keyword: '', latitude: '', longitude: '' };

export function UploadPage() {
  const { products, loading: productsLoading, refetch } = useProducts();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStats = useCallback(async (productId: string) => {
    setLoadingStats(true);
    try {
      const s = await salesApi.getStats(productId);
      setStats(s);
    } catch {
      setStats(null);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      setUploadState('idle');
      setUploadResult(null);
      setUploadError(null);
      fetchStats(selectedProduct.id);
    }
  }, [selectedProduct, fetchStats]);

  const handleCreateProduct = async () => {
    if (!form.name.trim() || !form.category.trim()) {
      setCreateError('Name and category are required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const payload: Parameters<typeof productsApi.create>[0] = {
        name: form.name.trim(),
        category: form.category.trim(),
      };
      if (form.search_keyword.trim()) payload.search_keyword = form.search_keyword.trim();
      if (form.latitude && form.longitude) {
        payload.latitude = parseFloat(form.latitude);
        payload.longitude = parseFloat(form.longitude);
      }
      const newProduct = await productsApi.create(payload);
      await refetch();
      setSelectedProduct(newProduct);
      setShowCreateForm(false);
      setForm(EMPTY_FORM);
    } catch {
      setCreateError('Failed to create product. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!window.confirm(`Delete "${product.name}" and all its data?`)) return;
    setDeletingId(product.id);
    try {
      await salesApi.delete(product.id);
      await productsApi.delete(product.id);
      if (selectedProduct?.id === product.id) {
        setSelectedProduct(null);
        setStats(null);
        setUploadState('idle');
      }
      await refetch();
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  };

  const handleFile = useCallback(async (file: File) => {
    if (!selectedProduct) return;
    if (!file.name.endsWith('.csv')) {
      setUploadError('Please upload a CSV file.');
      setUploadState('error');
      return;
    }
    setUploadState('uploading');
    setUploadError(null);
    setUploadResult(null);
    try {
      const result = await salesApi.upload(selectedProduct.id, file);
      setUploadResult(result);
      setUploadState('success');
      await fetchStats(selectedProduct.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setUploadError(msg ?? 'Upload failed. Check the file format and try again.');
      setUploadState('error');
    }
  }, [selectedProduct, fetchStats]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleDeleteSales = async () => {
    if (!selectedProduct) return;
    if (!window.confirm('Delete all sales data for this product?')) return;
    try {
      await salesApi.delete(selectedProduct.id);
      setStats(null);
      setUploadState('idle');
      setUploadResult(null);
    } catch { /* silent */ }
  };

  return (
    <Layout>
      <Header title="Upload Data" />
      <div className="flex h-[calc(100vh-56px)]">

        {/* Left panel — Product management */}
        <div className="w-72 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
          <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Products</span>
            <button
              onClick={() => { setShowCreateForm((v) => !v); setCreateError(null); setForm(EMPTY_FORM); }}
              className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors"
              title="Add product"
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Create form */}
          {showCreateForm && (
            <div className="px-4 py-4 border-b border-indigo-100 bg-white">
              <div className="space-y-2.5">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Product Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Wireless Headphones"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category *</label>
                  <input
                    type="text"
                    placeholder="e.g. Electronics"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                    <Search size={10} /> Google Trends keyword
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. headphones"
                    value={form.search_keyword}
                    onChange={(e) => setForm((f) => ({ ...f, search_keyword: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                      <MapPin size={10} /> Latitude
                    </label>
                    <input
                      type="number"
                      placeholder="50.45"
                      value={form.latitude}
                      onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Longitude</label>
                    <input
                      type="number"
                      placeholder="30.52"
                      value={form.longitude}
                      onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>
                {createError && (
                  <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={11} /> {createError}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleCreateProduct}
                    disabled={creating}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    {creating ? <LoadingSpinner size="sm" /> : <Plus size={12} />}
                    Create
                  </button>
                  <button
                    onClick={() => { setShowCreateForm(false); setCreateError(null); }}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Product list */}
          <div className="flex-1 overflow-y-auto py-2">
            {productsLoading ? (
              <div className="flex justify-center py-8"><LoadingSpinner /></div>
            ) : products.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Package size={28} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs text-gray-400">No products yet. Click + to add one.</p>
              </div>
            ) : (
              products.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className={`mx-2 mb-1 px-3 py-2.5 rounded-lg cursor-pointer flex items-center justify-between group transition-colors ${
                    selectedProduct?.id === p.id
                      ? 'bg-indigo-600 text-white'
                      : 'hover:bg-white text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Package size={14} className={selectedProduct?.id === p.id ? 'text-indigo-200' : 'text-gray-400'} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className={`text-xs truncate ${selectedProduct?.id === p.id ? 'text-indigo-200' : 'text-gray-400'}`}>{p.category}</div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteProduct(p); }}
                    disabled={deletingId === p.id}
                    className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity ${
                      selectedProduct?.id === p.id ? 'hover:bg-indigo-500 text-indigo-200' : 'hover:bg-red-50 text-red-400'
                    }`}
                  >
                    {deletingId === p.id ? <LoadingSpinner size="sm" /> : <Trash2 size={13} />}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right panel — Upload + Stats */}
        <div className="flex-1 overflow-y-auto">
          {!selectedProduct ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-xs">
                <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Package size={24} className="text-gray-400" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Select a product</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Choose a product from the left panel, or create a new one to start uploading sales data.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">

              {/* Product header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{selectedProduct.name}</h2>
                  <p className="text-sm text-gray-400">{selectedProduct.category}</p>
                </div>
                {stats && (
                  <button
                    onClick={handleDeleteSales}
                    className="inline-flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Trash2 size={12} /> Clear Sales Data
                  </button>
                )}
              </div>

              {/* Upload zone */}
              <div
                onClick={() => uploadState !== 'uploading' && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                className={`relative rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-indigo-400 bg-indigo-50'
                    : uploadState === 'uploading'
                    ? 'border-gray-200 bg-gray-50 cursor-default'
                    : uploadState === 'success'
                    ? 'border-green-300 bg-green-50 hover:border-green-400'
                    : uploadState === 'error'
                    ? 'border-red-200 bg-red-50 hover:border-red-300'
                    : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40'
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />

                {uploadState === 'uploading' && (
                  <div className="space-y-3">
                    <LoadingSpinner size="lg" className="mx-auto" />
                    <p className="text-sm font-medium text-gray-600">Uploading and processing…</p>
                    <p className="text-xs text-gray-400">Validating dates, detecting seasonality…</p>
                  </div>
                )}

                {uploadState === 'idle' && (
                  <div className="space-y-3">
                    <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto">
                      <CloudUpload size={22} className="text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">
                        {isDragging ? 'Drop CSV file here' : 'Drop CSV here or click to browse'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Required columns: <code className="bg-gray-100 px-1 rounded">date</code>, <code className="bg-gray-100 px-1 rounded">quantity</code></p>
                    </div>
                    <p className="text-xs text-gray-400">Date format: YYYY-MM-DD · Minimum 90 rows recommended</p>
                  </div>
                )}

                {uploadState === 'success' && uploadResult && (
                  <div className="space-y-2">
                    <CheckCircle size={32} className="mx-auto text-green-500" />
                    <p className="text-sm font-semibold text-green-700">
                      {uploadResult.inserted} rows uploaded successfully
                    </p>
                    {uploadResult.warnings.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {uploadResult.warnings.map((w, i) => (
                          <p key={i} className="text-xs text-amber-600 flex items-center justify-center gap-1">
                            <AlertTriangle size={11} /> {w}
                          </p>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2">Click to replace with a new file</p>
                  </div>
                )}

                {uploadState === 'error' && (
                  <div className="space-y-2">
                    <AlertCircle size={32} className="mx-auto text-red-500" />
                    <p className="text-sm font-semibold text-red-600">Upload failed</p>
                    <p className="text-xs text-red-500">{uploadError}</p>
                    <p className="text-xs text-gray-400">Click to try again</p>
                  </div>
                )}
              </div>

              {/* CSV format hint */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
                <FileSpreadsheet size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800">
                  <span className="font-semibold">CSV format:</span> Your file must have a <code className="bg-amber-100 px-1 rounded">date</code> column (YYYY-MM-DD) and a <code className="bg-amber-100 px-1 rounded">quantity</code> column (integer). Optional: <code className="bg-amber-100 px-1 rounded">price</code>.
                </div>
              </div>

              {/* Dataset stats */}
              {loadingStats ? (
                <div className="flex justify-center py-6"><LoadingSpinner /></div>
              ) : stats ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">Dataset Statistics</h3>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      stats.sufficient_for_forecast
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {stats.sufficient_for_forecast ? <CheckCircle size={10} /> : <AlertTriangle size={10} />}
                      {stats.sufficient_for_forecast ? 'Ready for forecast' : 'Insufficient data'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
                    <StatBadge icon={BarChart2} label="Total Rows" value={stats.total_rows} />
                    <StatBadge icon={Calendar} label="Date From" value={stats.date_from} />
                    <StatBadge icon={Calendar} label="Date To" value={stats.date_to} />
                    <StatBadge icon={TrendingUp} label="Mean Qty" value={stats.mean_quantity.toFixed(1)} />
                    <StatBadge icon={TrendingUp} label="Std Dev" value={stats.std_quantity.toFixed(1)} />
                    <StatBadge icon={AlertTriangle} label="Missing" value={stats.missing_values} warn={stats.missing_values > 0} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-3">
                      <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <TrendingUp size={14} className="text-blue-500" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">Qty Range</div>
                        <div className="text-sm font-semibold text-gray-900">
                          {stats.min_quantity} – {stats.max_quantity}
                        </div>
                      </div>
                    </div>
                    <div className={`border rounded-lg px-4 py-3 flex items-start gap-3 ${
                      stats.seasonality_detected ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        stats.seasonality_detected ? 'bg-green-100' : 'bg-gray-100'
                      }`}>
                        <BarChart2 size={14} className={stats.seasonality_detected ? 'text-green-600' : 'text-gray-400'} />
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-0.5">Seasonality</div>
                        <div className={`text-sm font-semibold ${stats.seasonality_detected ? 'text-green-700' : 'text-gray-500'}`}>
                          {stats.seasonality_detected ? 'Detected' : 'Not detected'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function StatBadge({
  icon: Icon, label, value, warn = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${warn ? 'bg-amber-50' : 'bg-indigo-50'}`}>
        <Icon size={14} className={warn ? 'text-amber-500' : 'text-indigo-500'} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-gray-400 mb-0.5">{label}</div>
        <div className="text-sm font-semibold text-gray-900 truncate">{value}</div>
      </div>
    </div>
  );
}
