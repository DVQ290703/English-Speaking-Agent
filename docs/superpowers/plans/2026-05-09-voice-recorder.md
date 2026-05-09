# Voice Recorder Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the continuous-listen mic flow (Web Speech API + MediaRecorder) with a self-contained manual record → preview → transcribe → confirm → send component anchored to the chat input bar.

**Architecture:** A `useVoiceRecorder` hook owns the full state machine (`idle → recording → preview → transcribing → confirm → done`) and all media resources (MediaRecorder, AnalyserNode, rAF loop, timer). `VoiceRecorderComponent` replaces `ChatInputBar` in `VoiceAgent.tsx`, rendering different UI per state and accepting two callbacks: `onTranscribe(blob) → Promise<string>` (calls `assessPronunciation`) and `onSendRecording(text, blob)` (calls `sendChatMessage`). Three old hooks (`useSpeechRecognition`, `useAudioCapture`, `useVoiceActivity`) are removed from `VoiceAgent.tsx`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v4, Web Audio API (`AnalyserNode`), MediaRecorder API, `lucide-react` icons.

**Spec:** `docs/superpowers/specs/2026-05-09-voice-recorder-design.md`

---

## File Map

| Action | File |
|---|---|
| Create | `frontend/src/hooks/useVoiceRecorder.ts` |
| Create | `frontend/src/components/voice-agent/VoiceRecorderComponent.tsx` |
| Modify | `frontend/src/pages/VoiceAgent.tsx` |
| Modify | `frontend/src/components/voice-agent/LeftAudioPanel.tsx` |
| Modify | `frontend/src/components/voice-agent/index.ts` |

---

## Task 1: `useVoiceRecorder` hook

