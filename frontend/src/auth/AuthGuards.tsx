import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Skeleton from '../components/ui/Skeleton';

// Simple loading screen to prevent flickering
const LoadingScreen = () => (
  <div className="min-h-screen bg-[#f5f7fa] dark:bg-slate-950 px-6 py-10">
    <Skeleton className="h-8 w-64 mb-6" />
    <Skeleton className="h-96 w-full max-w-6xl" rounded="2xl" />
  </div>
);

export const ProtectedRoute: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    // Redirect to login, but save the current location to redirect back after login
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
};

export const PublicRoute: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    // Redirect authenticated users to chat/dashboard
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
