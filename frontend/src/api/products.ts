import client from './client';
import type { Product } from '../types';

interface ProductCreateData {
  name: string;
  category: string;
  search_keyword?: string;
  latitude?: number;
  longitude?: number;
}

export const productsApi = {
  getAll: async (): Promise<Product[]> => {
    const res = await client.get<Product[]>('/products');
    return res.data;
  },

  create: async (data: ProductCreateData): Promise<Product> => {
    const res = await client.post<Product>('/products', data);
    return res.data;
  },

  getById: async (id: string): Promise<Product> => {
    const res = await client.get<Product>(`/products/${id}`);
    return res.data;
  },

  delete: async (id: string): Promise<void> => {
    await client.delete(`/products/${id}`);
  },
};
