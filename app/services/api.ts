import { getToken, isTokenExpired } from './tokenService';
import { refreshAccessToken } from './authService';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.vbeats.app';
const API_VERSION = 'v1';
const API_ENDPOINT = `${API_BASE_URL}/${API_VERSION}`;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  requiresAuth?: boolean;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', headers = {}, body, requiresAuth = false } = options;

  let token: string | null = null;
  const finalHeaders: Record<string, string> = { ...headers };

  if (requiresAuth) {
    token = await getToken();

    if (token && isTokenExpired(token)) {
      const refreshed = await refreshAccessToken();
      token = refreshed?.token ?? null;
    }

    if (token) {
      finalHeaders.Authorization = 'Bearer ' + token;
    }
  }

  finalHeaders['Content-Type'] = 'application/json';

  const response = await fetch(`${API_ENDPOINT}${endpoint}`, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized - Please login again');
    }

    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export const beatAPI = {
  getBeats: () => apiRequest('/beats', { requiresAuth: true }),
  getBeat: (id: string) => apiRequest(`/beats/${id}`, { requiresAuth: true }),
  createBeat: (data: unknown) =>
    apiRequest('/beats', { method: 'POST', body: data, requiresAuth: true }),
  updateBeat: (id: string, data: unknown) =>
    apiRequest(`/beats/${id}`, { method: 'PUT', body: data, requiresAuth: true }),
  deleteBeat: (id: string) =>
    apiRequest(`/beats/${id}`, { method: 'DELETE', requiresAuth: true }),
};

export const userAPI = {
  getProfile: () => apiRequest('/users/profile', { requiresAuth: true }),
  updateProfile: (data: unknown) =>
    apiRequest('/users/profile', { method: 'PUT', body: data, requiresAuth: true }),
  getStats: () => apiRequest('/users/stats', { requiresAuth: true }),
};

export const transactionAPI = {
  getTransactions: () => apiRequest('/transactions', { requiresAuth: true }),
  getTransaction: (id: string) => apiRequest(`/transactions/${id}`, { requiresAuth: true }),
};
