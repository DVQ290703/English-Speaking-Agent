export type VADState = 'calibrating' | 'listening' | 'speech' | 'pause' | 'ended';

export interface VADFrameMetrics {
  rms: number;
  zcr: number;
}

export interface VADDecision {
  state: VADState;
  isSpeaking: boolean;
  shouldStop: boolean;
  rms: number;
  zcr: number;
  snr: number;
  speechFrameRatio: number;
  threshold: number;
}

export interface VADDebugData {
  state: VADState;
  rms: number;
  zcr: number;
  snr: number;
  speechFrameRatio: number;
  threshold: number;
  processor: 'audio-worklet' | 'script-processor' | 'unavailable';
}

export interface VADSessionQuality {
  /** Whether the VAD session ever reached confirmed speech state. */
  speechDetected: boolean;
  /** Ratio of analyzed frames classified as speech, from 0.0 to 1.0. */
  speechFrameRatio: number;
  /** Peak RMS observed during the recording session. */
  peakRMS: number;
  /** Total analyzed recording duration for the session, in milliseconds. */
  durationMs: number;
}
