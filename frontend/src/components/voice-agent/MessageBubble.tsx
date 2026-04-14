import { Bot, User } from "lucide-react";

export interface Message {
  id: number;
  role: "agent" | "user";
  text: string;
  timestamp: Date;
  typing?: boolean;
  audioUrl?: string;
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

export default function MessageBubble({ message }: { message: Message }) {
  const isAgent = message.role === "agent";
  const timeStr = message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      data-testid={`message-${message.id}`}
      className={`flex gap-2.5 ${isAgent ? "flex-row" : "flex-row-reverse"} items-end`}
      style={{ animation: "fadeSlideIn 0.3s ease-out" }}
    >
      <div
        className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mb-0.5 ${
          isAgent
            ? "bg-blue-600/25 border border-blue-500/40"
            : "bg-purple-600/25 border border-purple-500/40"
        }`}
      >
        {isAgent ? <Bot className="w-3.5 h-3.5 text-blue-400" /> : <User className="w-3.5 h-3.5 text-purple-400" />}
      </div>

      <div className={`max-w-[75%] flex flex-col gap-1 ${isAgent ? "items-start" : "items-end"}`}>
        <div className={`flex items-center gap-1.5 ${isAgent ? "" : "flex-row-reverse"}`}>
          <span className="text-[10px] font-medium text-gray-500">{isAgent ? "Agent" : "You"}</span>
          <span className="text-[10px] text-gray-700">{timeStr}</span>
        </div>
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isAgent
              ? "bg-[#161d2e] border border-blue-900/40 text-gray-200 rounded-tl-sm"
              : "bg-[#1e1630] border border-purple-900/40 text-gray-200 rounded-tr-sm"
          }`}
        >
          {message.typing ? <TypingIndicator /> : message.text}

          {!message.typing && message.audioUrl && (
            <audio controls src={message.audioUrl} className="mt-2 w-full max-w-xs" />
          )}
        </div>
      </div>
    </div>
  );
}
