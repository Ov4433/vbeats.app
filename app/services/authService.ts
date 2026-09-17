import { apiRequest } from './api';
import {
  storeToken,
  storeRefreshToken,
  getToken,
  getRefreshToken,
  removeToken,
} from './tokenService';

interface LoginPayload {
  email: string;
  password: string;
}

interface SignupPayload {
  email: string;
  password: string;
  username: string;
  wallet?: string;
}

interface AuthResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    wallet?: string;
  };
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const response = await apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: payload,
  });

  await storeToken(response.token);
  await storeRefreshToken(response.refreshToken);

  return response;
}

export async function signup(payload: SignupPayload): Promise<AuthResponse> {
  const response = await apiRequest<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: payload,
  });

  await storeToken(response.token);
  await storeRefreshToken(response.refreshToken);

  return response;
}

export async function logout(): Promise<void> {
  try {
    const token = await getToken();

    if (token) {
      await apiRequest('/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
        },
      });
    }
  } finally {
    await removeToken();
  }
}

export async function refreshAccessToken(): Promise<AuthResponse | null> {
  try {
    const refreshToken = await getRefreshToken();

    if (!refreshToken) {
      return null;
    }

    const response = await apiRequest<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    });

    await storeToken(response.token);
    await storeRefreshToken(response.refreshToken);

    return response;
  } catch (error) {
    console.error('Token refresh error:', error);
    await removeToken();
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const token = await getToken();

    if (!token) {
      return false;
    }

    await apiRequest('/auth/verify', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
      },
    });

    return true;
  } catch (error) {
    console.error('Authentication check error:', error);
    return false;
  }
}

export async function getCurrentUser(): Promise<unknown> {
  try {
    const token = await getToken();

    if (!token) {
      return null;
    }

    return await apiRequest('/auth/me', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
      },
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    return null;
  }
}

export async function updateProfile(data: unknown): Promise<unknown> {
  const token = await getToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  return apiRequest('/auth/profile', {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + token,
    },
    body: data,
  });
}
