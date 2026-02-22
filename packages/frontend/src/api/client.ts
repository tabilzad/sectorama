import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

api.interceptors.response.use(
  r => r,
  err => {
    const msg = err.response?.data?.error ?? err.message ?? 'Network error';
    return Promise.reject(new Error(msg));
  },
);