**Files:**
- Create: `frontend/src/hooks/useVoiceRecorder.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// frontend/src/hooks/useVoiceRecorder.ts
import { useCallback, useEffect, useRef, useState } from 'react';

type RecorderStatus = 'idle' | 'recording' | 'preview' | 'transcribing' | 'confirm' | 'done';
type RecorderError = 'permission-denied' | 'mic-busy' | 'not-supported' | 'unknown' | null;

type WindowWithWebkit = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

export interface UseVoiceRecorderParams {
  selectedMicId: string;
  onTranscribe: (blob: Blob) => Promise<string>;
  onSend: (text: string, blob: Blob) => void;
}

export interface UseVoiceRecorderResult {
  status: RecorderStatus;
  recordingTime: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  visualizerData: number[];
  error: RecorderError;
  transcript: string;
  start: () => Promise<void>;
  stop: () => void;
  retake: () => void;
  transcribe: () => Promise<void>;
  setTranscript: (text: string) => void;
  send: () => void;
  cancel: () => void;
}

const BAR_COUNT = 42;

export default function useVoiceRecorder({
  selectedMicId,
  onTranscribe,
  onSend,
}: UseVoiceRecorderParams): UseVoiceRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [visualizerData, setVisualizerData] = useState<number[]>(Array(BAR_COUNT).fill(0));
  const [error, setError] = useState<RecorderError>(null);
  const [transcript, setTranscriptState] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Stable refs so callbacks don't go stale between renders
  const audioBlobRef = useRef<Blob | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const stopVisualizer = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      analyserRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close();
      }
    } catch {
      /* ignore */
    }
    analyserRef.current = null;
    audioCtxRef.current = null;
    setVisualizerData(Array(BAR_COUNT).fill(0));
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const revokeUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
      setAudioUrl(null);
    }
  }, []);

  const cancel = useCallback(() => {
    stopVisualizer();
    stopTimer();
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    chunksRef.current = [];
    releaseStream();
    revokeUrl();
    audioBlobRef.current = null;
    setAudioBlob(null);
    setRecordingTime(0);
    setTranscriptState('');
    setError(null);
    setStatus('idle');
  }, [stopVisualizer, stopTimer, releaseStream, revokeUrl]);

  const start = useCallback(async () => {
    const w = window as WindowWithWebkit;
    if (!navigator.mediaDevices?.getUserMedia || !(w.AudioContext || w.webkitAudioContext)) {
      setError('not-supported');
      return;
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      });
    } catch (err) {
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'NotAllowedError' || name === 'SecurityError') setError('permission-denied');
      else if (name === 'NotReadableError') setError('mic-busy');
      else setError('unknown');
      return;
    }

    // Visualizer
    const Ctor =
      (window as WindowWithWebkit).AudioContext ||
      (window as WindowWithWebkit).webkitAudioContext!;
    const ctx = new Ctor();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(streamRef.current);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256; // 128 frequency bins
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);
    analyserRef.current = analyser;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

    const freqData = new Uint8Array(analyser.frequencyBinCount); // 128 bins
    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(freqData);
      const bars: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        bars.push(freqData[i * 3] ?? 0); // sample every 3rd bin → 42 bars
      }
      setVisualizerData(bars);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // MediaRecorder
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : '';
    const recorder = mimeType
      ? new MediaRecorder(streamRef.current, { mimeType })
      : new MediaRecorder(streamRef.current);
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(100);

    // Timer
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);

    setError(null);
    setStatus('recording');
  }, [selectedMicId]);

  const stop = useCallback(() => {
    stopVisualizer();
    stopTimer();
    releaseStream();

    const recorder = recorderRef.current;
    if (!recorder) return;

    const handleStop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || 'audio/webm',
      });
      chunksRef.current = [];
      recorderRef.current = null;
      const url = URL.createObjectURL(blob);
      audioBlobRef.current = blob;
      audioUrlRef.current = url;
      setAudioBlob(blob);
      setAudioUrl(url);
      setStatus('preview');
    };

    if (recorder.state === 'inactive') {
      handleStop();
    } else {
      recorder.onstop = handleStop;
      recorder.stop();
    }
  }, [stopVisualizer, stopTimer, releaseStream]);

  const retake = useCallback(() => {
    revokeUrl();
    audioBlobRef.current = null;
    setAudioBlob(null);
    setRecordingTime(0);
    setTranscriptState('');
    setError(null);
    setStatus('idle');
  }, [revokeUrl]);

  const transcribe = useCallback(async () => {
    const blob = audioBlobRef.current;
    if (!blob) return;
    setStatus('transcribing');
    try {
      const text = await onTranscribe(blob);
      setTranscriptState(text);
      setStatus('confirm');
    } catch {
      setError('unknown');
      setStatus('preview');
    }
  }, [onTranscribe]);

  const setTranscript = useCallback((text: string) => {
    setTranscriptState(text);
  }, []);

  const send = useCallback(() => {
    const blob = audioBlobRef.current;
    if (!blob || !transcript.trim()) return;
    onSend(transcript, blob);
    setStatus('done');
    setTimeout(() => {
      revokeUrl();
      audioBlobRef.current = null;
      setAudioBlob(null);
      setRecordingTime(0);
      setTranscriptState('');
      setStatus('idle');
    }, 800);
  }, [transcript, onSend, revokeUrl]);

  // Strict cleanup on unmount — prevents mic-in-use indicator staying on
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current !== null) clearInterval(timerRef.current);
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      try {
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          void audioCtxRef.current.close();
        }
      } catch {
        /* ignore */
      }
    };
  }, []);

  return {
    status,
    recordingTime,
    audioBlob,
    audioUrl,
    visualizerData,
    error,
    transcript,
    start,
    stop,
    retake,
    transcribe,
    setTranscript,
    send,
    cancel,
  };
}
```

