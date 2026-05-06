export const VAD_CONFIG = {
  /**
   * Calibration phase duration (ms).
   * Records background noise level before listening.
   * Increase in noisy environments.
   */
  calibrationMs: 500,

  /**
   * Signal-to-noise ratio for speech detection.
   * Speech energy must be this multiple above background noise.
   * Increase to reduce false positives in noisy rooms.
   * Range: 2.0 (sensitive) - 5.0 (strict)
   */
  snrRatio: 1.25,

  /**
   * Consecutive speech frames required to confirm speech started.
   * Prevents background noise from triggering recording.
   * At ~50fps analysis: 8 frames is roughly 160ms.
   */
  speechConfirmFrames: 8,

  /**
   * Consecutive silence frames before entering PAUSE state.
   * Allows natural word boundaries without stopping.
   * At ~50fps: 15 frames is roughly 300ms.
   */
  silenceFramesToPause: 15,

  /**
   * Sustained silence duration in PAUSE state before stopping (ms).
   * Industry standard for dictation: 1000-1500ms.
   * Increase for slow or deliberate speakers.
   * Decrease for snappier conversational feel.
   */
  endOfSpeechMs: 1200,

  /**
   * Minimum recording duration before VAD can trigger stop (ms).
   * Rejects accidental noise bursts and clipped starts.
   */
  minSpeechMs: 500,

  /**
   * Lower bound of the zero-crossing-rate range treated as voiced speech.
    * Increase to reject low-frequency rumble.
    * Lower values are required for deep or strongly voiced speech.
   */
    zcrSpeechMin: 0.01,

  /**
   * Upper bound of the zero-crossing-rate range treated as voiced speech.
   * Decrease to reject broadband hiss, fans, and keyboard noise.
   */
  zcrSpeechMax: 0.45,

  /**
   * Minimum ratio of speech frames in a capture to be worth sending.
   * Recordings with a lower ratio are treated as noise and ignored.
   */
  minSpeechFrameRatio: 0.3,

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
  minimumSpeechRms: 0.01,

  /**
   * How quickly the background-noise estimate adapts during non-speech frames.
   * Increase to adapt faster in changing environments; decrease for stability.
   */
  noiseAdaptationFactor: 0.08,

  /**
   * Minimum interval between debug log lines (ms).
   * Lower values provide denser diagnostics at higher console volume.
   */
  debugLogIntervalMs: 120,
} as const;

export type VADConfig = typeof VAD_CONFIG;
