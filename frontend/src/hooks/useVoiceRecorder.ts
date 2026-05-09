// frontend/src/hooks/useVoiceRecorder.ts
import { useCallback, useEffect, useRef, useState } from 'react';

type RecorderStatus = 'idle' | 'recording' | 'transcribing' | 'confirm' | 'done';
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
  waveformData: number[];
  error: RecorderError;
  transcript: string;
  start: () => Promise<void>;
  stop: () => void;
  retake: () => void;
  transcribe: () => Promise<void>;
  send: () => void;
  cancel: () => void;
}

const LIVE_BAR_COUNT = 42;
const WAVEFORM_BAR_COUNT = 150;
const SILENCE_THRESHOLD = 0.02;  // amplitude below this = silence (speech boundary detection)
const NOISE_GATE_FLOOR  = 0.005; // amplitude below this = zeroed out (residual hiss removal)
const TRIM_PADDING_MS   = 100;   // ms of audio kept before/after detected speech boundaries

function writeWavString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** Encode a Float32Array of mono PCM samples to a 16-bit WAV Blob. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length;
  const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeWavString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeWavString(view, 8, 'WAVE');
  writeWavString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);             // fmt chunk size
  view.setUint16(20, 1, true);              // PCM format
  view.setUint16(22, 1, true);              // mono
  view.setUint32(24, sampleRate, true);     // sample rate
  view.setUint32(28, sampleRate * 2, true); // byte rate (sampleRate * blockAlign)
  view.setUint16(32, 2, true);              // block align (1 channel * 2 bytes)
  view.setUint16(34, 16, true);             // bits per sample
  writeWavString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Trim silence from both ends of an AudioBuffer, apply a noise gate to remove
 * residual hiss, and encode to a WAV Blob.
 *
 * Falls back to the full buffer if no sample exceeds SILENCE_THRESHOLD
 * (e.g. very quiet speaker — avoids producing empty audio).
 */
function trimGateEncode(audioBuffer: AudioBuffer): Blob {
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const total = data.length;

  // Find first sample above speech threshold (scan from start)
  let startSample = 0;
  for (let i = 0; i < total; i++) {
    if (Math.abs(data[i]) >= SILENCE_THRESHOLD) {
      startSample = i;
      break;
    }
  }

  // Find last sample above speech threshold (scan from end)
  let endSample = total - 1;
  for (let i = total - 1; i >= 0; i--) {
    if (Math.abs(data[i]) >= SILENCE_THRESHOLD) {
      endSample = i;
      break;
    }
  }

  // Add padding so leading/trailing consonants aren't clipped
  const paddingSamples = Math.round((TRIM_PADDING_MS / 1000) * sampleRate);
  const trimStart = Math.max(0, startSample - paddingSamples);
  const trimEnd   = Math.min(total, endSample + paddingSamples + 1);

  // Extract trimmed slice and apply noise gate
  const out = new Float32Array(trimEnd - trimStart);
  for (let i = 0; i < out.length; i++) {
    const s = data[trimStart + i];
    out[i] = Math.abs(s) < NOISE_GATE_FLOOR ? 0 : s;
  }

  return encodeWav(out, sampleRate);
}

/** Decode a Blob into an AudioBuffer. Throws if AudioContext is unavailable. */
async function decodeAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const w = window as WindowWithWebkit;
  const Ctor = w.AudioContext || w.webkitAudioContext;
  if (!Ctor) throw new Error('AudioContext not supported');
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new Ctor();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close();
  }
}

/** Compute normalized amplitude bars from a decoded AudioBuffer. */
function computeWaveformBars(audioBuffer: AudioBuffer, barCount: number): number[] {
  const data = audioBuffer.getChannelData(0);
  const blockSize = Math.floor(data.length / barCount);
  if (blockSize === 0) return Array(barCount).fill(0.1) as number[];
  const result: number[] = [];
  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(data[i * blockSize + j] ?? 0);
    }
    result.push(sum / blockSize);
  }
  const max = Math.max(...result, 0.001);
  return result.map((v) => v / max);
}

