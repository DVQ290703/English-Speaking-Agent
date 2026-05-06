import { VAD_CONFIG, type VADConfig } from './VADConfig';
import type { VADDecision, VADFrameMetrics, VADSessionQuality, VADState } from './VADTypes';

export class VADController {
  private readonly config: VADConfig;
  private state: VADState = 'calibrating';
  private startedAt = 0;
  private noiseFloor: number = VAD_CONFIG.minimumNoiseFloor;
  private calibrationFrames = 0;
  private calibrationTotal = 0;
  private consecutiveSpeechFrames = 0;
  private consecutiveSilenceFrames = 0;
  private totalFrames = 0;
  private speechFrames = 0;
  private speechStartedAt: number | null = null;
  private pauseStartedAt: number | null = null;
  private stopIssued = false;
  private hadSpeech = false;
  private peakRms = 0;
  private lastFrameAt = 0;

  constructor(config: VADConfig = VAD_CONFIG) {
    this.config = config;
    this.reset();
  }

  reset(): void {
    this.state = 'calibrating';
    this.startedAt = 0;
    this.noiseFloor = this.config.minimumNoiseFloor;
    this.calibrationFrames = 0;
    this.calibrationTotal = 0;
    this.consecutiveSpeechFrames = 0;
    this.consecutiveSilenceFrames = 0;
    this.totalFrames = 0;
    this.speechFrames = 0;
    this.speechStartedAt = null;
    this.pauseStartedAt = null;
    this.stopIssued = false;
    this.hadSpeech = false;
    this.peakRms = 0;
    this.lastFrameAt = 0;
  }

  get sessionQuality(): VADSessionQuality {
    const durationMs = this.startedAt > 0 && this.lastFrameAt >= this.startedAt
      ? this.lastFrameAt - this.startedAt
      : 0;

    return {
      speechDetected: this.hadSpeech,
      speechFrameRatio: this.totalFrames === 0 ? 0 : this.speechFrames / this.totalFrames,
      peakRMS: this.peakRms,
      durationMs,
    };
  }

  processFrame(metrics: VADFrameMetrics, nowMs: number): VADDecision {
    if (this.startedAt === 0) {
      this.startedAt = nowMs;
    }
    this.lastFrameAt = nowMs;
    this.peakRms = Math.max(this.peakRms, metrics.rms);

    if (this.state === 'calibrating') {
      // Do not let early speech bursts poison the initial background-noise estimate.
      if (metrics.rms < this.config.minimumSpeechRms) {
        this.calibrationFrames += 1;
        this.calibrationTotal += metrics.rms;
        this.noiseFloor = Math.max(
          this.config.minimumNoiseFloor,
          this.calibrationTotal / this.calibrationFrames,
        );
      }

      if (nowMs - this.startedAt >= this.config.calibrationMs) {
        this.state = 'listening';
      }

      return this.buildDecision(metrics, false);
    }

    this.totalFrames += 1;

    const snr = metrics.rms / Math.max(this.noiseFloor, this.config.minimumNoiseFloor);
    const voicedByZcr =
      metrics.zcr >= this.config.zcrSpeechMin && metrics.zcr <= this.config.zcrSpeechMax;
    const exceedsSpeechFloor = metrics.rms >= this.config.minimumSpeechRms;
    const isSpeechFrame = voicedByZcr && (snr >= this.config.snrRatio || exceedsSpeechFloor);
    const currentThreshold =
      Math.max(this.noiseFloor, this.config.minimumNoiseFloor) * this.config.snrRatio;

    if (!isSpeechFrame && metrics.rms < currentThreshold * 0.75) {
      this.noiseFloor = Math.max(
        this.config.minimumNoiseFloor,
        this.noiseFloor * (1 - this.config.noiseAdaptationFactor) +
          metrics.rms * this.config.noiseAdaptationFactor,
      );
    }

    if (isSpeechFrame) {
      this.speechFrames += 1;
      this.consecutiveSpeechFrames += 1;
      this.consecutiveSilenceFrames = 0;
      this.pauseStartedAt = null;

      if (this.consecutiveSpeechFrames >= this.config.speechConfirmFrames) {
        if (this.speechStartedAt === null) {
          this.speechStartedAt = nowMs;
        }
        this.state = 'speech';
        this.hadSpeech = true;
      }

      return this.buildDecision(metrics, this.state === 'speech');
    }

    this.consecutiveSpeechFrames = 0;

    if (this.state === 'speech' || this.state === 'pause') {
      this.consecutiveSilenceFrames += 1;

      if (this.state === 'speech' && this.consecutiveSilenceFrames >= this.config.silenceFramesToPause) {
        this.state = 'pause';
        this.pauseStartedAt = nowMs;
      }

      if (this.state === 'pause' && this.pauseStartedAt !== null) {
        const pauseDurationMs = nowMs - this.pauseStartedAt;
        if (pauseDurationMs >= this.config.endOfSpeechMs) {
          const speechDurationMs = this.speechStartedAt === null ? 0 : nowMs - this.speechStartedAt;
          const speechFrameRatio = this.totalFrames === 0 ? 0 : this.speechFrames / this.totalFrames;

          if (
            !this.stopIssued &&
            speechDurationMs >= this.config.minSpeechMs &&
            speechFrameRatio >= this.config.minSpeechFrameRatio
          ) {
            this.state = 'ended';
            this.stopIssued = true;
            return this.buildDecision(metrics, false, true);
          }

          this.resetListeningWindow();
        }
      }
    } else {
      this.state = 'listening';
    }

    return this.buildDecision(metrics, false);
  }

  private resetListeningWindow(): void {
    this.state = 'listening';
    this.consecutiveSpeechFrames = 0;
    this.consecutiveSilenceFrames = 0;
    this.totalFrames = 0;
    this.speechFrames = 0;
    this.speechStartedAt = null;
    this.pauseStartedAt = null;
  }

  private buildDecision(
    metrics: VADFrameMetrics,
    isSpeaking: boolean,
    shouldStop = false,
  ): VADDecision {
    const snr = metrics.rms / Math.max(this.noiseFloor, this.config.minimumNoiseFloor);
    const speechFrameRatio = this.totalFrames === 0 ? 0 : this.speechFrames / this.totalFrames;
    const threshold = Math.max(this.noiseFloor, this.config.minimumNoiseFloor) * this.config.snrRatio;

    return {
      state: this.state,
      isSpeaking,
      shouldStop,
      rms: metrics.rms,
      zcr: metrics.zcr,
      snr,
      speechFrameRatio,
      threshold,
    };
  }
}