- [ ] **Step 2: Type-check the hook**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors relating to `useVoiceRecorder.ts`. Any errors from other files can be ignored for now.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useVoiceRecorder.ts
git commit -m "feat(mic): add useVoiceRecorder hook with state machine and AnalyserNode visualizer"
```

---

## Task 2: `VoiceRecorderComponent`

**Files:**
- Create: `frontend/src/components/voice-agent/VoiceRecorderComponent.tsx`

This component replaces `ChatInputBar`. It keeps the text-input row for typed messages and adds the voice recording flow above it.

**Layout per state:**
- `idle`: `[● record]` `[textarea]` `[→ send]`
- `recording`: visualizer + timer above; `[■ stop]` below (textarea hidden)
- `preview`: audio player + Retake + Analyze → buttons (full width panel)
- `transcribing`: spinner + label (full width panel)
- `confirm`: editable transcript textarea + Cancel + Send (full width panel)
- `done`: checkmark — auto-resets to idle after 800ms

- [ ] **Step 1: Create the component file**

```typescript
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
            {visualizerData.map((val, i) => (
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
          <div className="flex items-center gap-2">
            <audio controls src={audioUrl ?? undefined} className="flex-1 h-8" />
            <span className="text-xs text-gray-500 shrink-0">{formatTime(recordingTime)}</span>
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

            {/* Textarea — hidden while recording */}
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
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors from the two new files.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/voice-agent/VoiceRecorderComponent.tsx
git commit -m "feat(mic): add VoiceRecorderComponent with state-driven UI"
```

---

## Task 3: Wire into `VoiceAgent.tsx`

**Files:**
- Modify: `frontend/src/pages/VoiceAgent.tsx`

This is the largest change. We remove three hooks and all their dependent state, and replace `ChatInputBar` with `VoiceRecorderComponent`.

- [ ] **Step 1: Update imports at the top of `VoiceAgent.tsx`**

Replace the existing import block. Key changes:
- Remove `useAudioCapture`, `useSpeechRecognition`, `useVoiceActivity` imports
- Remove `ChatInputBar` from component imports
- Add `VoiceRecorderComponent` to component imports
- Add `assessPronunciation` to `../api/chat` import

Find this section (lines 1–51) and apply these changes:

```typescript
// REMOVE these three lines:
import useAudioCapture from '../hooks/useAudioCapture';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import useVoiceActivity from '../hooks/useVoiceActivity';

// REMOVE ChatInputBar from the voice-agent barrel import and ADD VoiceRecorderComponent:
// Before:
import {
  AiFeedbackPanel,
  ChatInputBar,      // ← remove
  ConversationSidebar,
  ...
} from '../components/voice-agent';

// After:
import {
  AiFeedbackPanel,
  VoiceRecorderComponent,   // ← add
  ConversationSidebar,
  ...
} from '../components/voice-agent';

// ADD assessPronunciation to the chat API import:
// Before:
import { fetchGrammarFeedback } from '../api/chat';
// After:
import { assessPronunciation, fetchGrammarFeedback } from '../api/chat';
```

- [ ] **Step 2: Remove mic-related state and refs**

Find and delete these lines (around lines 176–182 and 286):

```typescript
// DELETE all of these:
const [micEnabled, setMicEnabled] = useState(false);
const userMicIntentRef = useRef(false);
const [isRecording, setIsRecording] = useState(false);
```

- [ ] **Step 3: Remove the three old hooks**

Delete these blocks (around lines 349–373):

```typescript
// DELETE useAudioCapture call and its destructuring:
const { mediaStreamRef, startUserAudioCapture, stopUserAudioCapture, releaseMediaStream } =
  useAudioCapture(selectedMicIdRef);

// DELETE useVoiceActivity call:
const isSpeaking = useVoiceActivity(mediaStreamRef, isRecording);
```

Also delete the `useSpeechRecognition` call block (around lines 474–489):

```typescript
// DELETE the entire useSpeechRecognition({...}) call
useSpeechRecognition({
  status,
  micEnabled,
  language,
  selectedMicId,
  selectedMicIdRef,
  mediaStreamRef,
  refreshMicDevicesRef,
  setIsRecording,
  setMicEnabled,
  setChatInput,
  startUserAudioCapture,
  stopUserAudioCapture,
  sendChatMessage,
  t,
});
```

- [ ] **Step 4: Remove `toggleMic` callback**

Delete (around lines 377–383):

```typescript
// DELETE:
const toggleMic = useCallback(() => {
  setMicEnabled((prev) => {
    const next = !prev;
    userMicIntentRef.current = next;
    return next;
  });
}, []);
```

- [ ] **Step 5: Remove Space-key mic toggle from the keyboard shortcut effect**

The keyboard shortcut effect (around lines 386–430) handles both Escape and Space. Remove the Space/mic block and keep only the Escape block:

```typescript
// BEFORE (keep the whole effect but remove the Space section):
useEffect(() => {
  const onKeyDown = (e: globalThis.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // ... keep this entire Escape block unchanged ...
      return;
    }
    // DELETE from here:
    if (e.code === 'Space' || e.key === ' ') {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === 'input' || tag === 'textarea' || tag === 'select' ||
        tag === 'button' || tag === 'a' || target?.isContentEditable ||
        target?.closest('button, a, [role="button"], ...')
      ) {
        return;
      }
      e.preventDefault();
      toggleMic();
    }
    // DELETE to here
  };
  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}, [showLogoutConfirm, showUserMenu, toggleMic]);  // also remove toggleMic from deps
```

After edit, the deps array becomes `[showLogoutConfirm, showUserMenu]`.

- [ ] **Step 6: Remove the auto-enable-mic-on-connect effect**

Delete this entire effect (around lines 723–734):

```typescript
// DELETE:
useEffect(() => {
  if (status !== 'connected') return;
  userMicIntentRef.current = true;
  try {
    setMicEnabled(true);
  } catch {
    /* ignore */
  }
}, [status, setMicEnabled]);
```

- [ ] **Step 7: Remove `releaseMediaStream` from the unmount cleanup effect**

Find the final unmount cleanup effect (around lines 712–718):

```typescript
// BEFORE:
useEffect(() => {
  return () => {
    clearTimers();
    clearLocalAudioUrls();
    releaseMediaStream();   // ← DELETE this line
  };
}, [clearTimers, clearLocalAudioUrls, releaseMediaStream]);  // ← remove releaseMediaStream from deps

// AFTER:
useEffect(() => {
  return () => {
    clearTimers();
    clearLocalAudioUrls();
  };
}, [clearTimers, clearLocalAudioUrls]);
```

- [ ] **Step 8: Add `onTranscribe` and `onSendRecording` callbacks**

Add these two callbacks after `handleSendChat` (around line 913):

```typescript
const onTranscribe = useCallback(async (blob: Blob): Promise<string> => {
  const session = getAuthSession();
  if (!session?.token) throw new Error('Not authenticated');
  const result = await assessPronunciation({ token: session.token, audioBlob: blob });
  return result.recognized_text;
}, []);

const onSendRecording = useCallback(
  (text: string, blob: Blob) => {
    sendChatMessage(text, blob);
  },
  [sendChatMessage],
);
```

- [ ] **Step 9: Replace `<ChatInputBar>` with `<VoiceRecorderComponent>` in JSX**

Find (around line 1204):

```tsx
// BEFORE:
<ChatInputBar
  inputRef={inputRef}
  isConnected={isConnected}
  isRecording={isRecording}
  isSpeaking={isSpeaking}
  micEnabled={micEnabled}
  agentTyping={agentTyping}
  chatInput={chatInput}
  onToggleMic={toggleMic}
  onChangeInput={setChatInput}
  onKeyDown={handleKeyDown}
  onSend={handleSendChat}
/>

// AFTER:
<VoiceRecorderComponent
  inputRef={inputRef}
  isConnected={isConnected}
  agentTyping={agentTyping}
  chatInput={chatInput}
  selectedMicId={selectedMicId}
  onChangeInput={setChatInput}
  onKeyDown={handleKeyDown}
  onSendText={handleSendChat}
  onTranscribe={onTranscribe}
  onSendRecording={onSendRecording}
/>
```

- [ ] **Step 10: Update `<LeftAudioPanel>` props in JSX**

Find (around line 1052):

```tsx
// BEFORE:
<LeftAudioPanel
  gender={gender}
  onChangeGender={setGender}
  agentSpeaking={agentSpeaking}
  isConnected={isConnected}
  isConnecting={isConnecting}
  micDevices={micDevices}
  selectedMicId={selectedMicId}
  onSelectMic={setSelectedMicId}
  isRecording={isRecording}
  micEnabled={micEnabled}
  isSpeaking={isSpeaking}
  currentUser={currentUser}
/>

// AFTER:
<LeftAudioPanel
  gender={gender}
  onChangeGender={setGender}
  agentSpeaking={agentSpeaking}
  isConnected={isConnected}
  isConnecting={isConnecting}
  micDevices={micDevices}
  selectedMicId={selectedMicId}
  onSelectMic={setSelectedMicId}
  currentUser={currentUser}
/>
```

- [ ] **Step 11: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -50
```

Expected: 0 errors. Common errors and fixes:
- `micEnabled` still referenced → find and remove remaining usages
- `isRecording` still referenced → find and remove remaining usages  
- `toggleMic` still referenced → find and remove remaining usages
- `releaseMediaStream` still referenced → find and remove remaining usages

- [ ] **Step 12: Commit**

```bash
git add frontend/src/pages/VoiceAgent.tsx
git commit -m "feat(mic): replace continuous-listen flow with VoiceRecorderComponent in VoiceAgent"
```

---

## Task 4: Update `LeftAudioPanel.tsx`

**Files:**
- Modify: `frontend/src/components/voice-agent/LeftAudioPanel.tsx`

Remove three props that no longer exist: `isRecording`, `micEnabled`, `isSpeaking`. The `MicWaveform` will always render in its idle/inactive visual state.

- [ ] **Step 1: Update the props interface**

```typescript
// BEFORE:
interface LeftAudioPanelProps {
  gender: Gender;
  onChangeGender: (next: Gender) => void;
  agentSpeaking: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  micDevices: MicDevice[];
  selectedMicId: string;
  onSelectMic: (deviceId: string) => void;
  isRecording: boolean;    // ← DELETE
  micEnabled: boolean;     // ← DELETE
  isSpeaking: boolean;     // ← DELETE
  currentUser: AuthUser | null;
}

// AFTER:
interface LeftAudioPanelProps {
  gender: Gender;
  onChangeGender: (next: Gender) => void;
  agentSpeaking: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  micDevices: MicDevice[];
  selectedMicId: string;
  onSelectMic: (deviceId: string) => void;
  currentUser: AuthUser | null;
}
```

- [ ] **Step 2: Update the function signature destructuring**

```typescript
// BEFORE:
export default function LeftAudioPanel({
  gender,
  onChangeGender,
  agentSpeaking,
  isConnected,
  isConnecting,
  micDevices,
  selectedMicId,
  onSelectMic,
  isRecording,   // ← DELETE
  micEnabled,    // ← DELETE
  isSpeaking,    // ← DELETE
  currentUser,
}: LeftAudioPanelProps) {

// AFTER:
export default function LeftAudioPanel({
  gender,
  onChangeGender,
  agentSpeaking,
  isConnected,
  isConnecting,
  micDevices,
  selectedMicId,
  onSelectMic,
  currentUser,
}: LeftAudioPanelProps) {
```

- [ ] **Step 3: Update the user avatar container div class**

The avatar circle currently animates based on `isRecording`. Make it always show the idle style:

```tsx
// BEFORE (around line 102):
<div
  className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-all duration-500 ${
    isRecording
      ? 'bg-violet-600/30 border-2 border-violet-500/60 shadow-lg shadow-violet-200'
      : 'bg-violet-100 border border-violet-200'
  }`}
