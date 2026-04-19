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
  const color  = isGood ? "#15803d" : isMid ? "#b45309" : "#c2410c";
  const bg     = isGood ? "rgba(34,197,94,0.10)"  : isMid ? "rgba(245,158,11,0.10)" : "rgba(249,115,22,0.10)";
  const border = isGood ? "rgba(34,197,94,0.35)"  : isMid ? "rgba(245,158,11,0.35)" : "rgba(249,115,22,0.35)";
  return (
    <span
      title="Pronunciation score"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: "1px 7px",
        borderRadius: 999,
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: 10,
        fontWeight: 700,
        lineHeight: "16px",
        letterSpacing: "0.02em",
        userSelect: "none",
      }}
    >
      {score}
      <span data-score-suffix="" style={{ color: "rgba(0,0,0,0.3)", fontWeight: 400, fontSize: 9 }}>/100</span>
    </span>
  );
}

function ReplayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      data-replay-btn=""
      onClick={onClick}
      title="Replay"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: "50%",
        border: "1px solid rgba(0,0,0,0.15)",
        background: "rgba(0,0,0,0.04)",
        color: "rgba(0,0,0,0.35)",
        cursor: "pointer",
        flexShrink: 0,
        transition: "all 140ms ease",
        padding: 0,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(96,165,250,0.18)";
        (e.currentTarget as HTMLButtonElement).style.color = "#60a5fa";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(96,165,250,0.35)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.04)";
        (e.currentTarget as HTMLButtonElement).style.color = "rgba(0,0,0,0.35)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,0,0,0.15)";
      }}
    >
      <Play style={{ width: 8, height: 8, fill: "currentColor" }} />
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
