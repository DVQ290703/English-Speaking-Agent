import { useMemo } from 'react';
import { Bot, Mic, Play, User, Volume2 } from 'lucide-react';
import { useT } from '../../i18n/useLanguage';
import ReasoningSteps from './ReasoningSteps';
import type { ToolCallStep } from '../../api/chat';
export type { ToolCallStep };

export interface Mistake {
  wrong: string;
  correct: string;
  type: 'Pronunciation' | 'Grammar' | 'Word choice' | 'Fluency';
  note?: string;
  phonemes?: { phoneme: string; accuracy_score: number }[];
}

export interface ScoreDetails {
  overall: number;
  pronunciation: number;
  fluency: number;
  accuracy: number;
  completeness?: number;
}

export interface Message {
  id: number;
  backendMessageId?: string;
  role: 'agent' | 'user';
  text: string;
  timestamp: Date;
  typing?: boolean;
  audioUrl?: string;
  score?: number;
  minioUrl?: string;
  userAudioUrl?: string;
  audioBlob?: Blob;
  scoreDetails?: ScoreDetails;
  mistakes?: Mistake[];
  grammarCorrectedSentence?: string;
  assessmentStatus?: 'available' | 'unavailable' | 'failed' | 'pending';
  assessmentNote?: string;
  toolSteps?: ToolCallStep[];
  grammarChecked?: boolean;
  suggestions?: string[];
}

