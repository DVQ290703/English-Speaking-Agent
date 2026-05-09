import { Bot, Play, User } from 'lucide-react';
import { useT } from '../../i18n/useLanguage';
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
  assessmentStatus?: 'available' | 'unavailable' | 'failed' | 'pending';
  assessmentNote?: string;
  toolSteps?: ToolCallStep[];
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

interface MessageBubbleProps {
  message: Message;
  onReplay?: () => void;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
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
      className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full border border-black/15 bg-black/4 text-black/35 dark:border-white/25 dark:bg-white/10 dark:text-white/70 cursor-pointer shrink-0 p-0 transition-all duration-150 hover:bg-blue-400/20 hover:text-blue-500 hover:border-blue-400/35 dark:hover:bg-blue-400/25 dark:hover:text-blue-300 dark:hover:border-blue-400/50"
    >
      <Play className="w-2 h-2 fill-current" />
    </button>
  );
}

export default function MessageBubble({
  message,
  onReplay,
  expandable,
  expanded,
  onToggleExpanded,
}: MessageBubbleProps) {
  const t = useT();
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

  return (
    <div
      className={`flex gap-2.5 ${isAgent ? 'flex-row' : 'flex-row-reverse'} items-end`}
      style={{ animation: 'fadeSlideIn 0.3s ease-out' }}
    >
      <div
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center mb-0.5 ${
          isAgent
            ? 'bg-blue-100 border-2 border-blue-300'
            : 'bg-violet-100 border-2 border-violet-300'
        }`}
      >
        {isAgent ? (
          <Bot className="w-3.5 h-3.5 text-blue-600" />
        ) : (
          <User className="w-3.5 h-3.5 text-purple-600" />
        )}
      </div>

      <div className={`max-w-[75%] flex flex-col gap-1 ${isAgent ? 'items-start' : 'items-end'}`}>
        <div className={`flex items-center gap-1.5 ${isAgent ? '' : 'flex-row-reverse'}`}>
          <span className="text-[10px] font-medium text-gray-600">
            {isAgent ? t('common.agent') : t('common.you')}
          </span>
          <span className="text-[10px] text-gray-400">{timeStr}</span>
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
          aria-pressed={canSelect ? Boolean(expanded) : undefined}
          title={canSelect ? (expanded ? t('bubble.deselect') : t('bubble.select')) : undefined}
          className={`text-left px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap relative transition-all ${
            isAgent
              ? 'bg-blue-50 border border-blue-300 text-gray-900 rounded-tl-sm cursor-default'
              : `bg-violet-50 border text-gray-900 rounded-tr-sm ${
                  canSelect
                    ? expanded
                      ? 'border-violet-500 ring-2 ring-violet-300/50 bg-violet-100 cursor-pointer'
                      : 'border-violet-300 hover:border-violet-400 hover:bg-violet-100/70 cursor-pointer'
                    : 'border-violet-300 cursor-default'
                }`
          }`}
        >
          {message.typing ? <TypingIndicator /> : message.text}
        </button>
      </div>
    </div>
  );
}
