// Tuned for: laptop/headset microphones in normal office environments
// Re-tune snrRatio if deploying in noisy (café) or studio conditions
export const VAD_CONFIG = {
  calibrationMs: 500,

  /**
   * SNR ratio for speech detection.
   * 3.0 = studio mic in silent room (too strict for production)
   * 1.8 = laptop mic in normal office environment ← USE THIS
   * 1.5 = noisy environment / cheap mic
   * Decrease if quiet speakers are not detected.
   * Increase if background noise triggers false positives.
   */
  snrRatio: 1.8, // was 3.0 → too strict for laptop/headset mics

  /**
   * Consecutive speech frames to confirm speech started.
   * Lower = more responsive, higher = fewer false positives.
   * At 50fps: 5 frames = 100ms of confirmed speech
   */
  speechConfirmFrames: 5, // was 8 → lower for faster response

  /**
   * Consecutive silence frames before entering PAUSE.
   * At 50fps: 12 frames = ~240ms
   */
  silenceFramesToPause: 12, // was 15, slight reduction

  /**
   * Sustained silence before end-of-speech trigger (ms).
   * 1200ms = comfortable pause for natural speech
   */
  endOfSpeechMs: 1200,

  /**
   * Minimum recording duration before VAD can stop (ms).
   */
  minSpeechMs: 600,

  /**
   * ZCR range for voiced speech.
   * Widen slightly to catch more speech patterns.
   */
  zcrSpeechMin: 0.05, // was 0.10 → catches low-frequency voiced speech
  zcrSpeechMax: 0.5, // was 0.45 → slightly wider band

  /**
   * Minimum speech frame ratio to pass quality gate.
   * 0.05 = only 5% of frames need speech signal
   * Lower because with SNR=1.8, fewer frames will be classified as speech
   * but they'll be genuine speech frames.
   */
  minSpeechFrameRatio: 0.23, // was 0.15 → too strict for SNR=1.8

  /**
   * Minimum peak RMS to pass quality gate.
   * Reject recordings with no meaningful audio energy at all.
   */
  minPeakRMS: 0.008, // new: explicit peak energy gate

  /**
   * Web Audio processor buffer size in frames.
   * Smaller values reduce stop latency; larger values reduce CPU overhead.
   */
  analysisBufferSize: 1024,

  /**
   * Minimum RMS floor used when estimating background noise.
   * Prevents divide-by-zero and over-amplified SNR on nearly silent inputs.
   */
  minimumNoiseFloor: 0.0025,

  /**
   * Absolute RMS floor that qualifies as plausible speech energy.
   * Increase to reject faint background noise; decrease for softer speakers.
   */
  minimumSpeechRms: 0.008,

  /**
   * How quickly the background-noise estimate adapts during non-speech frames.
   * Increase to adapt faster in changing environments; decrease for stability.
   */
  noiseAdaptationFactor: 0.05,

  /**
   * Minimum interval between debug log lines (ms).
   * Lower values provide denser diagnostics at higher console volume.
   */
  debugLogIntervalMs: 120,
} as const;

export type VADConfig = typeof VAD_CONFIG;
