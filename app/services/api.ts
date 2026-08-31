// Update API service to include authorization header
// This file should replace the existing app/services/api.ts

import { getToken, isTokenExpired } from './tokenService';
import { refreshAccessToken } from './authService';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.vbeats.app';
const API_VERSION = 'v1';

const API_ENDPOINT = `${API_BASE_URL}/${API_VERSION}`;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  requiresAuth?: boolean;
}

/**
 * Make API request with automatic token refresh
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', headers = {}, body, requiresAuth = false } = options;

  let token: string | null = null;
  let finalHeaders = { ...headers };

  // Get token if auth is required
  if (requiresAuth || endpoint !== '/auth/login' && endpoint !== '/auth/signup') {
    token = await getToken();

    // If token exists and is expired, try to refresh
    if (token && isTokenExpired(token)) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        token = refreshed.token;
      }
    }

    // Add token to headers
    if (token) {
      finalHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  finalHeaders['Content-Type'] = 'application/json';

  const response = await fetch(`${API_ENDPOINT}${endpoint}`, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    // Handle 401 - Unauthorized
    if (response.status === 401) {
      // Token may be invalid, clear it
      throw new Error('Unauthorized - Please login again');
    }
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Beat endpoints
export const beatAPI = {
  getBeats: () => apiRequest('/beats', { requiresAuth: true }),
  getBeat: (id: string) => apiRequest(`/beats/${id}`, { requiresAuth: true }),
  createBeat: (data: any) =>
    apiRequest('/beats', { method: 'POST', body: data, requiresAuth: true }),
  updateBeat: (id: string, data: any) =>
    apiRequest(`/beats/${id}`, { method: 'PUT', body: data, requiresAuth: true }),
  deleteBeat: (id: string) =>
    apiRequest(`/beats/${id}`, { method: 'DELETE', requiresAuth: true }),
};

// User endpoints
export const userAPI = {
  getProfile: () => apiRequest('/users/profile', { requiresAuth: true }),
  updateProfile: (data: any) =>
    apiRequest('/users/profile', { method: 'PUT', body: data, requiresAuth: true }),
  getStats: () => apiRequest('/users/stats', { requiresAuth: true }),
};

// Transaction endpoints
export const transactionAPI = {
  getTransactions: () => apiRequest('/transactions', { requiresAuth: true }),
  getTransaction: (id: string) => apiRequest(`/transactions/${id}`, { requiresAuth: true }),
};
