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
  const color  = isGood ? "#22c55e" : isMid ? "#f59e0b" : "#f97316";
  const bg     = isGood ? "rgba(34,197,94,0.12)"  : isMid ? "rgba(245,158,11,0.12)" : "rgba(249,115,22,0.12)";
  const border = isGood ? "rgba(34,197,94,0.28)"  : isMid ? "rgba(245,158,11,0.28)" : "rgba(249,115,22,0.28)";
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
      <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400, fontSize: 9 }}>/100</span>
    </span>
  );
}

function ReplayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Replay"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: "50%",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.05)",
        color: "rgba(255,255,255,0.4)",
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
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
        (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.12)";
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
            ? "bg-blue-600/25 border border-blue-500/40"
            : "bg-purple-600/25 border border-purple-500/40"
        }`}
      >
        {isAgent ? <Bot className="w-3.5 h-3.5 text-blue-400" /> : <User className="w-3.5 h-3.5 text-purple-400" />}
      </div>

      <div className={`max-w-[75%] flex flex-col gap-1 ${isAgent ? "items-start" : "items-end"}`}>
        {/* Header row: name + time + replay + score */}
        <div className={`flex items-center gap-1.5 ${isAgent ? "" : "flex-row-reverse"}`}>
          <span className="text-[10px] font-medium text-gray-500">{isAgent ? "Agent" : "You"}</span>
          <span className="text-[10px] text-gray-700">{timeStr}</span>
          {!message.typing && onReplay && <ReplayButton onClick={onReplay} />}
          {!message.typing && !isAgent && message.score !== undefined && (
            <ScoreBadge score={message.score} />
          )}
        </div>

        {/* Bubble */}
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isAgent
              ? "bg-[#161d2e] border border-blue-900/40 text-gray-200 rounded-tl-sm"
              : "bg-[#1e1630] border border-purple-900/40 text-gray-200 rounded-tr-sm"
          }`}
        >
          {message.typing ? <TypingIndicator /> : message.text}
        </div>
      </div>
    </div>
  );
}
