# Voice Recorder Refactor Design

**Date:** 2026-05-09  
**Branch:** feat/mic_enhance  
**Status:** Approved

## Overview

Replace the existing continuous-listen microphone flow (Web Speech API + MediaRecorder) with a self-contained manual record → preview → transcribe → confirm → send flow. The new flow gives users full control: they record, hear themselves back, see the transcript, edit if needed, then submit.

---

## 1. Hook: `useVoiceRecorder`

**File:** `frontend/src/hooks/useVoiceRecorder.ts`

### State Machine

```
idle → recording → preview → transcribing → confirm → done → idle
         ↓ (error at any point)
       error (stays in last state, shows banner)
       retake() → idle (from preview/confirm)
       cancel() → idle (from any state)
```

### Exposed State

| Field | Type | Description |
|---|---|---|
| `status` | `'idle' \| 'recording' \| 'preview' \| 'transcribing' \| 'confirm' \| 'done'` | Current state |
| `recordingTime` | `number` | Seconds elapsed since recording started |
| `audioBlob` | `Blob \| null` | Captured audio |
| `audioUrl` | `string \| null` | Object URL for `<audio>` preview element |
| `visualizerData` | `number[]` | ~42 frequency bar heights (0–255), rAF-updated |
| `error` | `string \| null` | `'permission-denied' \| 'mic-busy' \| 'not-supported' \| 'unknown'` |
| `transcript` | `string` | Editable transcript in confirm step |

### Exposed Actions

| Action | Description |
|---|---|
| `start()` | Request mic permission, open MediaRecorder + AnalyserNode, start timer |
| `stop()` | Stop recording, create Blob + objectURL, transition → `preview` |
| `retake()` | Revoke objectURL, reset → `idle` |
| `transcribe()` | Send blob to `onTranscribe` callback, transition → `transcribing` → `confirm` |
| `setTranscript(text)` | Controlled update of editable transcript field |
| `send()` | Call `onSend(transcript, blob)`, transition → `done` |
| `cancel()` | Full teardown (stop tracks, revoke URL, close AudioContext), reset → `idle` |

### Audio Setup

- `getUserMedia`: `sampleRate: 48000, channelCount: 1` — record at native quality; `toWav()` handles 16kHz resampling at upload time
- `MediaRecorder`: `audio/webm;codecs=opus` with 100ms timeslice; fallback to default mimeType if unsupported
- `AnalyserNode`: `fftSize: 256` → 128 bins → sample every 3rd bin → 42 bars for `visualizerData`
- Visualizer loop: `requestAnimationFrame` calling `getByteFrequencyData()` while `status === 'recording'`
- Timer: `setInterval` at 1s while recording
- Cleanup on unmount: cancel rAF, `clearInterval`, stop all tracks, revoke objectURL, close AudioContext

### Hook Parameters

```ts
selectedMicId: string                          // from useMicDevices, passed down as prop
onTranscribe: (blob: Blob) => Promise<string>  // calls assessPronunciation → recognized_text
onSend: (text: string, blob: Blob) => void     // calls sendChatMessage(text, blob)
```

### Transcription Flow

`onTranscribe` in `VoiceAgent.tsx` calls `assessPronunciation({ token, audioBlob: blob })` (unscripted mode — no reference text). Returns `result.recognized_text` as the transcript string. The `toWav()` utility inside `assessPronunciation` resamples the webm/opus blob to 16kHz WAV before upload — so the hook records at 48kHz (better mic quality) and resampling is handled transparently at send time.

---

## 2. Component: `VoiceRecorderComponent`

**File:** `frontend/src/components/voice-agent/VoiceRecorderComponent.tsx`

Replaces `ChatInputBar` at the bottom of the right panel. All Tailwind, no new CSS files. Bar heights set via inline `style={{ height: \`${bar}px\` }}` to avoid purge removing dynamic values.

### UI Per State

