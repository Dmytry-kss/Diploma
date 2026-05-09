import client from './client';
import type { SalesStats, SaleRecord, UploadResponse } from '../types';

export const salesApi = {
  upload: async (productId: string, file: File): Promise<UploadResponse> => {
    const form = new FormData();
    form.append('file', file);
    const res = await client.post<UploadResponse>(`/sales/upload/${productId}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  getStats: async (productId: string): Promise<SalesStats> => {
    const res = await client.get<SalesStats>(`/sales/${productId}/stats`);
    return res.data;
  },

  getSales: async (productId: string): Promise<SaleRecord[]> => {
    const res = await client.get<SaleRecord[]>(`/sales/${productId}`);
    return res.data;
  },

  delete: async (productId: string): Promise<void> => {
    await client.delete(`/sales/${productId}`);
  },
};
