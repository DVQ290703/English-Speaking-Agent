import { Lightbulb, Volume2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '../../i18n/useLanguage';
import { PHONEME_TIPS, type Mistake } from './MessageBubble';
import PhonemeTip from './PhonemeTip';

type FeedbackMode = 'pronunciation' | 'grammar';

interface CombinedFeedbackModalProps {
  type: FeedbackMode;
  pronunciationErrors: Mistake[];
  grammarErrors: Mistake[];
  grammarCorrectedSentence: string;
  onClose: () => void;
}

type SelectedPhoneme = { key: string; phoneme: string; score: number };

interface PronunciationIssueItemProps {
  m: Mistake;
  idx: number;
  isLast: boolean;
  selectedPhoneme: SelectedPhoneme | null;
  onPhonemeClick: (key: string, phoneme: string, score: number) => void;
  onClosePhonemeTip: () => void;
}

function PronunciationIssueItem({
  m,
  idx,
  isLast,
  selectedPhoneme,
  onPhonemeClick,
  onClosePhonemeTip,
}: PronunciationIssueItemProps) {
  const activeTipForItem = selectedPhoneme?.key.startsWith(`ph-${idx}-`) ? selectedPhoneme : null;

  return (
    <div className="relative px-3 py-2.5 bg-violet-50/60 dark:bg-violet-950/20">
      <div className="flex items-center gap-2 text-xs mb-1.5">
        {m.wrong !== '—' && (
          <span className="text-red-500 dark:text-red-400 line-through font-medium">{m.wrong}</span>
        )}
        {m.correct !== '—' && (
          <>
            <span className="text-gray-400 dark:text-slate-500">→</span>
            <span className="text-green-600 dark:text-green-400 font-semibold">{m.correct}</span>
          </>
        )}
      </div>
      {m.phonemes && m.phonemes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {m.phonemes.map((p, pIdx) => (
            <div key={`ph-${idx}-${pIdx}`} className="relative">
              <button
                type="button"
                data-phoneme-trigger-key={`ph-${idx}-${pIdx}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onPhonemeClick(`ph-${idx}-${pIdx}`, p.phoneme, Math.round(p.accuracy_score));
                }}
                className="inline-flex items-center gap-1 rounded-md border border-violet-300/60 dark:border-violet-500/40 px-2 py-0.5 text-[10px] text-violet-700 dark:text-violet-200 bg-white dark:bg-slate-800 hover:bg-violet-100 dark:hover:bg-slate-700 transition-all duration-200 ease-in-out"
              >
                <Volume2 className="w-2.5 h-2.5" />
                <span className="font-mono">/{p.phoneme}/</span>
                <span className="tabular-nums">{Math.round(p.accuracy_score)}%</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTipForItem && (
        <PhonemeTip
          phoneme={activeTipForItem.phoneme}
          score={activeTipForItem.score}
          tip={PHONEME_TIPS[activeTipForItem.phoneme] ?? ''}
          onClose={onClosePhonemeTip}
        />
      )}

      {m.note && <p className="text-[11px] text-gray-700 dark:text-slate-300 leading-relaxed">{m.note}</p>}
      {!isLast && <hr className="mt-2.5 border-violet-200 dark:border-violet-700/40" />}
    </div>
  );
}

export default function CombinedFeedbackModal({
  type,
  pronunciationErrors,
  grammarErrors,
  grammarCorrectedSentence,
  onClose,
}: CombinedFeedbackModalProps) {
  const t = useT();
  const [selectedPhoneme, setSelectedPhoneme] = useState<SelectedPhoneme | null>(null);
  const isGrammarMode = type === 'grammar';
  const hasPronunciationErrors = pronunciationErrors.length > 0;
  const hasGrammarErrors = grammarErrors.length > 0;
  const modalTitle = isGrammarMode ? 'Sửa lỗi ngữ pháp' : t('va.modal.pronunciationIssues');
  const modalSummary = isGrammarMode
    ? t('va.left.grammarSummary', { grammar: grammarErrors.length })
    : t('va.left.pronunciationSummary', {
        pronunciation: pronunciationErrors.length,
      });

  const onPhonemeClick = (key: string, phoneme: string, score: number) => {
    setSelectedPhoneme((prev) =>
      prev?.key === key ? null : { key, phoneme, score },
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!selectedPhoneme) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-phoneme-tip="true"]')) return;
      if (target.closest(`[data-phoneme-trigger-key="${selectedPhoneme.key}"]`)) return;
      setSelectedPhoneme(null);
    };
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [selectedPhoneme]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-2xl w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center shrink-0">
              <Lightbulb className="w-5 h-5 text-violet-600 dark:text-violet-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">
                {modalTitle}
              </h3>
              <p className="text-xs text-gray-600 dark:text-slate-300 mt-0.5">{modalSummary}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="max-h-[60vh] overflow-y-auto pr-1 space-y-4 scrollbar-thin"
          onScroll={() => setSelectedPhoneme(null)}
        >
          {isGrammarMode && grammarCorrectedSentence && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-700/40 bg-emerald-50/70 dark:bg-emerald-950/20 px-3 py-2.5">
              <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-1">
                {t('va.modal.targetSentence')}
              </div>
              <p className="text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed">
                {grammarCorrectedSentence}
              </p>
            </div>
          )}

          {!isGrammarMode && hasPronunciationErrors && (
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 mb-2">
                {t('va.modal.pronunciationIssues')}
              </h4>
              <div className="rounded-xl border border-violet-200 dark:border-violet-700/40 overflow-visible">
                {pronunciationErrors.map((m, idx) => (
                  <PronunciationIssueItem
                    key={`p-${idx}`}
                    m={m}
                    idx={idx}
                    isLast={idx === pronunciationErrors.length - 1}
                    selectedPhoneme={selectedPhoneme}
                    onPhonemeClick={onPhonemeClick}
                    onClosePhonemeTip={() => setSelectedPhoneme(null)}
                  />
                ))}
              </div>
            </section>
          )}

          {isGrammarMode && hasGrammarErrors && (
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300 mb-2">
                {t('va.modal.grammarIssues')}
              </h4>
              <div className="rounded-xl border border-fuchsia-200 dark:border-fuchsia-700/40 overflow-hidden">
                {grammarErrors.map((m, idx) => (
                  <div key={`g-${idx}`} className="px-3 py-2.5 bg-fuchsia-50/60 dark:bg-fuchsia-950/20">
                    <div className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                      {t('va.modal.original')}
                    </div>
                    <p className="text-xs text-red-500 dark:text-red-400 line-through mb-1.5">
                      {m.wrong}
                    </p>

                    <div className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                      {t('va.modal.corrected')}
                    </div>
                    <p className="text-xs text-green-600 dark:text-green-400 font-semibold mb-1.5">
                      {m.correct}
                    </p>

                    {m.note && (
                      <>
                        <div className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                          {t('va.modal.explanation')}
                        </div>
                        <p className="text-[11px] text-gray-700 dark:text-slate-300 leading-relaxed">
                          {m.note}
                        </p>
                      </>
                    )}
                    {!m.note && (
                      <p className="text-[11px] text-gray-500 dark:text-slate-400 italic leading-relaxed">
                        {t('va.modal.noExplanation')}
                      </p>
                    )}
                    {idx < grammarErrors.length - 1 && (
                      <hr className="mt-2.5 border-fuchsia-200 dark:border-fuchsia-700/40" />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors cursor-pointer"
        >
          Đã hiểu
        </button>
      </div>
    </div>
  );
}
