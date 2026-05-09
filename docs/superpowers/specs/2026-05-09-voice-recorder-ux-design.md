# Voice Recorder UX — Design Spec
**Date:** 2026-05-09  
**Branch:** feat/mic_enhance  
**Files in scope:** `frontend/src/components/voice-agent/VoiceRecorderComponent.tsx`, `frontend/src/hooks/useVoiceRecorder.ts`

---

## Overview

Three targeted UX improvements to the voice recorder review panel and mic button:

1. **Read-only transcript** — remove editability; user can only retake or send
2. **Waveform playback fill** — waveform reflects playback progress in real time; clickable to seek
3. **Prominent mic button** — mic icon is visually active and draws user attention

---

## 1. Read-only Transcript

### Current
A `<textarea>` lets the user edit the auto-transcribed text before sending.

### Change
Replace the `<textarea>` with a styled read-only `<div>`. The text remains selectable/copyable but not editable.

- Remove `onChange` handler and `setTranscript` wiring for the textarea
- Hint text changes from `"Edit if needed, then send"` → `"Transcript (read-only — retake to re-record)"`
- The `retake` flow remains unchanged
- `send` still sends `transcript` as-is (no edit path needed)

---

## 2. Waveform Playback Fill

### Current
`<Waveform>` renders 80 static blue bars decoded from the blob. No playback state.

### Change
Replace the static `<Waveform>` component with a new `<PlaybackWaveform>` component that:

**Bars:**
- ~150 bars rendered at `flex: 1` across full container width, each `1px` wide, no gap
- Bars are generated from `waveformData` (hook already decodes up to 80 points — increase to 150 in `useVoiceRecorder.ts`)
- Bar colors split at playhead: played bars = `#3b82f6` (blue-500), unplayed = `#cbd5e1` (slate-300)
- Playhead = a single `2px` indigo bar at the current position

**Playback sync:**
- Component receives the `<audio>` element ref (or `audioUrl`)
- Listens to `timeupdate` events on the audio element
- Computes `playedFrac = currentTime / duration`
- Derives `playedCount = Math.floor(playedFrac * bars.length)`
- Updates bar colors on each `timeupdate` (no React state — direct DOM or `useRef`-driven for performance)

**Seek on click:**
- `onClick` on the container: `audio.currentTime = (clickX / containerWidth) * duration`

**Implementation approach (no new state, perf-friendly):**
- Store bar `<div>` refs in a `useRef<HTMLDivElement[]>` array
- On `timeupdate`, iterate the array and set `el.style.background` directly — no `setState`, no re-render
- On component unmount, remove the `timeupdate` listener from the audio element

**Hook change:**
- In `useVoiceRecorder.ts`, increase waveform resolution from 80 → 150 bars in the decode step

---

## 3. Prominent Mic Button

### Current
Mic button: `bg-transparent text-gray-500` — visually muted, blends into the input bar.

### Change
Idle mic button style:
- Background: `bg-indigo-50` (light indigo fill)
- Icon color: `text-indigo-600`
- Ring: `ring-2 ring-indigo-200`
- Subtle outer pulse: CSS `animate-pulse` on a surrounding `ring` that fades in/out (low opacity so it doesn't distract during typing)

Recording state remains unchanged (red pulse, `bg-red-100`).

Tailwind classes for idle:
```
bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200 hover:bg-indigo-100
```

Outer pulse wrapper (rendered only in idle state):
```html
<span class="absolute inset-0 rounded-full ring-2 ring-indigo-300 animate-ping opacity-30" />
```
The `animate-ping` runs once every ~1s, very low opacity so it doesn't fight the text input.

---

## Audio Element Wiring

Currently, the `<audio>` element is rendered inline in the review panel with no ref. To wire playback into the waveform:

- Add `audioRef = useRef<HTMLAudioElement>(null)` in `VoiceRecorderComponent`
- Pass `ref={audioRef}` to the `<audio>` element
- Pass `audioRef` into `<PlaybackWaveform>`

---

## Out of Scope
- No change to recording flow, transcription logic, or send behavior
- No scrollable waveform
- No word-level alignment (future work — this spec prepares the data resolution for it)
