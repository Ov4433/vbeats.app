import { useState, useCallback, useEffect } from 'react';
import {
  login as apiLogin,
  signup as apiSignup,
  logout as apiLogout,
  getCurrentUser,
  isAuthenticated as checkAuthenticated,
  refreshAccessToken,
} from '../services/authService';
import { getToken, isTokenExpired } from '../services/tokenService';

interface User {
  id: string;
  email: string;
  username: string;
  wallet?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication on app startup
  useEffect(() => {
    checkAuthStatus();
  }, []);

  /**
   * Check if user is authenticated
   */
  const checkAuthStatus = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();

      if (!token) {
        setIsAuthenticated(false);
        setUser(null);
        return;
      }

      // Check if token is expired
      if (isTokenExpired(token)) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          setIsAuthenticated(false);
          setUser(null);
          return;
        }
      }

      // Fetch current user
      const isAuth = await checkAuthenticated();
      if (isAuth) {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (err) {
      console.error('Auth check error:', err);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Login user
   */
  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiLogin({ email, password });
        setUser(response.user);
        setIsAuthenticated(true);
        return response;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Login failed';
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Sign up user
   */
  const signup = useCallback(
    async (email: string, password: string, username: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiSignup({ email, password, username });
        setUser(response.user);
        setIsAuthenticated(true);
        return response;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Signup failed';
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Logout user
   */
  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await apiLogout();
      setUser(null);
      setIsAuthenticated(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Logout failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Refresh token if needed
   */
  const refreshToken = useCallback(async () => {
    try {
      const token = await getToken();
      if (token && isTokenExpired(token)) {
        await refreshAccessToken();
      }
    } catch (err) {
      console.error('Token refresh failed:', err);
    }
  }, []);

  return {
    user,
    loading,
    error,
    isAuthenticated,
    login,
    signup,
    logout,
    refreshToken,
    checkAuthStatus,
  };
}