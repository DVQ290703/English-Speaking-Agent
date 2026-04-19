import { Bot, Play, User } from "lucide-react";

export interface Message {
  id: number;
  role: "agent" | "user";
  text: string;
  timestamp: Date;
  typing?: boolean;
  audioUrl?: string;
  score?: number;
  minioUrl?: string;
  userAudioUrl?: string;
}

interface MessageBubbleProps {
  message: Message;
  onReplay?: () => void;
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
  const isGood = score >= 85;
  const isMid  = score >= 70;
  const cls = isGood
    ? "text-green-700 bg-green-50 border-green-500/35"
    : isMid
    ? "text-amber-700 bg-yellow-50 border-yellow-500/35"
    : "text-orange-700 bg-orange-50 border-orange-500/35";
  return (
    <span
      title="Pronunciation score"
      className={`inline-flex items-center gap-0.5 px-1.5 py-px rounded-full border text-[10px] font-bold leading-4 tracking-wide select-none ${cls}`}
    >
      {score}
      <span data-score-suffix="" className="text-black/30 font-normal text-[9px]">/100</span>
    </span>
  );
}

function ReplayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      data-replay-btn=""
      onClick={onClick}
      title="Replay"
      className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full border border-black/15 bg-black/4 text-black/35 cursor-pointer shrink-0 p-0 transition-all duration-150 hover:bg-blue-400/18 hover:text-blue-400 hover:border-blue-400/35"
    >
      <Play className="w-2 h-2 fill-current" />
    </button>
  );
}

export default function MessageBubble({ message, onReplay }: MessageBubbleProps) {
  const isAgent = message.role === "agent";
  const timeStr = message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      data-testid={`message-${message.id}`}
      className={`flex gap-2.5 ${isAgent ? "flex-row" : "flex-row-reverse"} items-end`}
      style={{ animation: "fadeSlideIn 0.3s ease-out" }}
    >
      <div
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center mb-0.5 ${
          isAgent
            ? "bg-blue-100 border-2 border-blue-300"
            : "bg-violet-100 border-2 border-violet-300"
        }`}
      >
        {isAgent ? <Bot className="w-3.5 h-3.5 text-blue-600" /> : <User className="w-3.5 h-3.5 text-purple-600" />}
      </div>

      <div className={`max-w-[75%] flex flex-col gap-1 ${isAgent ? "items-start" : "items-end"}`}>
        {/* Header row: name + time + replay + score */}
        <div className={`flex items-center gap-1.5 ${isAgent ? "" : "flex-row-reverse"}`}>
          <span className="text-[10px] font-medium text-gray-600">{isAgent ? "Agent" : "You"}</span>
          <span className="text-[10px] text-gray-400">{timeStr}</span>
          {!message.typing && onReplay && <ReplayButton onClick={onReplay} />}
          {!message.typing && !isAgent && message.score !== undefined && (
            <ScoreBadge score={message.score} />
          )}
        </div>

        {/* Bubble */}
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isAgent
              ? "bg-blue-50 border border-blue-300 text-gray-900 rounded-tl-sm"
              : "bg-violet-50 border border-violet-300 text-gray-900 rounded-tr-sm"
          }`}
        >
          {message.typing ? <TypingIndicator /> : message.text}
        </div>
      </div>
    </div>
  );
}
