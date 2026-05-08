import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute, PublicRoute } from './auth/AuthGuards';
import Skeleton from './components/ui/Skeleton';
import ShortcutsModal, { useShortcutsToggle } from './components/ui/ShortcutsModal';
import LoginPage from './pages/LoginPage';
import { useDarkMode } from './theme/useDarkMode';
import { HelpCircle } from 'lucide-react';

const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const VoiceAgent = lazy(() => import('./pages/VoiceAgent'));
const FlashcardDecksPage = lazy(() => import('./pages/FlashcardDecksPage'));
const FlashcardCardsPage = lazy(() => import('./pages/FlashcardCardsPage'));
const FlashcardStudyPage = lazy(() => import('./pages/FlashcardStudyPage'));
import { FlashcardLayout } from './components/flashcards/FlashcardLayout';

function PageFallback() {
  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-slate-950 px-6 py-10">
      <Skeleton className="h-8 w-64 mb-6" />
      <Skeleton className="h-96 w-full max-w-6xl" rounded="2xl" />
    </div>
  );
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
        navigate('/chat');
      } else if (key === 'f') {
        if (!window.location.pathname.startsWith('/flashcards')) {
          e.preventDefault();
          navigate('/flashcards/decks');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleDark, navigate]);
  return null;
}

function GlobalHelpButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 left-6 z-50 p-2.5 rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-all duration-200 group"
      aria-label="Help and keyboard shortcuts"
      title="Keyboard shortcuts"
    >
      <HelpCircle className="w-6 h-6" />
    </button>
  );
}

export default function App() {
  const { open, setOpen } = useShortcutsToggle();
  return (
    <AuthProvider>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Public / Hybrid Routes */}
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Hybrid Route: Accessible to everyone, logic inside the component */}
          <Route path="/chat" element={<VoiceAgent />} />
          <Route path="/VoiceAgent" element={<Navigate to="/chat" replace />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            
            <Route path="/flashcards" element={<Navigate to="/flashcards/decks" replace />} />
            <Route path="/flashcards" element={<FlashcardLayout />}>
              <Route path="decks" element={<FlashcardDecksPage />} />
              <Route path="decks/:deckId/cards" element={<FlashcardCardsPage />} />
              <Route path="decks/:deckId/study" element={<FlashcardStudyPage />} />
            </Route>
          </Route>

          {/* Root Redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <GlobalShortcuts />
      <GlobalHelpButton onClick={() => setOpen(true)} />
      <ShortcutsModal open={open} onClose={() => setOpen(false)} />
    </AuthProvider>
  );
}

