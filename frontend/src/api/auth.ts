import client from './client';
import type { User } from '../types';

interface Token {
  access_token: string;
  token_type: string;
}

export const authApi = {
  register: async (email: string, password: string, full_name: string): Promise<User> => {
    const res = await client.post<User>('/auth/register', { email, password, full_name });
    return res.data;
  },

  login: async (email: string, password: string): Promise<Token> => {
    const res = await client.post<Token>('/auth/login', { email, password });
    return res.data;
  },

  me: async (): Promise<User> => {
    const res = await client.get<User>('/auth/me');
    return res.data;
  },
};
