import { Lightbulb, Volume2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PHONEME_TIPS, type Mistake } from './MessageBubble';

interface PronunciationDetailModalProps {
  word: string;
  correct?: string;
  phonemes?: NonNullable<Mistake['phonemes']>;
  note?: string;
  onClose: () => void;
}

export default function PronunciationDetailModal({
  word,
  correct,
  phonemes,
  note,
  onClose,
}: PronunciationDetailModalProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const selectedPhoneme = selected !== null && phonemes ? phonemes[selected] : null;
  const selectedTip = selectedPhoneme ? PHONEME_TIPS[selectedPhoneme.phoneme] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-md w-full p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center shrink-0">
              <Volume2 className="w-5 h-5 text-violet-600 dark:text-violet-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">Sửa phát âm</h3>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-sm text-red-500 dark:text-red-400 line-through font-medium">
                  {word}
                </span>
                {correct && correct !== word && (
                  <>
                    <span className="text-gray-400 dark:text-slate-500 text-xs">→</span>
                    <span className="text-sm text-green-600 dark:text-green-400 font-semibold">
                      {correct}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {note && (
          <p className="text-xs text-gray-700 dark:text-slate-200 leading-relaxed mb-4 px-1">
            {note}
          </p>
        )}

        {phonemes && phonemes.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                Phonemes
              </div>
              <div className="text-[11px] text-gray-500 dark:text-slate-400 italic">
                Bấm âm để xem gợi ý
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {phonemes.map((p, idx) => {
                const score = Math.round(p.accuracy_score);
                const isSelected = selected === idx;
                const base =
                  score >= 85
                    ? 'text-green-700 bg-green-50 border-green-500/40 hover:bg-green-100 dark:text-green-200 dark:bg-green-500/25 dark:border-green-400/60 dark:hover:bg-green-500/35'
                    : score >= 70
                      ? 'text-amber-700 bg-yellow-50 border-yellow-500/40 hover:bg-yellow-100 dark:text-amber-200 dark:bg-amber-500/25 dark:border-amber-400/60 dark:hover:bg-amber-500/35'
                      : 'text-orange-700 bg-orange-50 border-orange-500/40 hover:bg-orange-100 dark:text-orange-200 dark:bg-orange-500/25 dark:border-orange-400/60 dark:hover:bg-orange-500/35';
                const ring = isSelected
                  ? score >= 85
                    ? 'ring-2 ring-green-400/70 dark:ring-green-300/80'
                    : score >= 70
                      ? 'ring-2 ring-amber-400/70 dark:ring-amber-300/80'
                      : 'ring-2 ring-orange-400/70 dark:ring-orange-300/80'
                  : '';
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelected((prev) => (prev === idx ? null : idx))}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold cursor-pointer transition-all ${base} ${ring}`}
                  >
                    <span className="font-mono">/{p.phoneme}/</span>
                    <span className="text-xs font-semibold tabular-nums opacity-80">{score}%</span>
                  </button>
                );
              })}
            </div>

            {selectedPhoneme && (
              <div
                role="alert"
                className="rounded-xl border border-amber-300/70 bg-amber-50 dark:border-amber-400/40 dark:bg-amber-950/60 p-3 shadow-sm animate-fadeIn"
              >
                <div className="flex items-start gap-2.5">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-amber-200/70 dark:bg-amber-400/30 flex items-center justify-center">
                    <Lightbulb className="w-4 h-4 text-amber-700 dark:text-amber-200" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-200">
                        Gợi ý phát âm
                      </span>
                      <span className="font-mono text-sm font-bold text-amber-800 dark:text-amber-100">
                        /{selectedPhoneme.phoneme}/
                      </span>
                    </div>
                    {selectedTip ? (
                      <p className="text-[13px] text-gray-800 dark:text-amber-50 leading-relaxed">
                        {selectedTip}
                      </p>
                    ) : (
                      <p className="text-[13px] text-gray-500 dark:text-slate-300 italic leading-relaxed">
                        Chưa có gợi ý cho âm này.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500 dark:text-slate-400 italic text-center py-4">
            Không có dữ liệu phoneme cho từ này.
          </p>
        )}

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