>

// AFTER:
<div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center bg-violet-100 border border-violet-200">
```

- [ ] **Step 4: Update `MicWaveform` call**

```tsx
// BEFORE (around line 122):
{isConnected || isConnecting ? (
  <MicWaveform active={micEnabled && isConnected} speaking={isSpeaking} />
) : (
  <InactiveDots dotClass="bg-violet-500/30" />
)}

// AFTER:
<InactiveDots dotClass="bg-violet-500/30" />
```

The waveform was driven by fake CSS animations anyway; showing the static dots is visually equivalent when idle.

- [ ] **Step 5: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/voice-agent/LeftAudioPanel.tsx
git commit -m "feat(mic): strip mic-dependent props from LeftAudioPanel"
```

---

## Task 5: Export + Final Verification

**Files:**
- Modify: `frontend/src/components/voice-agent/index.ts`

- [ ] **Step 1: Add `VoiceRecorderComponent` export, remove `ChatInputBar`**

```typescript
// BEFORE:
export { default as ChatInputBar } from './ChatInputBar';

// AFTER:
export { default as VoiceRecorderComponent } from './VoiceRecorderComponent';
```

(`ChatInputBar` is no longer imported anywhere — removing the export is safe. The file itself stays.)

- [ ] **Step 2: Final type-check — zero errors expected**

