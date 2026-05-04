import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { getAuthSession } from './auth/tokenStorage';
import Skeleton from './components/ui/Skeleton';
import ShortcutsModal, { useShortcutsToggle } from './components/ui/ShortcutsModal';
import { useT } from './i18n/useLanguage';
import LoginPage from './pages/LoginPage';
import { useDarkMode } from './theme/useDarkMode';

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
  const t = useT();
  const location = useLocation();
  const session = getAuthSession();
  useEffect(() => {
    if (!session?.token) {
      toast.info(t('toast.loginRequired'));
    }
    // we only want this to fire once per redirect attempt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  if (!session?.token) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function GlobalShortcuts() {
  const [, toggleDark] = useDarkMode();
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e) => {
      const target = e.target;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
      if (isEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 't') {
        e.preventDefault();
        toggleDark();
      } else if (key === 'n') {
        e.preventDefault();
        navigate('/VoiceAgent');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleDark, navigate]);
  return null;
}

export default function App() {
  const { open, setOpen } = useShortcutsToggle();
  return (
    <>
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
      <GlobalShortcuts />
      <ShortcutsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
