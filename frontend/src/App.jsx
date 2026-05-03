import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { getAuthSession } from './auth/tokenStorage';
import Skeleton from './components/ui/Skeleton';
import LoginPage from './pages/LoginPage';

const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const VoiceAgent = lazy(() => import('./pages/VoiceAgent'));

function PageFallback() {
  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-slate-950 px-6 py-10">
      <Skeleton className="h-8 w-64 mb-6" />
      <Skeleton className="h-96 w-full max-w-6xl" rounded="2xl" />
    </div>
  );
}

function ProtectedRoute({ children }) {
  const session = getAuthSession();
  if (!session?.token) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/VoiceAgent" element={<VoiceAgent />} />
        <Route path="/chat" element={<VoiceAgent />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}
