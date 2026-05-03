import { Mic, MicOff, SendHorizontal } from 'lucide-react';
import { type KeyboardEvent, type RefObject } from 'react';
import { useT } from '../../i18n/LanguageContext';

interface ChatInputBarProps {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isConnected: boolean;
  isRecording: boolean;
  isSpeaking: boolean;
  micEnabled: boolean;
  agentTyping: boolean;
  chatInput: string;
  onToggleMic: () => void;
  onChangeInput: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
}

export default function ChatInputBar({
  inputRef,
  isConnected,
  isRecording,
  isSpeaking,
  micEnabled,
  agentTyping,
  chatInput,
  onToggleMic,
  onChangeInput,
  onKeyDown,
  onSend,
}: ChatInputBarProps) {
  const t = useT();

  if (!isConnected) {
    return (
      <div data-va="input" className="border-t border-gray-200 px-3 py-3 bg-[#f5f7fa]">
        <div className="flex items-center justify-center py-2 text-xs text-gray-400">
          {t('va.input.connectHint')}
        </div>
      </div>
    );
  }

  return (
    <div data-va="input" className="border-t border-gray-200 px-3 py-3 bg-[#f5f7fa]">
      <div className="flex items-center gap-2">
        <div
          data-va="input-inner"
          className={`flex items-center gap-2 w-full rounded-xl border px-2 py-1 bg-[#f1f5f9] transition-colors ${
            agentTyping
              ? 'opacity-60 cursor-not-allowed'
              : 'focus-within:ring-1 focus-within:ring-blue-200'
          }`}
        >
          <button
            data-testid="button-mic-toggle"
            type="button"
            onClick={onToggleMic}
            title={micEnabled ? t('va.input.listening') : t('va.left.microphone')}
            className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
              isRecording
                ? isSpeaking
                  ? 'bg-red-100 text-red-600 animate-pulse ring-2 ring-red-300 scale-110'
                  : 'bg-red-50 text-red-500 ring-1 ring-red-200'
                : micEnabled
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>

          <textarea
            ref={inputRef}
            data-testid="input-chat"
            value={chatInput}
            onChange={(e) => {
              onChangeInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={onKeyDown}
            disabled={agentTyping}
            placeholder={
              isRecording
                ? t('va.input.listening')
                : agentTyping
                  ? t('va.input.agentTyping')
                  : t('va.input.placeholder')
            }
            rows={1}
            data-va="textarea"
            className="flex-1 resize-none bg-transparent border-0 px-2 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none leading-relaxed"
            style={{ minHeight: '38px', maxHeight: '120px' }}
          />

          <button
            data-testid="button-send-chat"
            onClick={onSend}
            disabled={!chatInput.trim() || agentTyping}
            className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              chatInput.trim() && !agentTyping
                ? 'bg-blue-600 hover:bg-blue-500 text-gray-900 shadow-md shadow-blue-200'
                : 'bg-gray-100 text-gray-500 cursor-not-allowed'
            }`}
          >
            <SendHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
