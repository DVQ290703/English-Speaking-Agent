import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Mic, Library } from "lucide-react";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/useLanguage";
import LanguageToggle from "@/i18n/LanguageToggle";
import ThemeToggle from "@/theme/ThemeToggle";
import { useDarkMode } from "@/theme/useDarkMode";
import { getAuthSession, clearAuthSession } from "@/auth/tokenStorage";
import { fetchMe } from "@/api/auth";

interface LayoutProps {
  children: React.ReactNode;
}

export function FlashcardLayout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const [dark, toggleDark] = useDarkMode();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    const session = getAuthSession();
    if (!session?.token) {
      navigate('/', { replace: true });
      return;
    }
    if (session.user) {
      setProfile(session.user);
      return;
    }
    fetchMe(session.token).then(user => setProfile(user)).catch(() => {
      clearAuthSession();
      navigate('/', { replace: true });
    });
  }, [navigate]);

  const handleLogout = () => {
    clearAuthSession();
    toast.success(t('toast.signedOut'));
    navigate('/', { replace: true });
  };

  const displayName = profile?.display_name || profile?.email || t('dash.fallbackName');

  // Apply dark class to wrapper if needed
  const isDark = dark;

  return (
    <div className={isDark ? "dark" : ""}>
      <div className="min-h-[100dvh] flex flex-col bg-[#f5f7fa] dark:bg-slate-950 text-gray-900 dark:text-slate-100">
        <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center">
                <span className="text-[11px] font-black text-white leading-none">VIN</span>
              </div>
              <span className="text-base font-semibold text-gray-800 dark:text-slate-100">
                {t('brand.name')}
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <LanguageToggle />
            <ThemeToggle dark={dark} onToggle={toggleDark} />
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="flex items-center gap-1.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg px-2.5 py-1 transition-colors"
                title={displayName}
              >
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
                  {displayName?.[0]?.toUpperCase() ?? '?'}
                </div>
                <span className="text-xs text-gray-700 dark:text-slate-200 hidden sm:inline">
                  {displayName}
                </span>
                <svg
                  className={`w-3 h-3 text-gray-500 dark:text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-lg dark:shadow-black/50 z-40 overflow-hidden animate-fadeIn">
                    <div className="px-3 py-2.5 border-b border-gray-100 dark:border-slate-800">
                      <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">
                        {displayName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400 truncate">
                        {profile?.email}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        navigate('/VoiceAgent');
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors"
                    >
                      <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                        <Mic className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium">{t('dash.newSession')}</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        navigate('/flashcards/decks');
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors border-t border-gray-100 dark:border-slate-800"
                    >
                      <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 flex items-center justify-center">
                        <Library className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium">{lang === 'vi' ? 'Bộ thẻ' : 'Flashcards'}</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        handleLogout();
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-2 transition-colors border-t border-gray-100 dark:border-slate-800"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span className="ml-1">{t('common.signOut')}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1">
          {/* We keep the flashcard app's wrapper so the inner flashcard components look correct */}
          <div className="max-w-screen-xl mx-auto px-4 py-6 md:px-6 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
