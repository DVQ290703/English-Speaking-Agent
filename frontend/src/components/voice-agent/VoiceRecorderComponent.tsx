// frontend/src/components/voice-agent/VoiceRecorderComponent.tsx
import { type KeyboardEvent, type RefObject } from 'react';
import { CheckCircle, Mic, SendHorizontal, Square } from 'lucide-react';
import { useT } from '../../i18n/useLanguage';
import useVoiceRecorder from '../../hooks/useVoiceRecorder';

interface VoiceRecorderComponentProps {
  // Text input (mirrors stripped ChatInputBar props)
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isConnected: boolean;
  agentTyping: boolean;
  chatInput: string;
  onChangeInput: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendText: () => void;
  // Voice recording
  selectedMicId: string;
  onTranscribe: (blob: Blob) => Promise<string>;
  onSendRecording: (text: string, blob: Blob) => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  'permission-denied': 'Microphone blocked — check browser permissions.',
  'mic-busy': 'Microphone in use by another app.',
  'not-supported': 'Recording not supported in this browser.',
  unknown: 'Recording failed — please try again.',
};

function formatTime(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function VoiceRecorderComponent({
  inputRef,
  isConnected,
  agentTyping,
  chatInput,
  selectedMicId,
  onChangeInput,
  onKeyDown,
  onSendText,
  onTranscribe,
  onSendRecording,
}: VoiceRecorderComponentProps) {
  const t = useT();

  const { status, recordingTime, audioUrl, visualizerData, error, transcript, start, stop, retake, transcribe, setTranscript, send, cancel } =
    useVoiceRecorder({ selectedMicId, onTranscribe, onSend: onSendRecording });

  const isRecording = status === 'recording';
  const isExpandedState = status === 'preview' || status === 'transcribing' || status === 'confirm' || status === 'done';
  const recordDisabled = agentTyping || isExpandedState;

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
    <div data-va="input" className="border-t border-gray-200 bg-[#f5f7fa]">

      {/* ── Error banner ── */}
      {error && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          <span className="flex-1">{ERROR_MESSAGES[error] ?? ERROR_MESSAGES.unknown}</span>
          <button
            type="button"
            onClick={cancel}
            className="text-red-500 hover:text-red-700 font-medium underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* ── Recording: visualizer + timer ── */}
      {isRecording && (
        <div className="mx-3 mt-3 rounded-lg bg-red-50 border border-red-100 px-3 py-3">
          <div className="text-center text-sm font-mono text-red-600 mb-2">
            {formatTime(recordingTime)}
          </div>
          <div className="flex items-end justify-center gap-0.5 h-12">
            {visualizerData.slice(0, 42).map((val, i) => (
              <div
                key={i}
                className="w-1 rounded-full bg-red-400 transition-none"
                style={{ height: `${Math.max(3, (val / 255) * 44)}px` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Preview ── */}
      {status === 'preview' && (
        <div className="mx-3 mt-3 rounded-lg border border-gray-200 bg-white px-3 py-3 space-y-2">
          <audio key={audioUrl} controls src={audioUrl ?? undefined} preload="auto" className="w-full" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{formatTime(recordingTime)}</span>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={retake}
              className="px-3 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={() => void transcribe()}
              className="px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-500"
            >
              Analyze →
            </button>
          </div>
        </div>
      )}

      {/* ── Transcribing ── */}
      {status === 'transcribing' && (
        <div className="mx-3 mt-3 rounded-lg border border-gray-200 bg-white px-3 py-4 flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin shrink-0" />
          <span className="text-xs text-gray-500">Transcribing…</span>
        </div>
      )}

      {/* ── Confirm ── */}
      {status === 'confirm' && (
        <div className="mx-3 mt-3 rounded-lg border border-gray-200 bg-white px-3 py-3 space-y-2">
          <p className="text-[10px] text-gray-400">Edit transcript if needed before sending</p>
          <textarea
            autoFocus
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={3}
            className="w-full resize-none rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-800 outline-none focus:ring-1 focus:ring-blue-200"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={cancel}
              className="px-3 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={send}
              disabled={!transcript.trim()}
              className={`px-3 py-1.5 rounded text-xs ${
                transcript.trim()
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {status === 'done' && (
        <div className="mx-3 mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="text-xs text-green-700">Sent!</span>
        </div>
      )}

      {/* ── Bottom input bar ── */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 w-full rounded-xl border px-2 py-1 bg-[#f1f5f9] transition-colors ${
              agentTyping
                ? 'opacity-60 cursor-not-allowed'
                : 'focus-within:ring-1 focus-within:ring-blue-200'
            }`}
          >
            {/* Record / Stop button */}
            <button
              type="button"
              onClick={isRecording ? stop : () => void start()}
              disabled={recordDisabled}
              title={isRecording ? 'Stop recording' : 'Record voice message'}
              className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
                isRecording
                  ? 'bg-red-100 text-red-600 animate-pulse ring-2 ring-red-300 scale-110'
                  : recordDisabled
                    ? 'bg-transparent text-gray-300 cursor-not-allowed'
                    : 'bg-transparent text-gray-500 hover:bg-red-50 hover:text-red-500'
              }`}
            >
              {isRecording ? (
                <Square className="w-4 h-4 fill-current" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>

            {/* Textarea — hidden while recording or in expanded state */}
            {!isRecording && !isExpandedState && (
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
                placeholder={agentTyping ? t('va.input.agentTyping') : t('va.input.placeholder')}
                rows={1}
                data-va="textarea"
                className="flex-1 resize-none bg-transparent border-0 px-2 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none leading-relaxed"
                style={{ minHeight: '38px', maxHeight: '120px' }}
              />
            )}

            {/* Send button — only for text input (not in recording/expanded states) */}
            {!isRecording && !isExpandedState && (
              <button
                data-testid="button-send-chat"
                onClick={onSendText}
                disabled={!chatInput.trim() || agentTyping}
                className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  chatInput.trim() && !agentTyping
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-200'
                    : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                }`}
              >
                <SendHorizontal className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