const PHONEME_TIPS_BASE: Record<string, string> = {
  p: "Bật môi mạnh, không rung thanh quản (ví dụ 'pen'). Chú ý bật hơi rõ ở đầu từ.",
  b: "Khép môi, bật ra và rung thanh quản (ví dụ 'book').",
  t: "Đầu lưỡi chạm lợi trên rồi bật ra, không rung (ví dụ 'top'). Bật hơi rõ ở đầu từ.",
  d: "Đầu lưỡi chạm lợi trên, bật ra và rung thanh quản (ví dụ 'dog').",
  k: "Phần sau lưỡi chạm vòm mềm rồi bật ra, không rung (ví dụ 'cat').",
  g: "Phần sau lưỡi chạm vòm mềm, bật ra và rung thanh quản (ví dụ 'go').",
  f: "Răng trên chạm môi dưới, thổi hơi ra, không rung (ví dụ 'fish').",
  v: "Chạm răng trên vào môi dưới và rung, không bật môi (ví dụ 'very').",
  θ: "Đặt đầu lưỡi giữa hai cửa răng, thổi nhẹ, không rung (ví dụ 'think').",
  ð: "Đặt đầu lưỡi giữa răng, thổi và rung nhẹ (ví dụ 'this').",
  s: "Đầu lưỡi gần lợi trên, thổi hơi ra như tiếng rắn, không rung (ví dụ 'see').",
  z: "Như 's' nhưng rung thanh quản (ví dụ 'zoo'). Đừng phát âm thành 's'.",
  ʃ: "Đặt lưỡi hơi lùi, môi tròn nhẹ, thổi nhẹ, không rung (ví dụ 'she').",
  ʒ: "Tương tự 'ʃ' nhưng có rung thanh quản (ví dụ 'vision', 'measure').",
  h: "Thổi hơi nhẹ ra từ cổ họng, miệng mở (ví dụ 'hat').",
  tʃ: "Kết hợp 't' + 'ʃ', bật ra một tiếng ngắn (ví dụ 'church').",
  dʒ: "Kết hợp 'd' + 'ʒ', có rung thanh quản (ví dụ 'judge', 'gym').",
  m: "Khép môi, hơi đi qua mũi, có rung (ví dụ 'mom').",
  n: "Đầu lưỡi chạm lợi trên, hơi đi qua mũi, có rung (ví dụ 'no').",
  ŋ: "Sau lưỡi chạm vòm mềm, hơi đi qua mũi (ví dụ 'sing'). Không bật 'g' ra cuối.",
  l: "Chạm đầu lưỡi vào lợi trên khi phát âm (ví dụ 'light'). Cuối từ thì lưỡi cong nhẹ về sau.",
  r: "Cuộn nhẹ phần sau lưỡi hoặc uốn nhẹ lưỡi về sau, không chạm vòm; tránh phát âm giống 'đ' tiếng Việt.",
  w: "Tròn môi và đẩy môi ra trước (ví dụ 'we', 'water').",
  j: "Lưỡi gần vòm cứng, lướt nhanh sang nguyên âm sau (ví dụ 'yes').",
  ɪ: "Ngắn, không kéo dài, miệng hơi mở (ví dụ 'sit'). Không phát âm thành 'iː'.",
  iː: "Kéo dài âm 'ee', miệng hơi cười (ví dụ 'see', 'meet').",
  e: "Miệng mở vừa, lưỡi giữa-trước (ví dụ 'bed', 'red').",
  æ: "Mở miệng rộng, lưỡi thấp phía trước (ví dụ 'cat', 'apple').",
  ʌ: "Miệng mở vừa, lưỡi giữa, ngắn (ví dụ 'cup', 'love').",
  ɑ: "Mở rộng miệng, lưỡi thấp sau (ví dụ 'father', 'car').",
  ɒ: "Môi hơi tròn, miệng mở, ngắn (giọng Anh 'lot').",
  ɔ: "Môi tròn, kéo dài hơn 'ɒ' (ví dụ 'thought', 'law').",
  ʊ: "Ngắn, môi tròn nhẹ, giống 'u' (ví dụ 'book', 'put').",
  uː: "Kéo dài âm 'oo', môi tròn chặt (ví dụ 'food', 'blue').",
  ɜ: "Âm giữa miệng, giữ lưỡi ở giữa, kéo dài (ví dụ 'bird', 'work').",
  ə: "Schwa — âm trung tính, ngắn và yếu, không nhấn (ví dụ 'sofa', 'about').",
  eɪ: "Âm đôi, từ 'e' chuyển sang 'i' (ví dụ 'say', 'day').",
  aɪ: "Âm đôi, từ 'a' sang 'i' (ví dụ 'my', 'time').",
  ɔɪ: "Âm đôi, từ 'ɔ' sang 'i' (ví dụ 'boy', 'coin').",
  aʊ: "Âm đôi, từ 'a' sang 'u', môi tròn dần (ví dụ 'now', 'house').",
  oʊ: "Âm đôi, từ 'o' sang 'u' (giọng Mỹ 'go', 'no').",
  əʊ: "Âm đôi, bắt đầu schwa rồi sang 'u' (giọng Anh 'go', 'no').",
  ɪə: "Âm đôi, từ 'ɪ' sang schwa (giọng Anh 'here', 'near').",
  eə: "Âm đôi, từ 'e' sang schwa (giọng Anh 'hair', 'care').",
  ʊə: "Âm đôi, từ 'ʊ' sang schwa (giọng Anh 'tour', 'pure').",
};

const ARPABET_TO_IPA: Record<string, string> = {
  AA: 'ɑ',
  AE: 'æ',
  AH: 'ʌ',
  AO: 'ɔ',
  AW: 'aʊ',
  AY: 'aɪ',
  EH: 'e',
  ER: 'ɜ',
  EY: 'eɪ',
  IH: 'ɪ',
  IY: 'iː',
  OW: 'oʊ',
  OY: 'ɔɪ',
  UH: 'ʊ',
  UW: 'uː',
  AX: 'ə',
  B: 'b',
  CH: 'tʃ',
  D: 'd',
  DH: 'ð',
  F: 'f',
  G: 'g',
  HH: 'h',
  H: 'h',
  JH: 'dʒ',
  K: 'k',
  L: 'l',
  M: 'm',
  N: 'n',
  NG: 'ŋ',
  P: 'p',
  R: 'r',
  S: 's',
  SH: 'ʃ',
  T: 't',
  TH: 'θ',
  V: 'v',
  W: 'w',
  Y: 'j',
  Z: 'z',
  ZH: 'ʒ',
};

