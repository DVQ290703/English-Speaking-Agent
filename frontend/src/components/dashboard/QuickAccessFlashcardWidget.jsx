import { useListDecks } from '@/hooks/use-flashcard-api';
import { useT } from '@/i18n/useLanguage';
import { Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function QuickAccessFlashcardWidget() {
  const t = useT();
  const navigate = useNavigate();
  const { data: decks } = useListDecks();

  const totalDue = (decks || []).reduce((acc, d) => acc + (d.due_count || 0), 0);

  const handleClick = () => {
    navigate('/flashcards/decks');
  };

  return (
    <>
      {/* Desktop Version: Inline Widget */}
      <div className="hidden sm:block">
        <button
          onClick={handleClick}
          className="group relative flex items-center gap-3.5 px-5 h-14 rounded-2xl border-[1.5px] border-blue-100/50 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-black/20 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/5 hover:scale-[1.02] active:scale-95 overflow-hidden"
        >
          {/* Background Highlight */}
          <div className="absolute inset-0 bg-linear-to-br from-blue-50/50 to-transparent dark:from-slate-800/50 opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="relative flex items-center justify-center text-blue-600 dark:text-cyan-400 group-hover:scale-110 group-hover:brightness-110 transition-all duration-300">
            <Layers className="w-5 h-5" />
          </div>
          
          <div className="relative text-left flex flex-col justify-center min-w-[100px]">
            <div className="text-[10px] font-bold text-blue-500 dark:text-cyan-500/80 uppercase tracking-wider leading-none mb-1">
              {isVi ? 'THẺ GHI NHỚ' : 'FLASHCARDS'}
            </div>
            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 tracking-tight leading-tight">
              {isVi ? 'Ôn tập hàng ngày' : 'Daily Review'}
            </div>
          </div>

          {/* Pulse Badge */}
          {totalDue > 0 && (
            <div className="relative flex h-5.5 min-w-[22px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-lg shadow-red-500/40 border-2 border-white dark:border-slate-900 ml-1">
              <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-40"></span>
              <span className="relative">{totalDue > 99 ? '99+' : totalDue}</span>
            </div>
          )}
        </button>
      </div>

      {/* Mobile Version: FAB */}
      <div className="sm:hidden fixed bottom-6 right-6 z-50">
        <button
          onClick={handleClick}
          className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 dark:bg-cyan-500 shadow-2xl shadow-blue-600/40 dark:shadow-cyan-500/40 text-white dark:text-slate-900 transition-all active:scale-90"
        >
          <Layers className="w-7 h-7" />
          {totalDue > 0 && (
            <div className="absolute -top-1 -right-1 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white ring-2 ring-background border-2 border-white dark:border-slate-900">
              <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-40"></span>
              <span className="relative">{totalDue > 99 ? '99+' : totalDue}</span>
            </div>
          )}
        </button>
      </div>
    </>
  );
}

// Simple helper for localization within the component if needed, 
// though we usually use i18n keys.
const isVi = document.documentElement.lang === 'vi';
