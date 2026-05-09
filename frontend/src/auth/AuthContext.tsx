import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthSession, clearAuthSession, saveAuthSession } from './tokenStorage';

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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  const checkAuth = () => {
    const session = getAuthSession();
    if (session?.token) {
      setIsAuthenticated(true);
      setUser(session.user || null);
    } else {
      setIsAuthenticated(false);
      setUser(null);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    // Survives page reloads by checking localStorage on mount
    checkAuth();
  }, []);

  const login = (session: AuthSession) => {
    saveAuthSession(session);
    setIsAuthenticated(true);
    setUser(session.user || null);
  };

  const logout = () => {
    clearAuthSession();
    setIsAuthenticated(false);
    setUser(null);
    // Strictly redirect to /login and prevent back button usage
    navigate('/login', { replace: true });
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
