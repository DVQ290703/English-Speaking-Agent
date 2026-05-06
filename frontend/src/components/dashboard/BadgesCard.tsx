import { useT } from '../../i18n/useLanguage';
import type { Badge } from '../../lib/gamification';

type Props = {
  badges: Badge[];
};

export default function BadgesCard({ badges }: Props) {
  const t = useT();
  const unlockedCount = badges.filter((b) => b.unlocked).length;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-5 mb-6">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">
            {t('badges.title')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{t('badges.subtitle')}</p>
        </div>
        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
          {t('badges.progress', { n: unlockedCount, total: badges.length })}
        </span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
        {badges.map((b) => (
          <div
            key={b.id}
            className={`group relative flex flex-col items-center p-2 rounded-xl border transition-all ${
              b.unlocked
                ? 'bg-linear-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 border-amber-200 dark:border-amber-500/30 shadow-sm'
                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-50 grayscale'
            }`}
            title={`${t(`badges.${b.id}.name`)} — ${t(`badges.${b.id}.desc`)}`}
          >
            <div className="text-2xl sm:text-3xl mb-1">{b.emoji}</div>
            <div className="text-[10px] sm:text-xs font-semibold text-center text-gray-700 dark:text-slate-200 leading-tight">
              {t(`badges.${b.id}.name`)}
            </div>
            {b.unlocked && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[10px]">
                ✓
              </span>
            )}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 dark:bg-slate-700 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
              {t(`badges.${b.id}.desc`)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