**idle**
- Same footprint as current `ChatInputBar`
- Mic toggle replaced by a red circle "Record" button
- Textarea + text send button remain for typed messages

**recording** (expands ~120px upward)
- 42-bar real-time frequency visualizer, heights from `visualizerData`
- MM:SS timer centered above bars
- Pulsing red "Stop" button (`animate-pulse`)
- Textarea hidden

**preview**
- Native `<audio controls src={audioUrl} />` for playback
- Final duration shown
- "Retake" (ghost) + "Analyze →" (primary blue) buttons

**transcribing**
- Spinner + "Transcribing…" label
- All buttons disabled

**confirm**
- Auto-focused `<textarea>` pre-filled with transcript (fully editable)
- Helper text: "Edit if needed before sending"
- "Cancel" (ghost) + "Send" (primary) buttons

**done**
- Checkmark icon, auto-resets to `idle` after 800ms

**error** (overlays any state)
- Red banner above the bar: icon + human-readable message
- "Try again" link calls `cancel()` then re-enters `idle`

### Error Messages

| Error key | Display text |
|---|---|
| `permission-denied` | Microphone blocked — check browser permissions |
| `mic-busy` | Microphone in use by another app |
| `not-supported` | Recording not supported in this browser |
| `unknown` | Recording failed — please try again |

---

## 3. Integration

### Files Removed / Simplified

| Hook/File | Change |
|---|---|
| `useSpeechRecognition.ts` | Removed entirely from `VoiceAgent.tsx` |
| `useAudioCapture.ts` | Removed entirely from `VoiceAgent.tsx` (recorder owns its stream) |
| `useVoiceActivity.ts` | Removed entirely from `VoiceAgent.tsx` |
| `ChatInputBar.tsx` | Strip mic props: `isRecording`, `isSpeaking`, `micEnabled`, `onToggleMic` |
| `LeftAudioPanel.tsx` | Strip mic props: `isRecording`, `micEnabled`, `isSpeaking`; `MicWaveform` shows static idle state |

### `VoiceAgent.tsx` Changes

Remove:
- `useSpeechRecognition`, `useAudioCapture`, `useVoiceActivity` hook calls
- All related state: `isRecording`, `micEnabled`, `userMicIntentRef`, `isSpeaking`
- Space-key mic toggle shortcut
- Auto-enable-mic-on-connect effect

Add:
- `onTranscribe` callback: POST blob to existing chat API endpoint → `{ transcript: string }`
- `onSend` callback: calls existing `sendChatMessage(text, blob)`
- Replace `<ChatInputBar ... />` with `<VoiceRecorderComponent onTranscribe={...} onSend={...} isConnected={isConnected} />`

### New Exports

`frontend/src/components/voice-agent/index.ts` — add `VoiceRecorderComponent`

### New Files

```
frontend/src/hooks/useVoiceRecorder.ts
frontend/src/components/voice-agent/VoiceRecorderComponent.tsx
```

---

## 4. Mobile & Cross-Browser

- `webkitAudioContext` fallback for Safari (already used in `useVoiceActivity`)
- iOS Safari requires a user gesture before `AudioContext` resumes — `start()` is always triggered by a tap, satisfying this
- `MediaRecorder` with `audio/webm;codecs=opus` not supported on iOS Safari → fallback to default mimeType (AAC in mp4 container); backend must accept both
- Test targets: Chrome desktop, Firefox desktop, Safari desktop, Chrome Android, Safari iOS

---

## 5. What Is NOT Changed

- `useAgentAudio.ts` — agent TTS playback unchanged
- `useMicDevices.ts` — device enumeration unchanged; `VoiceRecorderComponent` receives `selectedMicId` as a prop
- `Waveforms.tsx` — AgentWaveform unchanged; MicWaveform stays but renders static idle state (no real data needed since voice activity detection is removed)
- Backend API — no changes; recorder uses existing audio upload endpoint