```bash
cd frontend && npx tsc --noEmit 2>&1
```

Expected output: empty (no errors).

If you see errors:
- `Property 'X' does not exist` → a prop was missed in Task 3 or 4; remove the usage
- `Cannot find module` → check the import path is correct
- `Type 'X' is not assignable` → check callback signatures match between hook and component

- [ ] **Step 3: Run the dev server and smoke test in browser**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173` and verify all of the following:

**Smoke test checklist:**
1. Page loads without console errors
2. Connect button works → session connects
3. The bottom input bar shows a mic icon (red) + textarea + send button
4. Clicking the mic button → visualizer expands above the bar, timer starts counting, mic icon becomes a pulsing stop button
5. Clicking stop → collapsed to preview panel showing `<audio>` player, Retake + Analyze buttons
6. Clicking Retake → returns to idle state with clean input bar
7. Clicking Analyze → spinner "Transcribing…" appears, then transcript textarea pre-filled
8. Editing the transcript works
9. Clicking Send → "Sent!" flash → returns to idle → message appears in chat transcript
10. Clicking Cancel in confirm state → returns to idle
11. Typing text and pressing Enter → sends text message (existing flow unaffected)
12. Disconnecting → "connect first" placeholder shows instead of input bar
13. On page unload / component unmount (navigate away) → browser mic-in-use indicator disappears (no red dot in browser tab)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/voice-agent/index.ts
git commit -m "feat(mic): export VoiceRecorderComponent, remove ChatInputBar export"
```

