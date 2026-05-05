import { RefreshCw, Sparkles, Trophy, X } from 'lucide-react';
import { useT } from '../../i18n/useLanguage';

export interface SessionSummary {
  sentenceCount: number;
  totalErrors: number;
  scores: {
    overall: number;
    pronunciation: number;
    fluency: number;
    accuracy: number;
  };
  topErrors: [string, number][];
  tips: string[];
}

interface SessionSummaryModalProps {
  summary: SessionSummary;
  onDismiss: () => void;
  onViewDashboard: () => void;
  onNewSession: () => void;
}

export default function SessionSummaryModal({
  summary,
  onDismiss,
  onViewDashboard,
  onNewSession,
}: SessionSummaryModalProps) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/30" onClick={onDismiss} />
      <div className="relative w-full max-w-md rounded-xl border border-violet-200 bg-linear-to-br from-violet-50 via-white to-blue-50 shadow-2xl p-4">
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-2 right-2 p-1 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
          aria-label={t('common.close')}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start justify-between gap-3 mb-3 pr-6">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-violet-700" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{t('va.summary.title')}</h3>
              <p className="text-[11px] text-gray-500">
                {t('va.summary.meta', {
                  sentences: summary.sentenceCount,
                  errors: summary.totalErrors,
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onViewDashboard}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-violet-700 bg-white border border-violet-300 hover:bg-violet-50 transition-colors"
            >
              <span>📊</span>
              {t('va.summary.viewDashboard')}
            </button>
            <button
              type="button"
              onClick={onNewSession}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              {t('va.summary.newSession')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-3">
          {(
            [
              [t('va.score.overall'), summary.scores.overall],
              [t('va.score.pronShort'), summary.scores.pronunciation],
              [t('va.score.fluency'), summary.scores.fluency],
              [t('va.score.accuracy'), summary.scores.accuracy],
            ] as const
          ).map(([label, val]) => {
            const color =
              val >= 85 ? 'text-green-600' : val >= 70 ? 'text-yellow-600' : 'text-orange-600';
            return (
              <div
                key={label}
                className="va-stat-card rounded-md bg-white border border-gray-200 px-2 py-1.5 text-center"
              >
                <div className={`va-stat-value text-lg font-bold tabular-nums ${color}`}>{val}</div>
                <div className="va-stat-label text-[9px] uppercase tracking-wider text-gray-500">
                  {label}
                </div>
              </div>
            );
          })}
        </div>

        {summary.topErrors.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              {t('va.summary.topErrors')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {summary.topErrors.map(([type, count]) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-200"
                >
                  {t(`va.mistake.${type}`)}
                  <span className="text-red-500/80">×{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-violet-600" />
            {t('va.summary.tips')}
          </div>
          <ul className="space-y-1">
            {summary.tips.map((tip, i) => (
              <li
                key={i}
                className="text-[11px] text-gray-700 leading-snug pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-violet-500"
              >
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
