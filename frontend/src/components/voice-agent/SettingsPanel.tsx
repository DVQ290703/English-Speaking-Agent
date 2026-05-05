import { useT } from '../../i18n/useLanguage';
import { useTopics } from '../../hooks/useTopics';

const DIFFICULTY_BADGE: Record<string, { label: string; cls: string }> = {
  beginner: {
    label: 'Beginner',
    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  intermediate: {
    label: 'Intermediate',
    cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  advanced: {
    label: 'Advanced',
    cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
};

interface SettingsPanelProps {
  topic: string | null;
  onSelectTopic: (code: string) => void;
  onClose: () => void;
}

export default function SettingsPanel({ topic, onSelectTopic, onClose }: SettingsPanelProps) {
  const t = useT();
  const { categories, loading } = useTopics();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
      <div
        className="mt-18 mr-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl w-80 p-4 text-sm max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-800 dark:text-slate-100 mb-0.5 text-sm">
          {t('va.settings.title')}
        </h3>
        <p className="text-[10px] text-gray-500 dark:text-slate-400 mb-3">
          {t('va.settings.subtitle')}
        </p>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 rounded-lg bg-gray-100 dark:bg-slate-800 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {categories.map((cat) => {
              const catName =
                t(`category.${cat.code}.name`) !== `category.${cat.code}.name`
                  ? t(`category.${cat.code}.name`)
                  : cat.title;

              return (
                <div key={cat.code}>
                  {/* Category label */}
                  <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 px-1">
                    {catName}
                  </p>

                  {/* Topics in this category */}
                  <div className="space-y-1">
                    {cat.topics.map((tp) => {
                      const isActive = topic === tp.code;
                      const diff = tp.difficulty_level
                        ? DIFFICULTY_BADGE[tp.difficulty_level]
                        : null;

                      return (
                        <button
                          key={tp.code}
                          onClick={() => onSelectTopic(tp.code)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-start justify-between gap-2 ${
                            isActive
                              ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300'
                              : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 border border-transparent'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-gray-800 dark:text-slate-100 truncate">
                              {tp.title}
                            </div>
                            {tp.description && (
                              <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5 leading-snug line-clamp-2">
                                {tp.description}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {isActive && (
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1" />
                            )}
                            {diff && (
                              <span
                                className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${diff.cls}`}
                              >
                                {diff.label}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
