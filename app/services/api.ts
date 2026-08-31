// API Service for VbeatS application
// This module handles all API communication with the backend

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.vbeats.app';
const API_VERSION = 'v1';

const API_ENDPOINT = `${API_BASE_URL}/${API_VERSION}`;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
}

/**
 * Make API request
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', headers = {}, body } = options;

  const response = await fetch(`${API_ENDPOINT}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Beat endpoints
export const beatAPI = {
  getBeats: () => apiRequest('/beats'),
  getBeat: (id: string) => apiRequest(`/beats/${id}`),
  createBeat: (data: any) =>
    apiRequest('/beats', { method: 'POST', body: data }),
  updateBeat: (id: string, data: any) =>
    apiRequest(`/beats/${id}`, { method: 'PUT', body: data }),
  deleteBeat: (id: string) =>
    apiRequest(`/beats/${id}`, { method: 'DELETE' }),
};

// User endpoints
export const userAPI = {
  getProfile: () => apiRequest('/users/profile'),
  updateProfile: (data: any) =>
    apiRequest('/users/profile', { method: 'PUT', body: data }),
  getStats: () => apiRequest('/users/stats'),
};

// Transaction endpoints
export const transactionAPI = {
  getTransactions: () => apiRequest('/transactions'),
  getTransaction: (id: string) => apiRequest(`/transactions/${id}`),
};