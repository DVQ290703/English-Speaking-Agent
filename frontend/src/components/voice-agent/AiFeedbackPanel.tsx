import { CheckCircle2, Lightbulb, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../i18n/useLanguage';
import { type Message, type Mistake } from './MessageBubble';
import CombinedFeedbackModal from './CombinedFeedbackModal';

interface AiFeedbackPanelProps {
  displayMsg: Message | null;
  selectedMsg: Message | null;
  isAutoLatest: boolean;
  isConnected: boolean;
  grammarErrors: Mistake[];
  grammarCorrectedSentence: string;
  isGrammarLoading: boolean;
  isPronunciationLoading: boolean;
  onShowLatest: () => void;
  onPlayAudio: (id: number) => void;
}

export default function AiFeedbackPanel({
  displayMsg,
  selectedMsg,
  isAutoLatest,
  isConnected,
  grammarErrors,
  grammarCorrectedSentence,
  isGrammarLoading,
  isPronunciationLoading,
  onShowLatest,
  onPlayAudio,
}: AiFeedbackPanelProps) {
  const t = useT();
  const [showCombinedModal, setShowCombinedModal] = useState(false);
  const [activeModalType, setActiveModalType] = useState<'pronunciation' | 'grammar'>(
    'pronunciation',
  );
  const mistakes = displayMsg?.mistakes ?? [];
  const pronunciationErrors: Mistake[] = mistakes.filter((m) => m.type === 'Pronunciation');
  const effectiveGrammarErrors = grammarErrors;
  const hasCombinedErrors = pronunciationErrors.length > 0 || effectiveGrammarErrors.length > 0;
  const canShowGreatJob = !isPronunciationLoading && !isGrammarLoading && !hasCombinedErrors;
  return (
    <div className="px-2 mt-3 flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-gray-700 tracking-widest uppercase">
          {t('va.left.aiFeedback')}
        </span>
        {selectedMsg ? (
          <button
            type="button"
            onClick={onShowLatest}
            className="text-[9px] text-gray-500 hover:text-gray-800 underline"
          >
            {t('va.left.showLatest')}
          </button>
        ) : isAutoLatest ? (
          <span className="text-[9px] bg-violet-100 text-violet-700 border border-violet-200 rounded-full px-1.5 py-0.5">
            {t('va.left.latest')}
          </span>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin pr-0.5">
        {displayMsg ? (
          <>
            <div className="rounded-md border border-violet-200 bg-violet-50 p-2 animate-fadeIn">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-violet-700">
                  {selectedMsg ? t('va.left.selectedSentence') : t('va.left.latestSentence')}
                </span>
                {displayMsg.userAudioUrl && (
                  <button
                    type="button"
                    onClick={() => onPlayAudio(displayMsg.id)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold text-violet-700 bg-white border border-violet-200 hover:bg-violet-100 transition-colors"
                  >
                    <Volume2 className="w-2.5 h-2.5" />
                    {t('common.replay')}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-gray-800 italic leading-snug">
                &ldquo;{displayMsg.text}&rdquo;
              </p>

              {displayMsg.assessmentStatus === 'pending' && (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 p-2 flex items-center gap-2 mt-2 animate-fadeIn">
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
                  <p className="text-[10px] text-yellow-700 leading-snug">
                    {t('va.left.assessing')}
                  </p>
                </div>
              )}
            </div>

            {displayMsg.scoreDetails && (
              <div className="rounded-md border border-gray-200 bg-white p-2 animate-fadeIn">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-600 block mb-1.5">
                  {t('va.left.scoreBreakdown')}
                </span>
                <div className="flex flex-col gap-1">
                  {(() => {
                    const base: Array<[string, number]> = [
                      [t('va.score.overall'), displayMsg.scoreDetails.overall],
                      [t('va.score.pronunciation'), displayMsg.scoreDetails.pronunciation],
                      [t('va.score.fluency'), displayMsg.scoreDetails.fluency],
                      [t('va.score.accuracy'), displayMsg.scoreDetails.accuracy],
                    ];
                    if (displayMsg.scoreDetails.completeness != null) {
                      base.push([t('va.score.completeness'), displayMsg.scoreDetails.completeness]);
                    }
                    return base;
                  })().map(([label, val]) => {
                    const color =
                      val >= 85 ? 'bg-green-500' : val >= 70 ? 'bg-yellow-500' : 'bg-orange-500';
                    return (
                      <div key={label} className="flex items-center gap-1.5">
                        <span className="text-[9px] text-gray-600 w-16 shrink-0">{label}</span>
                        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${color} rounded-full`}
                            style={{ width: `${val}%` }}
                          />
                        </div>
                        <span className="text-[9px] font-bold text-gray-700 w-5 text-right tabular-nums">
                          {val}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-600 block px-1">
              {hasCombinedErrors
                ? t('va.left.errorsCount', {
                    n: pronunciationErrors.length + effectiveGrammarErrors.length,
                  })
                : t('va.left.errors')}
            </span>

            <div className="relative min-h-29.5">
              {canShowGreatJob ? (
                <div className="space-y-2 animate-fadeIn transition-all duration-200 ease-in-out">
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    <p className="text-[10px] text-emerald-700 leading-snug">
                      {t('va.left.perfectPronunciation')}
                    </p>
                  </div>
                  <div className="rounded-md border border-teal-200 bg-teal-50 p-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-teal-600 shrink-0" />
                    <p className="text-[10px] text-teal-700 leading-snug">
                      {t('va.left.correctGrammar')}
                    </p>
                  </div>
                </div>
              ) : hasCombinedErrors ? (
                <div className="space-y-2 animate-fadeIn transition-all duration-200 ease-in-out">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModalType('pronunciation');
                      setShowCombinedModal(true);
                    }}
                    className="w-full rounded-md border border-violet-200 bg-violet-50 p-2 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all text-left"
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <div className="flex items-center gap-1.5">
                        <Lightbulb className="w-3 h-3 shrink-0 text-violet-700" />
                        <span className="text-[9px] font-bold uppercase tracking-wider text-violet-700">
                          {t('va.left.pronunciationCardTitle')}
                        </span>
                      </div>
                      <span className="text-[8.5px] font-semibold text-violet-700 opacity-70 italic">
                        {t('va.left.clickDetails')}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-700 dark:text-slate-200 leading-snug">
                      {t('va.left.pronunciationSummary', {
                        pronunciation: pronunciationErrors.length,
                      })}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveModalType('grammar');
                      setShowCombinedModal(true);
                    }}
                    className="w-full rounded-md border border-fuchsia-200 bg-fuchsia-50 dark:border-fuchsia-700/40 dark:bg-fuchsia-950/20 p-2 cursor-pointer hover:shadow-md hover:-translate-y-px transition-all text-left"
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <div className="flex items-center gap-1.5">
                        <Lightbulb className="w-3 h-3 shrink-0 text-fuchsia-700 dark:text-fuchsia-300" />
                        <span className="text-[9px] font-bold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300">
                          {t('va.left.grammarCardTitle')}
                        </span>
                      </div>
                      <span className="text-[8.5px] font-semibold text-fuchsia-700 dark:text-fuchsia-300 opacity-70 italic">
                        {t('va.left.clickDetails')}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-700 dark:text-slate-200 leading-snug">
                      {t('va.left.grammarSummary', {
                        grammar: effectiveGrammarErrors.length,
                      })}
                    </p>
                  </button>
                </div>
              ) : null}

              {isGrammarLoading && (
                <div className="absolute inset-0 rounded-md border border-amber-200/70 bg-amber-50/85 backdrop-blur-[1px] p-2 flex items-center gap-2 pointer-events-none">
                  <div className="w-full space-y-1.5">
                    <div className="h-2.5 w-2/5 rounded bg-amber-200/70 animate-pulse" />
                    <div className="h-2 w-full rounded bg-amber-200/60 animate-pulse" />
                    <div className="h-2 w-4/5 rounded bg-amber-200/60 animate-pulse" />
                    <div className="h-2 w-3/5 rounded bg-amber-200/60 animate-pulse" />
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center py-8">
            <CheckCircle2 className="w-7 h-7 text-gray-400" />
            <p className="text-[10px] text-gray-500 leading-relaxed px-2">
              {isConnected
                ? t('va.left.feedbackEmptyConnected')
                : t('va.left.feedbackEmptyDisconnected')}
            </p>
          </div>
        )}
      </div>
      {showCombinedModal && (
        <CombinedFeedbackModal
          type={activeModalType}
          pronunciationErrors={pronunciationErrors}
          grammarErrors={effectiveGrammarErrors}
          grammarCorrectedSentence={grammarCorrectedSentence}
          onClose={() => setShowCombinedModal(false)}
        />
      )}
    </div>
  );
}