export default function useVoiceRecorder({
  selectedMicId,
  onTranscribe,
  onSend,
}: UseVoiceRecorderParams): UseVoiceRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [visualizerData, setVisualizerData] = useState<number[]>(Array(LIVE_BAR_COUNT).fill(0));
  const [waveformData, setWaveformData] = useState<number[]>(Array(WAVEFORM_BAR_COUNT).fill(0));
  const [error, setError] = useState<RecorderError>(null);
  const [transcript, setTranscriptState] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioBlobRef = useRef<Blob | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const cancelGenRef = useRef(0);
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopFnRef = useRef<() => void>(() => {});
  // Ref so handleStop can call transcribe without capturing a stale closure
  const transcribeFnRef = useRef<() => Promise<void>>(() => Promise.resolve());

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
    setVisualizerData(Array(LIVE_BAR_COUNT).fill(0));
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
    cancelGenRef.current++;
    stopVisualizer();
    stopTimer();
    if (maxDurationTimerRef.current !== null) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
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
    setWaveformData(Array(WAVEFORM_BAR_COUNT).fill(0));
    setError(null);
    setStatus('idle');
  }, [stopVisualizer, stopTimer, releaseStream, revokeUrl]);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    setError(null);
    const w = window as WindowWithWebkit;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      !(w.AudioContext || w.webkitAudioContext) ||
      typeof MediaRecorder === 'undefined'
    ) {
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
      for (let i = 0; i < LIVE_BAR_COUNT; i++) {
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

    // 3-minute recording cap
    maxDurationTimerRef.current = setTimeout(() => {
      maxDurationTimerRef.current = null;
      stopFnRef.current();
    }, 180_000);

    setStatus('recording');
  }, [selectedMicId]);

  const stop = useCallback(() => {
    stopVisualizer();
    stopTimer();
    // Clear max-duration timer so it doesn't fire after recording ends
    if (maxDurationTimerRef.current !== null) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }

    const recorder = recorderRef.current;
    if (!recorder) return;

    const handleStop = () => {
      // Release stream after the recorder has flushed all buffered data so
      // we don't prematurely stop tracks (which can produce an incomplete
      // final chunk in some Chrome builds).
      releaseStream();
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
      // Skip separate preview step — go straight to transcribing
      setStatus('transcribing');

      const gen = cancelGenRef.current;

      // Decode audio buffer once — used for waveform display (and cleanBlob in Task 3)
      void decodeAudioBuffer(blob)
        .then((audioBuf) => {
          if (cancelGenRef.current !== gen) return;
          setWaveformData(computeWaveformBars(audioBuf, WAVEFORM_BAR_COUNT));
        })
        .catch(() => {});

      // Auto-start transcription immediately
      void transcribeFnRef.current();
    };

    if (recorder.state === 'inactive') {
      handleStop();
    } else {
      recorder.onstop = handleStop;
      recorder.stop();
    }
  }, [stopVisualizer, stopTimer, releaseStream]);

  useEffect(() => {
    stopFnRef.current = stop;
  }, [stop]);

  const transcribe = useCallback(async () => {
    const blob = audioBlobRef.current;
    if (!blob) return;
    const gen = cancelGenRef.current;
    setStatus('transcribing');
    try {
      const text = await onTranscribe(blob);
      if (gen !== cancelGenRef.current) return;
      setTranscriptState(text);
      setStatus('confirm');
    } catch {
      if (gen !== cancelGenRef.current) return;
      setError('unknown');
      // Stay in confirm so user can see the audio + cancel or type manually
      setStatus('confirm');
    }
  }, [onTranscribe]);

  // Keep transcribeFnRef pointing to the latest transcribe callback
  useEffect(() => {
    transcribeFnRef.current = transcribe;
  }, [transcribe]);

  const retake = useCallback(() => {
    cancelGenRef.current++; // abort any in-flight transcription
    revokeUrl();
    audioBlobRef.current = null;
    setAudioBlob(null);
    setRecordingTime(0);
    setTranscriptState('');
    setWaveformData(Array(WAVEFORM_BAR_COUNT).fill(0));
    setError(null);
    setStatus('idle');
  }, [revokeUrl]);

  const send = useCallback(() => {
    const blob = audioBlobRef.current;
    if (!blob || !transcript.trim()) return;
    onSend(transcript, blob);
    setStatus('done');
    sendTimerRef.current = setTimeout(() => {
      sendTimerRef.current = null;
      revokeUrl();
      audioBlobRef.current = null;
      setAudioBlob(null);
      setRecordingTime(0);
      setTranscriptState('');
      setWaveformData(Array(WAVEFORM_BAR_COUNT).fill(0));
      setStatus('idle');
    }, 800);
  }, [transcript, onSend, revokeUrl]);

  // Strict cleanup on unmount — prevents mic-in-use indicator staying on
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current !== null) clearInterval(timerRef.current);
      if (sendTimerRef.current !== null) clearTimeout(sendTimerRef.current);
      if (maxDurationTimerRef.current !== null) clearTimeout(maxDurationTimerRef.current);
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
    waveformData,
    error,
    transcript,
    start,
    stop,
    retake,
    transcribe,
    send,
    cancel,
  };
}
