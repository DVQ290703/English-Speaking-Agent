import { CheckCircle2, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../i18n/LanguageContext';
import { FEEDBACK_ICON, type FeedbackType } from './constants';
import { type Message, type Mistake } from './MessageBubble';
import PronunciationDetailModal from './PronunciationDetailModal';

interface AiFeedbackPanelProps {
  displayMsg: Message | null;
  selectedMsg: Message | null;
  isAutoLatest: boolean;
  isConnected: boolean;
  onShowLatest: () => void;
  onPlayAudio: (id: number) => void;
}

const MISTAKE_TYPE_TO_FEEDBACK: Record<Mistake['type'], FeedbackType> = {
  Pronunciation: 'pronunciation',
  Grammar: 'grammar',
  'Word choice': 'vocabulary',
  Fluency: 'fluency',
};

export default function AiFeedbackPanel({
  displayMsg,
  selectedMsg,
  isAutoLatest,
  isConnected,
  onShowLatest,
  onPlayAudio,
}: AiFeedbackPanelProps) {
  const t = useT();
  const [activeMistake, setActiveMistake] = useState<Mistake | null>(null);
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
              {displayMsg.mistakes && displayMsg.mistakes.length > 0
                ? t('va.left.errorsCount', {
                    n: displayMsg.mistakes.length,
                  })
                : t('va.left.errors')}
            </span>

            {!displayMsg.mistakes || displayMsg.mistakes.length === 0 ? (
              <div className="rounded-md border border-green-200 bg-green-50 p-2 flex items-start gap-1.5 animate-fadeIn">
                <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-green-700 leading-snug">{t('va.left.noIssues')}</p>
              </div>
            ) : (
              displayMsg.mistakes.map((m, i) => {
                const meta = FEEDBACK_ICON[MISTAKE_TYPE_TO_FEEDBACK[m.type]];
                const Icon = meta.icon;
                const isPronunciation =
                  m.type === 'Pronunciation' && m.phonemes && m.phonemes.length > 0;
                const cardCls = `rounded-md border p-2 ${meta.bg} animate-fadeIn ${
                  isPronunciation
                    ? 'cursor-pointer hover:shadow-md hover:-translate-y-px transition-all text-left w-full'
                    : ''
                }`;
                const inner = (
                  <>
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-3 h-3 shrink-0 ${meta.color}`} />
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider ${meta.color}`}
                        >
                          {t(`va.mistake.${m.type}`)}
                        </span>
                      </div>
                      {isPronunciation && (
                        <span
                          className={`text-[8.5px] font-semibold ${meta.color} opacity-70 italic`}
                        >
                          Bấm để xem chi tiết →
                        </span>
                      )}
                    </div>
                    {m.wrong !== '—' && (
                      <p className="text-[10px] text-red-500 opacity-80 line-through mb-0.5 leading-snug">
                        {m.wrong}
                      </p>
                    )}
                    {m.correct !== '—' && (
                      <p className="text-[10px] text-green-600 font-medium mb-1 leading-snug">
                        {m.correct}
                      </p>
                    )}
                    {m.note && !isPronunciation && (
                      <p className="text-[9px] text-gray-700 dark:text-gray-300 leading-relaxed">
                        {m.note}
                      </p>
                    )}
                  </>
                );
                if (isPronunciation) {
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveMistake(m)}
                      className={cardCls}
                    >
                      {inner}
                    </button>
                  );
                }
                return (
                  <div key={i} className={cardCls}>
                    {inner}
                  </div>
                );
              })
            )}
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
      {activeMistake && (
        <PronunciationDetailModal
          word={activeMistake.wrong}
          correct={activeMistake.correct}
          phonemes={activeMistake.phonemes}
          note={activeMistake.note}
          onClose={() => setActiveMistake(null)}
        />
      )}
    </div>
  );
}
