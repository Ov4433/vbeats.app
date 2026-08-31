// Authentication Service for VbeatS
// Handles login, signup, logout, and token refresh

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

/**
 * Login user with email and password
 */
export async function login(payload: LoginPayload): Promise<AuthResponse> {
  try {
    const response = await apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: payload,
    });

    // Store tokens securely
    await storeToken(response.token);
    await storeRefreshToken(response.refreshToken);

    return response;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

/**
 * Sign up new user
 */
export async function signup(payload: SignupPayload): Promise<AuthResponse> {
  try {
    const response = await apiRequest<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: payload,
    });

    // Store tokens securely
    await storeToken(response.token);
    await storeRefreshToken(response.refreshToken);

    return response;
  } catch (error) {
    console.error('Signup error:', error);
    throw error;
  }
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
  try {
    const token = await getToken();
    if (token) {
      // Notify server of logout
      await apiRequest('/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Remove tokens from device regardless of server response
    await removeToken();
  }
}

/**
 * Refresh access token using refresh token
 */
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

    // Store new tokens
    await storeToken(response.token);
    await storeRefreshToken(response.refreshToken);

    return response;
  } catch (error) {
    console.error('Token refresh error:', error);
    // If refresh fails, clear tokens
    await removeToken();
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const token = await getToken();
    if (!token) {
      return false;
    }

    // Verify token with server
    await apiRequest('/auth/verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return true;
  } catch (error) {
    console.error('Authentication check error:', error);
    return false;
  }
}

/**
 * Get current user profile
 */
export async function getCurrentUser(): Promise<any> {
  try {
    const token = await getToken();
    if (!token) {
      return null;
    }

    return await apiRequest('/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    return null;
  }
}

/**
 * Update user profile
 */
export async function updateProfile(data: any): Promise<any> {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    return await apiRequest('/auth/profile', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: data,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
}