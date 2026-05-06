import { Lightbulb } from 'lucide-react';
import { useT } from '../../i18n/useLanguage';

interface PhonemeTipProps {
  phoneme: string;
  score: number;
  tip: string;
  onClose: () => void;
}

export default function PhonemeTip({ phoneme, score, tip, onClose }: PhonemeTipProps) {
  const t = useT();
  const resolvedTip = tip || t('va.tip.noTip');

  return (
    <div
      role="alert"
      data-phoneme-tip="true"
      className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-80 w-137.5 max-w-[calc(100vw-2rem)] rounded-2xl border border-amber-300/90 bg-amber-50 p-5 shadow-2xl ring-1 ring-amber-200/70 transition-all duration-200 ease-in-out dark:border-amber-400/40 dark:bg-amber-950 dark:ring-amber-400/20"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 border-l border-t border-amber-300/90 bg-amber-50 dark:border-amber-400/40 dark:bg-amber-950" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-amber-200/70 dark:bg-amber-400/30 flex items-center justify-center">
            <Lightbulb className="w-4 h-4 text-amber-700 dark:text-amber-200" />
          </div>
          <div className="flex flex-col gap-2 min-w-0 text-amber-900 dark:text-amber-100">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-200">
              {t('va.tip.title')}
            </div>
            <div className="text-[11px] leading-snug">
              <span className="font-semibold">{t('va.tip.phoneme')}:</span>{' '}
              <span className="font-mono">/{phoneme}/</span>
            </div>
            <div className="text-[11px] leading-snug">
              <span className="font-semibold">{t('va.tip.accuracy')}:</span>{' '}
              <span className="tabular-nums">{score}%</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] text-amber-800 dark:text-amber-100 hover:bg-amber-200/60 dark:hover:bg-amber-800/40"
        >
          {t('common.close')}
        </button>
      </div>

      <div className="mt-3.5 pl-11">
        <p className="text-[13px] text-gray-800 dark:text-amber-50 leading-relaxed wrap-break-word">
          {resolvedTip}
        </p>
      </div>
    </div>
  );
}
