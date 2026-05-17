import { Link, useLocation } from 'react-router-dom';
import { Mic, LayoutDashboard, Library, UserCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../i18n/useLanguage';

interface MobileBottomNavProps {
  onMenuClick: () => void;
}

export function MobileBottomNav({ onMenuClick }: MobileBottomNavProps) {
  const location = useLocation();
  const { t } = useLanguage();

  const navItems = [
    {
      label: t('nav.chat') || 'Chat',
      path: '/chat',
      icon: Mic,
    },
    {
      label: t('nav.dashboard') || 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: t('nav.flashcards') || 'Flashcards',
      path: '/flashcards/decks',
      icon: Library,
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-t border-gray-200 dark:border-slate-800 z-50 px-2 pb-[env(safe-area-inset-bottom,12px)] pt-2 shadow-[0_-4px_16px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-around max-w-lg mx-auto relative">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(
            item.path.split('/')[1] === 'chat' ? '/chat' : item.path,
          );
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`relative flex flex-col items-center gap-1 py-1 px-3 transition-colors duration-300 ${
                isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute -top-1 inset-x-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full"
                  transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                />
              )}
              <Icon
                className={`w-5 h-5 ${isActive ? 'fill-blue-50' : ''} dark:${isActive ? 'fill-blue-500/10' : ''}`}
              />
              <span className="text-[10px] font-bold tracking-tight uppercase">{item.label}</span>
            </Link>
          );
        })}

        <button
          onClick={onMenuClick}
          className="flex flex-col items-center gap-1 py-1 px-3 text-gray-400 dark:text-slate-500 hover:text-gray-600 transition-colors"
        >
          <UserCircle className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-tight uppercase">Menu</span>
        </button>
      </div>
    </nav>
  );
}
