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
  setTranscript: (text: string) => void;
  send: () => void;
  cancel: () => void;
}

const LIVE_BAR_COUNT = 42;
const WAVEFORM_BAR_COUNT = 150;

/** Decode a recorded audio blob into normalized amplitude bars for waveform display. */
async function decodeWaveform(blob: Blob, barCount: number): Promise<number[]> {
  const w = window as WindowWithWebkit;
  const Ctor = w.AudioContext || w.webkitAudioContext;
  if (!Ctor) return Array(barCount).fill(0) as number[];
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new Ctor();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
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
  } finally {
    void ctx.close();
  }
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

      // Decode waveform in parallel with transcription (decorative, failure ignored)
      void decodeWaveform(blob, WAVEFORM_BAR_COUNT)
        .then((bars) => {
          if (cancelGenRef.current === gen) setWaveformData(bars);
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

  const setTranscript = useCallback((text: string) => {
    setTranscriptState(text);
  }, []);

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
    setTranscript,
    send,
    cancel,
  };
}
