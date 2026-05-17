import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Mic, Library, Menu, Key, Globe, Sun, Moon } from 'lucide-react';

import { toast } from 'sonner';

import { useLanguage } from '../../i18n/useLanguage';
import LanguageToggle from '../../i18n/LanguageToggle';
import ThemeToggle from '../../theme/ThemeToggle';
import { useDarkMode } from '../../theme/useDarkMode';
import { useAuth, User } from '../../auth/AuthContext';

import { MobileBottomNav } from './MobileBottomNav';
import { MobileDrawer } from './MobileDrawer';

export function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang, t } = useLanguage();
  const { logout, user: authUser } = useAuth();
  const [dark, toggleDark] = useDarkMode();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [profile, setProfile] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const constraintsRef = useRef(null);

  const toggleSidebar = () => setSidebarOpen((v) => !v);

  useEffect(() => {
    if (authUser) {
      setProfile(authUser);
    }
  }, [authUser]);

  const handleLogout = () => {
    logout();
    toast.success(t('toast.signedOut'));
  };

  const displayName = profile?.display_name || profile?.email || t('dash.fallbackName');

  return (
    <div
      ref={constraintsRef}
      className="h-[100dvh] flex flex-col bg-[#f5f7fa] dark:bg-slate-950 text-gray-900 dark:text-slate-100 overflow-hidden"
    >
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-6 py-2.5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-6">
          {location.pathname === '/chat' && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="md:hidden p-1.5 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <Link
            to="/dashboard"
            viewTransition
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-[10px] font-black text-white leading-none">VIN</span>
            </div>
            <span className="text-base font-bold text-gray-900 dark:text-slate-100 tracking-tight">
              {t('brand.name')}
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-3">
            <LanguageToggle />
            <ThemeToggle dark={dark} onToggle={toggleDark} />
          </div>

          <div className="relative">
            {profile ? (
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="hidden md:flex items-center gap-1.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg px-2.5 py-1 transition-colors"
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
            ) : (
              <Link
                to="/login"
                className="text-xs font-bold px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200 dark:shadow-none transition-all active:scale-95"
              >
                {t('common.signIn')}
              </Link>
            )}

            {showUserMenu && profile && (
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
                      navigate('/chat');
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                      <Mic className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-medium">{t('dash.newSession')}</span>
                  </button>
                  <Link
                    to="/flashcards/decks"
                    viewTransition
                    onClick={() => setShowUserMenu(false)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors border-t border-gray-100 dark:border-slate-800"
                  >
                    <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 flex items-center justify-center">
                      <Library className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-medium">{t('nav.flashcards')}</span>
                  </Link>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate('/change-password');
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors border-t border-gray-100 dark:border-slate-800"
                  >
                    <div className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 flex items-center justify-center">
                      <Key className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-medium">
                      {lang === 'vi' ? 'Đổi mật khẩu' : 'Change password'}
                    </span>
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

      <main className="flex-1 overflow-y-auto relative pb-16 md:pb-0">
        <Outlet context={{ sidebarOpen, setSidebarOpen, toggleSidebar }} />
      </main>

      <MobileBottomNav onMenuClick={() => setIsDrawerOpen(true)} />

      <MobileDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={t('nav.menu')}
      >
        <div className="space-y-6">
          {/* User Profile Info */}
          <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-2xl border border-gray-100 dark:border-slate-800">
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-lg font-bold text-white shadow-lg shadow-blue-500/20">
              {displayName?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-gray-900 dark:text-slate-100 truncate">
                {displayName}
              </div>
              <div className="text-xs text-gray-500 dark:text-slate-400 truncate">
                {profile?.email}
              </div>
            </div>
          </div>

          {/* Settings Group */}
          <div className="space-y-3">
            <div className="px-2 text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">
              Settings
            </div>
            <div className="bg-gray-50 dark:bg-slate-800/30 rounded-2xl border border-gray-100 dark:border-slate-800/50 divide-y divide-gray-100 dark:divide-slate-800 overflow-hidden">
              {/* Language Item */}
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Globe className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold text-gray-700 dark:text-slate-200">
                    {t('lang.toggle.title')}
                  </span>
                </div>
                <LanguageToggle />
              </div>

              {/* Theme Item */}
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </div>
                  <span className="text-sm font-bold text-gray-700 dark:text-slate-200">
                    {dark ? t('theme.toggle.toLight') : t('theme.toggle.toDark')}
                  </span>
                </div>
                <ThemeToggle dark={dark} onToggle={toggleDark} />
              </div>
            </div>
          </div>

          {/* Actions Group */}
          <div className="space-y-1">
            <div className="px-2 text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">
              Account
            </div>
            <button
              onClick={() => {
                setIsDrawerOpen(false);
                navigate('/change-password');
              }}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-gray-700 dark:text-slate-200"
            >
              <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                <Key className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold">
                {lang === 'vi' ? 'Đổi mật khẩu' : 'Change password'}
              </span>
            </button>
            <button
              onClick={() => {
                setIsDrawerOpen(false);
                handleLogout();
              }}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-red-600 dark:text-red-400"
            >
              <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-500/10 text-red-600 flex items-center justify-center">
                <LogOut className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold">{t('common.signOut')}</span>
            </button>
          </div>
        </div>
      </MobileDrawer>
    </div>
  );
}
