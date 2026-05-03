import { Moon, Sun } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';

interface ThemeToggleProps {
  dark: boolean;
  onToggle: () => void;
  className?: string;
}

export default function ThemeToggle({ dark, onToggle, className = '' }: ThemeToggleProps) {
  const { t } = useLanguage();
  const title = dark ? t('theme.toggle.toLight') : t('theme.toggle.toDark');
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      aria-label={title}
      className={`w-7 h-7 rounded-full flex items-center justify-center text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors ${className}`}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