---

## Self-Review Against Spec

**Spec requirement → Task coverage:**

| Spec requirement | Covered in |
|---|---|
| `useVoiceRecorder` hook with all state fields | Task 1 |
| `MediaRecorder` with webm/opus, 100ms timeslice | Task 1 step 1 (`recorder.start(100)`) |
| 48kHz recording, `toWav()` handles 16kHz at upload | Task 1 (`sampleRate: 48000`); `assessPronunciation` calls `toWav()` internally |
| AnalyserNode fftSize=256, ~42 bars | Task 1 step 1 (`analyser.fftSize = 256`, `BAR_COUNT = 42`) |
| rAF loop for visualizer, cancelled on stop/unmount | Task 1 step 1 (`stopVisualizer`, unmount cleanup) |
| Strict cleanup: tracks stopped, objectURL revoked, AudioContext closed | Task 1 step 1 (unmount `useEffect`) |
| State machine: idle→recording→preview→transcribing→confirm→done | Task 1 (`status` transitions) |
| Record button → Stop button with pulse animation | Task 2 (`animate-pulse` on recording state) |
| Real-time bar visualizer driven by hook data | Task 2 (inline `style={{ height }}` bars) |
| MM:SS timer | Task 2 (`formatTime`) |
| Analyze/Send button appears after recording | Task 2 (preview state panel) |
| Permission error state with clear message | Task 2 (error banner with `ERROR_MESSAGES`) |
| Audio preview player | Task 2 (`<audio controls src={audioUrl} />`) |
| Editable transcript in confirm step | Task 2 (confirm panel textarea) |
| `onTranscribe` calls `assessPronunciation` | Task 3 step 8 |
| `onSendRecording` calls `sendChatMessage` | Task 3 step 8 |
| Remove `useSpeechRecognition`, `useAudioCapture`, `useVoiceActivity` | Task 3 steps 3–7 |
| Replace `ChatInputBar` with `VoiceRecorderComponent` | Task 3 step 9 |
| Strip mic props from `LeftAudioPanel` | Task 4 |
| Export from index.ts | Task 5 step 1 |
| Mobile Safari: `webkitAudioContext` fallback | Task 1 (`WindowWithWebkit` type, `w.AudioContext || w.webkitAudioContext`) |
| `selectedMicId` passed to hook | Task 2 (prop → `useVoiceRecorder`) |
