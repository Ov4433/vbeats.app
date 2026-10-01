import { getToken, isTokenExpired } from './tokenService';
import { refreshAccessToken } from './authService';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://vbeats-api.onrender.com';
const API_VERSION = 'v1';
const API_ENDPOINT = `${API_BASE_URL}/${API_VERSION}`;

/**
 * The API returns relative asset paths (e.g. `/uploads/abc.m4a`).
 * Resolve them against the API host before playback or <Image>.
 */
export function resolveMediaUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? url : '/' + url}`;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  requiresAuth?: boolean;
}

async function authHeaders(): Promise<Record<string, string>> {
  let token = await getToken();

  if (token && isTokenExpired(token)) {
    const refreshed = await refreshAccessToken();
    token = refreshed?.token ?? null;
  }

  return token ? { Authorization: 'Bearer ' + token } : {};
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', headers = {}, body, requiresAuth = false } = options;

  const finalHeaders: Record<string, string> = { ...headers };

  if (requiresAuth) {
    Object.assign(finalHeaders, await authHeaders());
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

/**
 * Multipart upload (e.g. beat audio). Unlike apiRequest, this does NOT set
 * a JSON Content-Type — fetch sets the multipart boundary automatically.
 */
export async function apiUpload<T>(
  endpoint: string,
  formData: FormData,
  options: { headers?: Record<string, string>; requiresAuth?: boolean } = {}
): Promise<T> {
  const { headers = {}, requiresAuth = false } = options;

  const finalHeaders: Record<string, string> = { ...headers };

  if (requiresAuth) {
    Object.assign(finalHeaders, await authHeaders());
  }

  const response = await fetch(`${API_ENDPOINT}${endpoint}`, {
    method: 'POST',
    headers: finalHeaders,
    body: formData,
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
