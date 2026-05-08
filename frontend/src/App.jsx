import { lazy, Suspense, useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';

import { AuthProvider } from './auth/AuthContext';
import ShortcutsModal, { useShortcutsToggle } from './components/ui/ShortcutsModal';
import { useDarkMode } from './theme/useDarkMode';
import { HelpCircle } from 'lucide-react';

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
      <Outlet />
      <GlobalShortcuts />
      <GlobalHelpButton onClick={() => setOpen(true)} />
      <ShortcutsModal open={open} onClose={() => setOpen(false)} />
    </AuthProvider>
  );
}

