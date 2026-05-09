# Audio Post-Processing — Design Spec
**Date:** 2026-05-09
**Branch:** feat/mic_enhance
**Files in scope:** `frontend/src/hooks/useVoiceRecorder.ts`

---

## Overview

After recording stops, produce a cleaned copy of the audio (silence-trimmed + noise-gated, re-encoded as WAV) alongside the raw WebM blob. The raw blob is used unchanged for review-panel playback. The clean blob is what `send()` passes to `onSendRecording` — so the backend receives cleaner audio for transcription and storage.

---

## Goals

- Cut dead air from both ends of the recording (trim to exact speech boundaries)
- Remove residual hiss/noise floor between words (noise gate)
- No new frontend dependencies
- No backend changes
- Raw recording kept for local review/playback

---

## Processing Pipeline

A new pure function `processAudio(buffer: AudioBuffer): Blob` runs in `useVoiceRecorder` after recording stops, in parallel with `decodeWaveform` and the transcription call.

### Step 1 — Silence trim

Scan the mono channel data (Float32Array) from the start until `Math.abs(sample) >= SILENCE_THRESHOLD`. Record this as `startSample`. Scan from the end until the same condition. Record as `endSample`. Apply padding of `TRIM_PADDING_MS` ms on both sides:

```ts
const paddingSamples = Math.round((TRIM_PADDING_MS / 1000) * sampleRate);
const trimStart = Math.max(0, startSample - paddingSamples);
const trimEnd   = Math.min(data.length, endSample + paddingSamples);
```

**Edge case:** if no sample exceeds `SILENCE_THRESHOLD` (total silence or extremely quiet speaker), use the full buffer — `trimStart = 0`, `trimEnd = data.length`.

### Step 2 — Noise gate

Iterate over `data[trimStart..trimEnd]`. Any sample with `Math.abs(sample) < NOISE_GATE_FLOOR` is set to `0`. This zeros out low-level hiss in pauses without touching speech.

### Step 3 — WAV encode

Convert trimmed Float32 samples to Int16 PCM:
```ts
const s = Math.max(-1, Math.min(1, sample));
int16[i] = s < 0 ? s * 32768 : s * 32767;
```

Prepend a standard 44-byte RIFF/WAV header (48000 Hz, mono, 16-bit PCM). Return as `new Blob([header, pcm], { type: 'audio/wav' })`.

Size: ~96 KB/sec at 48kHz mono 16-bit. A 30s recording = ~3 MB (well under the 25 MB backend limit).

---

## Tuning Constants

All three constants live at the top of `useVoiceRecorder.ts`, grouped with `LIVE_BAR_COUNT` and `WAVEFORM_BAR_COUNT`:

```ts
const SILENCE_THRESHOLD = 0.02;  // amplitude below this = silence
const NOISE_GATE_FLOOR  = 0.005; // amplitude below this = zeroed (hiss removal)
const TRIM_PADDING_MS   = 100;   // ms kept before/after detected speech
```

---

## Hook Changes

### New state/ref

```ts
const [cleanBlob, setCleanBlob] = useState<Blob | null>(null);
const cleanBlobRef = useRef<Blob | null>(null);
```

### `stop()` handler additions

After the existing `decodeWaveform` call:
```ts
void processAudio(blob)
  .then((clean) => {
    if (cancelGenRef.current === gen) {
      cleanBlobRef.current = clean;
      setCleanBlob(clean);
    }
  })
  .catch(() => {}); // silent fallback — send() will use raw blob
```

`processAudio` is async only because `AudioContext.decodeAudioData` is a Promise. The CPU-bound trim/gate/encode steps are synchronous once the buffer is available. Since `decodeWaveform` already calls `decodeAudioData`, the two can share the same decoded buffer — pass the decoded `AudioBuffer` directly to a synchronous `trimGateEncode(buffer): Blob` helper to avoid decoding twice.

**Revised parallel structure in `handleStop`:**

```ts
void decodeWaveform(blob, WAVEFORM_BAR_COUNT)
  .then((bars) => {
    if (cancelGenRef.current === gen) {
      setWaveformData(bars);
    }
  })
  .catch(() => {});

void decodeAudioBuffer(blob)          // shared decode
  .then((audioBuf) => {
    if (cancelGenRef.current !== gen) return;
    const clean = trimGateEncode(audioBuf);  // synchronous
    cleanBlobRef.current = clean;
    setCleanBlob(clean);
  })
  .catch(() => {});
```

`decodeWaveform` is refactored to call a shared `decodeAudioBuffer` helper to avoid two separate `AudioContext` instances.

### `send()`

```ts
const blobToSend = cleanBlobRef.current ?? audioBlobRef.current;
if (!blobToSend || !transcript.trim()) return;
onSend(transcript, blobToSend);
```

### `cancel()` / `retake()` / post-send reset

Add `cleanBlobRef.current = null; setCleanBlob(null);` alongside existing `audioBlobRef` resets.

### Updated return interface

Add `cleanBlob: Blob | null` to `UseVoiceRecorderResult` (exposed for future use, e.g., showing a "processed" badge).

---

## VoiceRecorderComponent

**No changes needed.** The component calls `send()` and the hook handles which blob goes to `onSendRecording` internally.

---

## Out of Scope

- No RNNoise / WASM denoising (browser's built-in `noiseSuppression: true` already handles mic noise at capture time)
- No backend changes
- No changes to MinIO storage path or format
- No visual indicator of processing state (the existing "Transcribing…" spinner covers the window while both transcription and audio processing run)
