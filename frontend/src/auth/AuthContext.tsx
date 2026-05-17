import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthSession, clearAuthSession, saveAuthSession } from './tokenStorage';
import { fetchMe } from '../api/auth';

export interface User {
  id: string;
  email: string;
  display_name: string;
  [key: string]: unknown;
}

export interface AuthSession {
  token: string;
  user: User;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  login: (session: AuthSession) => void;
  logout: () => void;
  checkAuth: () => void;
}

/**
 * Custom event name fired when any API call receives a 401 response.
 * The AuthProvider listens for this to auto-logout.
 */
export const AUTH_EXPIRED_EVENT = 'auth:expired';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  const logout = useCallback(() => {
    clearAuthSession();
    setIsAuthenticated(false);
    setUser(null);
    // Strictly redirect to /login and prevent back button usage
    navigate('/login', { replace: true });
  }, [navigate]);

  /**
   * Validate the stored token against the backend.
   * If the token is missing or the backend rejects it, clear the session.
   */
  const checkAuth = useCallback(async () => {
    const session = getAuthSession();

    if (!session?.token) {
      setIsAuthenticated(false);
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      // Verify token is still valid by calling /api/auth/me
      const freshUser = await fetchMe(session.token);
      // Update stored user data in case it changed server-side
      saveAuthSession({ token: session.token, user: freshUser });
      setIsAuthenticated(true);
      setUser(freshUser);
    } catch {
      // Token is expired, revoked, or backend is unreachable — clear stale session
      clearAuthSession();
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Validate token against backend on mount (page reload / first visit)
    checkAuth();
  }, [checkAuth]);

  // Listen for 401 events dispatched by API calls to auto-logout
  useEffect(() => {
    const handleAuthExpired = () => {
      logout();
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, [logout]);

  const login = (session: AuthSession) => {
    saveAuthSession(session);
    setIsAuthenticated(true);
    setUser(session.user || null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
