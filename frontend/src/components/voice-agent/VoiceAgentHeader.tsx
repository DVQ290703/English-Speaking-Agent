import { LogIn, LogOut, Menu, UserPlus } from 'lucide-react';
import { useT } from '../../i18n/useLanguage';
import LanguageToggle from '../../i18n/LanguageToggle';
import ThemeToggle from '../../theme/ThemeToggle';
import type { AuthUser } from './constants';

interface VoiceAgentHeaderProps {
  isDark: boolean;
  toggleDark: () => void;
  currentUser: AuthUser | null;
  showUserMenu: boolean;
  onToggleUserMenu: () => void;
  onCloseUserMenu: () => void;
  onRequestLogout: () => void;
  onNavigateDashboard: () => void;
  onNavigateSignIn: () => void;
  onNavigateSignUp: () => void;
  onToggleSidebar: () => void;
}

export default function VoiceAgentHeader({
  isDark,
  toggleDark,
  currentUser,
  showUserMenu,
  onToggleUserMenu,
  onCloseUserMenu,
  onRequestLogout,
  onNavigateDashboard,
  onNavigateSignIn,
  onNavigateSignUp,
  onToggleSidebar,
}: VoiceAgentHeaderProps) {
  const t = useT();
  return (
    <header
      data-va="header"
      className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-[#f5f7fa]"
    >
      <div className="flex items-center gap-2">
        {/* Hamburger toggle */}
        <button
          type="button"
          onClick={onToggleSidebar}
          title="Toggle history"
          aria-label="Toggle conversation history"
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* VIN logo + brand */}
        <button
          type="button"
          onClick={onNavigateDashboard}
          className="flex items-center gap-2 focus:outline-none cursor-pointer"
          title={t('common.dashboard')}
        >
          <div className="w-6 h-6 bg-blue-600 rounded-sm flex items-center justify-center">
            <span className="text-[10px] font-black text-white leading-none">VIN</span>
          </div>
          <span className="text-sm font-semibold text-gray-800">{t('brand.name')}</span>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <LanguageToggle />
        <ThemeToggle dark={isDark} onToggle={toggleDark} />
        {currentUser ? (
          <div className="relative">
            <button
              onClick={onToggleUserMenu}
              className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-lg px-2.5 py-1 transition-colors"
              title={currentUser.display_name || currentUser.email || t('common.user')}
            >
              <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
                {currentUser.display_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <span className="text-xs text-gray-700">
                {currentUser.display_name || currentUser.email || t('common.user')}
              </span>
              <svg
                className={`w-3 h-3 text-gray-500 transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
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
                <div className="fixed inset-0 z-30" onClick={onCloseUserMenu} />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-gray-200 shadow-lg z-40 overflow-hidden animate-fadeIn">
                  <div className="px-3 py-2.5 border-b border-gray-100">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {currentUser.display_name || t('common.user')}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{currentUser.email}</div>
                  </div>
                  <button
                    onClick={onRequestLogout}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" /> {t('common.signOut')}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onNavigateSignIn}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
            >
              <LogIn className="w-3 h-3" /> {t('common.signIn')}
            </button>
            <button
              onClick={onNavigateSignUp}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-gray-900 rounded-lg transition-colors"
            >
              <UserPlus className="w-3 h-3" /> {t('common.signUp')}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