export const PHONEME_TIPS: Record<string, string> = (() => {
  const out: Record<string, string> = { ...PHONEME_TIPS_BASE };
  for (const [key, tip] of Object.entries(PHONEME_TIPS_BASE)) {
    if (key.endsWith('ː')) {
      const short = key.slice(0, -1);
      if (!(short in out)) out[short] = tip;
    } else {
      const long = key + 'ː';
      if (!(long in out)) out[long] = tip;
    }
  }
  for (const [arpa, ipa] of Object.entries(ARPABET_TO_IPA)) {
    const tip = out[ipa];
    if (!tip) continue;
    if (!(arpa in out)) out[arpa] = tip;
    const lower = arpa.toLowerCase();
    if (!(lower in out)) out[lower] = tip;
  }
  return out;
})();

// MultiDiffText helper for Grammar Accordion
function MultiDiffText({
  text,
  targets,
  type,
}: {
  text: string;
  targets: string[];
  type: 'wrong' | 'correct';
}) {
  if (!targets.length || !text) return <>{text}</>;

  const cleanTargets = targets.map((t) => t.replace(/^[^\w']+|[^\w']+$/g, '')).filter(Boolean);
  if (!cleanTargets.length) return <>{text}</>;

  const regexStr = cleanTargets
    .map((t) => {
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isWordStart = /^[\w']/.test(t);
      const isWordEnd = /[\w']$/.test(t);
      return `${isWordStart ? '\\b' : ''}${escaped}${isWordEnd ? '\\b' : ''}`;
    })
    .join('|');

  const regex = new RegExp(`(${regexStr})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = cleanTargets.some((t) => t.toLowerCase() === part.toLowerCase());
        if (isMatch) {
          if (type === 'wrong') {
            return (
              <span
                key={i}
                className="line-through decoration-red-400/60 text-red-600/80 dark:decoration-red-500/40 dark:text-red-400/80 bg-red-50/50 dark:bg-red-900/20 px-0.5 mx-0.5 rounded transition-colors"
              >
                {part}
              </span>
            );
          } else {
            return (
              <span
                key={i}
                className="font-bold text-green-700 dark:text-green-400 bg-green-100/70 dark:bg-green-900/30 px-1 mx-0.5 rounded transition-colors"
              >
                {part}
              </span>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

interface MessageBubbleProps {
  message: Message;
  onReplay?: () => void;
  expandable?: boolean;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  onSuggestionClick?: (text: string) => void;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 150, 300].map((delay) => (
        <div
          key={delay}
          className="w-1.5 h-1.5 rounded-full bg-blue-400"
          style={{ animation: `dotPulse 1.2s ease-in-out ${delay}ms infinite` }}
        />
      ))}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const t = useT();
  const isGood = score >= 85;
  const isMid = score >= 70;
  const cls = isGood
    ? 'text-green-700 bg-green-50 border-green-500/35 dark:text-green-200 dark:bg-green-500/25 dark:border-green-400/60'
    : isMid
      ? 'text-amber-700 bg-yellow-50 border-yellow-500/35 dark:text-amber-200 dark:bg-amber-500/25 dark:border-amber-400/60'
      : 'text-orange-700 bg-orange-50 border-orange-500/35 dark:text-orange-200 dark:bg-orange-500/25 dark:border-orange-400/60';
  return (
    <span
      title={t('bubble.score.title')}
      className={`inline-flex items-center gap-0.5 px-1.5 py-px rounded-full border text-[10px] font-bold leading-4 tracking-wide select-none ${cls}`}
    >
      <span className="tabular-nums font-bold">{score}</span>
      <span data-score-suffix className="font-normal text-[10px] ml-0.5 opacity-70">
        /<span className="font-semibold">100</span>
      </span>
    </span>
  );
}

function ReplayButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      onClick={onClick}
      title={t('bubble.replay.title')}
      className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full border border-black/15 bg-black/4 text-black/35 dark:border-white/20 dark:bg-white/5 dark:text-white/60 cursor-pointer shrink-0 p-0 transition-all duration-150 hover:bg-blue-400/20 hover:text-blue-600 hover:border-blue-400/35 dark:hover:bg-blue-400/20 dark:hover:text-blue-400 dark:hover:border-blue-400/40"
    >
      <Play className="w-2 h-2 fill-current" />
    </button>
  );
}

export default function MessageBubble({
  message,
  onReplay,
  expandable,
  isExpanded = false,
  onToggleExpanded,
  onSuggestionClick,
}: MessageBubbleProps) {
  const t = useT();

  const playWordAudio = (e: React.MouseEvent, word: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  const isAgent = message.role === 'agent';
  const tsDate =
    message.timestamp instanceof Date
      ? message.timestamp
      : new Date(message.timestamp as unknown as string | number);
  const timeStr = tsDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const canSelect = !isAgent && expandable && !message.typing;

  // Build a synthetic corrected sentence for the UI diff view
  const grammarCorrectedSentence = useMemo(() => {
    if (message.grammarCorrectedSentence) return message.grammarCorrectedSentence;
    let corrected = message.text;
    const grammarMistakes =
      message.mistakes?.filter((m) => m.type === 'Grammar' || m.type === 'Word choice') || [];
    grammarMistakes.forEach((m) => {
      const cleanWrong = m.wrong?.replace(/^[^\w']+|[^\w']+$/g, '');
      if (cleanWrong && m.correct) {
        const escaped = cleanWrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        corrected = corrected.replace(regex, m.correct);
      }
    });
    return corrected;
  }, [message.text, message.mistakes, message.grammarCorrectedSentence]);

  const renderExpandedDetails = () => {
    if (!message.mistakes || message.mistakes.length === 0) return null;

    const pronErrors = message.mistakes.filter((m) => m.type === 'Pronunciation');
    const gramErrors = message.mistakes.filter(
      (m) => m.type === 'Grammar' || m.type === 'Word choice',
    );

    return (
      <div
        className="flex flex-col gap-4 p-3 mt-1.5 bg-white dark:bg-[#1A1A1A] rounded-2xl border border-gray-200/60 dark:border-neutral-700/60 cursor-default text-left shadow-sm min-w-[280px] sm:min-w-[320px]"
        onClick={(e) => e.stopPropagation()}
      >
        {pronErrors.length > 0 && (
          <div className="flex flex-col gap-2">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-500/80">
              Pronunciation Issues
            </h5>
            {pronErrors.map((mistake, idx) => (
              <div
                key={idx}
                className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-orange-50/50 dark:bg-[#151515] border border-orange-100/50 dark:border-neutral-800 shadow-sm transition-colors"
              >
                <div className="flex flex-col justify-center items-start border-r border-orange-200/50 dark:border-neutral-800 pr-3">
                  <span className="text-xl font-bold text-gray-900 dark:text-[#EAEAEA] mb-1">
                    {mistake.wrong}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-orange-600 dark:text-orange-400/80 bg-orange-100/50 dark:bg-orange-900/30 px-2 py-0.5 rounded transition-colors">
                      /{mistake.correct || mistake.wrong}/
                    </span>
                    <button
                      type="button"
                      onClick={(e) => playWordAudio(e, mistake.correct || mistake.wrong)}
                      className="w-7 h-7 rounded-full flex items-center justify-center bg-white dark:bg-neutral-800 shadow-sm text-orange-500 hover:bg-orange-100 dark:hover:bg-neutral-700 transition-colors border border-gray-100 dark:border-neutral-700 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col justify-center pl-1">
                  {mistake.phonemes && mistake.phonemes.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {mistake.phonemes.map((p, pidx) => (
                        <span
                          key={pidx}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${p.accuracy_score < 80 ? 'bg-red-100/70 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100/70 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}
                        >
                          {p.phoneme} {p.accuracy_score}%
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400 mb-1">
                      Score: {message.scoreDetails?.pronunciation || '< 90'}
                    </span>
                  )}
                  {mistake.note && (
                    <span className="text-[11px] text-gray-600 dark:text-neutral-400 leading-snug">
                      {mistake.note}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {gramErrors.length > 0 && (
          <div className="flex flex-col gap-2">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400/80">
              Grammar & Word Choice
            </h5>
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-violet-50/30 dark:bg-[#151515] border border-violet-100/50 dark:border-neutral-800 shadow-sm transition-colors">
              <div className="p-2.5 rounded-lg bg-green-50/50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/20 transition-colors">
                <span className="text-[9px] font-bold uppercase tracking-wider text-green-600/70 dark:text-green-500/70 block mb-1">
                  Corrected Sentence
                </span>
                <p className="text-sm text-gray-800 dark:text-[#EAEAEA] leading-relaxed">
                  <MultiDiffText
                    text={grammarCorrectedSentence}
                    targets={gramErrors.map((g) => g.correct)}
                    type="correct"
                  />
                </p>
              </div>
              <div className="flex flex-col gap-1.5 mt-1">
                {gramErrors.map(
                  (mistake, idx) =>
                    mistake.note && (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-violet-100/40 dark:bg-violet-900/20 border border-violet-200/40 dark:border-violet-800/30 transition-colors"
                      >
                        <p className="text-xs text-violet-800 dark:text-violet-300/90 leading-relaxed">
                          <span className="font-bold mr-1.5 opacity-80">{mistake.correct}:</span>
                          {mistake.note}
                        </p>
                      </div>
                    ),
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTextWithErrors = () => {
    if (isAgent || !message.mistakes || message.mistakes.length === 0) {
      return message.text;
    }

    const mistakes = message.mistakes.map((m, i) => ({ ...m, originalIndex: i }));
    const sortedMistakes = [...mistakes].sort((a, b) => b.wrong.length - a.wrong.length);

    let result: React.ReactNode[] = [message.text];

    sortedMistakes.forEach((mistake) => {
      const cleanWrong = mistake.wrong.replace(/^[^\w']+|[^\w']+$/g, '');
      if (!cleanWrong) return;

      let matched = false;
      const newResult: React.ReactNode[] = [];

      result.forEach((chunk) => {
        if (typeof chunk === 'string') {
          const escaped = cleanWrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const isWordStart = /^[\w']/.test(cleanWrong);
          const isWordEnd = /[\w']$/.test(cleanWrong);
          const regexStr = `${isWordStart ? '\\b' : ''}${escaped}${isWordEnd ? '\\b' : ''}`;
          const regex = new RegExp(`(${regexStr})`, 'gi');

          const parts = chunk.split(regex);
          parts.forEach((part, i) => {
            if (part.toLowerCase() === cleanWrong.toLowerCase()) {
              matched = true;
              const isPronunciation = mistake.type === 'Pronunciation';

              const baseClass =
                'transition-all duration-200 rounded px-[2px] mx-[-2px] font-semibold';
              const underlineClass = isPronunciation
                ? 'underline decoration-wavy decoration-orange-500 dark:decoration-orange-400/80 underline-offset-4 text-orange-700 dark:text-orange-300'
                : 'underline decoration-dashed decoration-violet-500 dark:decoration-violet-400/80 underline-offset-4 text-violet-700 dark:text-violet-300';

              newResult.push(
                <span
                  key={`${mistake.originalIndex}-${i}`}
                  className={`${baseClass} ${underlineClass} ${!isExpanded ? 'hover:bg-gray-100 dark:hover:bg-white/10' : ''}`}
                >
                  {part}
                </span>,
              );
            } else if (part) {
              newResult.push(part);
            }
          });
        } else {
          newResult.push(chunk);
        }
      });

      if (!matched) {
        newResult.push(
          <span
            key={`fallback-${mistake.originalIndex}`}
            className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-orange-100 text-orange-700 border border-orange-200"
          >
            ! {mistake.wrong}
          </span>,
        );
      }

      result = newResult;
    });

    return result;
  };

  return (
    <div
      className={`flex gap-2.5 ${isAgent ? 'flex-row' : 'flex-row-reverse'} items-end`}
      style={{ animation: 'fadeSlideIn 0.3s ease-out' }}
    >
      <div
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center mb-0.5 ${
          isAgent
            ? 'bg-blue-100 border-2 border-blue-300 dark:bg-[#1A1A1A] dark:border-[#333]'
            : 'bg-violet-100 border-2 border-violet-300 dark:bg-[#1A1A1A] dark:border-[#333]'
        }`}
      >
        {isAgent ? (
          <Bot className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        ) : (
          <User className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
        )}
      </div>

      <div className={`max-w-[75%] flex flex-col gap-1 ${isAgent ? 'items-start' : 'items-end'}`}>
        <div className={`flex items-center gap-1.5 ${isAgent ? '' : 'flex-row-reverse'}`}>
          <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
            {isAgent ? t('common.agent') : t('common.you')}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{timeStr}</span>
          {!message.typing && onReplay && <ReplayButton onClick={onReplay} />}
          {!message.typing &&
            !isAgent &&
            (message.score !== undefined || message.scoreDetails?.overall !== undefined) && (
              <ScoreBadge score={message.score ?? message.scoreDetails?.overall ?? 0} />
            )}
        </div>

        <button
          type="button"
          onClick={canSelect ? onToggleExpanded : undefined}
          disabled={!canSelect}
          aria-pressed={canSelect ? Boolean(isExpanded) : undefined}
          className={`text-left px-3.5 py-2.5 rounded-2xl text-[15px] leading-relaxed whitespace-pre-wrap relative transition-all shadow-sm ${
            isAgent
              ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm cursor-default dark:bg-[#121212] dark:border-[#222222] dark:text-[#EAEAEA]'
              : `bg-violet-50/50 border text-gray-800 rounded-tr-sm dark:bg-[#1A1A1A] dark:text-[#EAEAEA] ${
                  canSelect
                    ? isExpanded
                      ? 'border-violet-300 ring-4 ring-violet-500/10 bg-violet-50 cursor-pointer dark:bg-[#1E1A24] dark:border-violet-500/40 dark:ring-violet-500/10'
                      : 'border-violet-200 hover:border-violet-300 hover:bg-violet-50/80 cursor-pointer dark:border-[#2A2A2A] dark:hover:border-violet-700/50 dark:hover:bg-[#1E1A24]'
                    : 'border-violet-200 cursor-default dark:border-[#2A2A2A]'
                }`
          }`}
        >
          <div className="w-full">
            {message.typing ? (
              <TypingIndicator />
            ) : message.text ? (
              renderTextWithErrors()
            ) : !isAgent && message.userAudioUrl ? (
              <span className="flex items-center gap-1.5 text-gray-400 text-xs">
                <Mic className="w-3 h-3 animate-pulse" />
                <span>Sending</span>
                <span className="flex items-center gap-0.5">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1 h-1 rounded-full bg-gray-400 inline-block"
                      style={{ animation: `dotPulse 1.2s ease-in-out ${delay}ms infinite` }}
                    />
                  ))}
                </span>
              </span>
            ) : (
              message.text
            )}
          </div>
        </button>

        <div
          className={`grid w-full transform-gpu will-change-[grid-template-rows,opacity,margin] transition-[grid-template-rows,opacity,margin-top] duration-400 ease-[cubic-bezier(0.2,1,0.2,1)] ${isExpanded && canSelect ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0 mt-0'}`}
        >
          <div className="overflow-hidden min-h-0 w-full flex justify-end">
            {canSelect && renderExpandedDetails()}
          </div>
        </div>
        {isAgent && !message.typing && (message.toolSteps?.length ?? 0) > 0 && (
          <ReasoningSteps steps={message.toolSteps!} />
        )}
        {isAgent &&
          !message.typing &&
          (message.suggestions?.length ?? 0) > 0 &&
          onSuggestionClick && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {message.suggestions!.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSuggestionClick(s)}
                  className="text-xs px-2.5 py-1 rounded-full border border-blue-200 bg-white text-blue-600 hover:bg-blue-50 hover:border-blue-400 transition-colors dark:bg-[#161616] dark:border-[#333] dark:text-blue-400 dark:hover:bg-[#1E1E1E] dark:hover:border-[#444]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
