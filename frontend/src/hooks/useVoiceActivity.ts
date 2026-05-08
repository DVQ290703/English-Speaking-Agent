import { useEffect, useRef, useState, type RefObject } from 'react';

import { VAD_CONFIG } from '../lib/vad/VADConfig';
import { VADController } from '../lib/vad/VADController';
import { computeVADFrameMetrics } from '../lib/vad/VADMath';
import type { VADDebugData, VADSessionQuality, VADState } from '../lib/vad/VADTypes';

type WindowWithWebkitAudio = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

interface UseVoiceActivityOptions {
  onSpeechComplete?: () => void;
}

interface UseVoiceActivityResult {
  isSpeaking: boolean;
  getLastSessionQuality: () => VADSessionQuality;
}

const DEFAULT_VAD_SESSION_QUALITY: VADSessionQuality = {
  speechDetected: false,
  speechFrameRatio: 0,
  peakRMS: 0,
  durationMs: 0,
};

let workletModuleCounter = 0;

function buildWorkletSource(processorName: string, frameSize: number): string {
  return `class VADFrameProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(${frameSize});
    this.offset = 0;
  }

  process(inputs) {
    const channelData = inputs[0] && inputs[0][0];
    if (channelData && channelData.length > 0) {
      let sourceIndex = 0;
      while (sourceIndex < channelData.length) {
        const remaining = this.buffer.length - this.offset;
        const copyCount = Math.min(remaining, channelData.length - sourceIndex);
        this.buffer.set(channelData.subarray(sourceIndex, sourceIndex + copyCount), this.offset);
        this.offset += copyCount;
        sourceIndex += copyCount;

        if (this.offset === this.buffer.length) {
          this.port.postMessage(this.buffer.slice());
          this.offset = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('${processorName}', VADFrameProcessor);
`;
}

async function createAudioFrameBridge(
  ctx: AudioContext,
  source: MediaStreamAudioSourceNode,
  onSamples: (samples: Float32Array) => void,
  shouldAbort: () => boolean,
): Promise<{ cleanup: () => void; processor: VADDebugData['processor'] }> {
  const noOpBridge = {
    processor: 'unavailable' as const,
    cleanup: () => {},
  };

  if (shouldAbort() || (ctx.state as string) === 'closed') {
    return noOpBridge;
  }

  const silenceGain = ctx.createGain();
  silenceGain.gain.value = 0;

  const cleanupNodes = (disconnect: () => void) => {
    try {
      disconnect();
    } catch {
      /* ignore */
    }
    try {
      silenceGain.disconnect();
    } catch {
      /* ignore */
    }
  };

  // Prefer AudioWorklet when available for lower-jitter processing.
  // Safari < 14 lacks it, so we fall back to ScriptProcessor below.
  if ('audioWorklet' in ctx && typeof AudioWorkletNode !== 'undefined') {
    try {
      const processorName = `vad-frame-processor-${++workletModuleCounter}`;
      const moduleUrl = URL.createObjectURL(
        new Blob([buildWorkletSource(processorName, VAD_CONFIG.analysisBufferSize)], { type: 'application/javascript' }),
      );

      try {
        await ctx.audioWorklet.addModule(moduleUrl);
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }

      if (shouldAbort() || (ctx.state as string) === 'closed') {
        return noOpBridge;
      }

      const node = new AudioWorkletNode(ctx, processorName, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
      });

      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        onSamples(event.data);
      };

      source.connect(node);
      node.connect(silenceGain);
      silenceGain.connect(ctx.destination);

      return {
        processor: 'audio-worklet',
        cleanup: () => {
        cleanupNodes(() => {
          node.port.onmessage = null;
          source.disconnect(node);
          node.disconnect();
        });
        },
      };
    } catch (err) {
      if (shouldAbort() || (ctx.state as string) === 'closed') {
        return noOpBridge;
      }
      console.warn('[VAD] AudioWorklet unavailable — falling back to ScriptProcessor', err);
    }
  }

  if (shouldAbort() || (ctx.state as string) === 'closed') {
    return noOpBridge;
  }

  const processor = ctx.createScriptProcessor(VAD_CONFIG.analysisBufferSize, 1, 1);
  processor.onaudioprocess = (event: AudioProcessingEvent) => {
    const channelData = event.inputBuffer.getChannelData(0);
    onSamples(channelData.slice());
  };

  source.connect(processor);
  processor.connect(silenceGain);
  silenceGain.connect(ctx.destination);

  return {
    processor: 'script-processor',
    cleanup: () => {
      cleanupNodes(() => {
        processor.onaudioprocess = null;
        source.disconnect(processor);
        processor.disconnect();
      });
    },
  };
}

const DEFAULT_VAD_DEBUG: VADDebugData = {
  state: 'calibrating',
  rms: 0,
  zcr: 0,
  snr: 0,
  speechFrameRatio: 0,
  threshold: 0,
  processor: 'unavailable',
};

/**
 * Detects whether the user is currently speaking by sampling the RMS of a
 * microphone `MediaStream` via Web Audio API. Designed to drive UI animations
 * (mic button pulse, waveform) so they only react during actual speech.
 *
 * Safe across stream swaps: the rAF loop bails out if `streamRef.current`
 * diverges from the stream we bound to, and the parent effect will re-bind
 * the next time `active` flips. Resumes suspended AudioContexts (iOS/Safari).
 *
 * Returned value is gated by `active` so consumers see `false` immediately
 * when activation flips off, without needing a synchronous reset inside the
 * effect (which `react-hooks/set-state-in-effect` flags). State updates
 * happen only inside the rAF callback, which the rule treats as an
 * external-event handler.
 */
export default function useVoiceActivity(
  streamRef: RefObject<MediaStream | null>,
  active: boolean,
  options: UseVoiceActivityOptions = {},
): UseVoiceActivityResult {
  const isDev = import.meta.env.DEV;
  const { onSpeechComplete } = options;
  const [internalSpeaking, setInternalSpeaking] = useState(false);
  const controllerRef = useRef(new VADController());
  const speakingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const lastLogAtRef = useRef(0);
  const lastLoggedStateRef = useRef<VADState>('calibrating');
  const onSpeechCompleteRef = useRef(onSpeechComplete);
  const debugRef = useRef<VADDebugData>(DEFAULT_VAD_DEBUG);
  const lastSessionQualityRef = useRef<VADSessionQuality>(DEFAULT_VAD_SESSION_QUALITY);

  useEffect(() => {
    onSpeechCompleteRef.current = onSpeechComplete;
  }, [onSpeechComplete]);

  useEffect(() => {
    if (!active) {
      const completedQuality = controllerRef.current.sessionQuality;
      if (completedQuality.durationMs > 0) {
        lastSessionQualityRef.current = completedQuality;
      }
      controllerRef.current.reset();
      speakingRef.current = false;
      stopRequestedRef.current = false;
      lastLogAtRef.current = 0;
      lastLoggedStateRef.current = 'calibrating';
      debugRef.current = DEFAULT_VAD_DEBUG;
    }
  }, [active, isDev]);

  useEffect(() => {
    if (!active) return;
    const stream = streamRef.current;
    if (!stream) return;

    const w = window as WindowWithWebkitAudio;
    const Ctor = w.AudioContext || w.webkitAudioContext;
    if (!Ctor) return;

    let cancelled = false;
    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let teardownProcessor: (() => void) | null = null;

    controllerRef.current.reset();
    lastSessionQualityRef.current = DEFAULT_VAD_SESSION_QUALITY;
    speakingRef.current = false;
    stopRequestedRef.current = false;
    lastLogAtRef.current = 0;
    lastLoggedStateRef.current = 'calibrating';
    debugRef.current = DEFAULT_VAD_DEBUG;
    setInternalSpeaking(false);

    const teardown = () => {
      teardownProcessor?.();
      teardownProcessor = null;
      try {
        source?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        if (ctx && ctx.state !== 'closed') void ctx.close();
      } catch {
        /* ignore */
      }
      source = null;
      ctx = null;
    };

    const processSamples = (samples: Float32Array) => {
      if (cancelled || streamRef.current !== stream) {
        return;
      }

      const now = performance.now();
      const metrics = computeVADFrameMetrics(samples);
      const decision = controllerRef.current.processFrame(metrics, now);
      lastSessionQualityRef.current = controllerRef.current.sessionQuality;
      debugRef.current = {
        state: decision.state,
        rms: decision.rms,
        zcr: decision.zcr,
        snr: decision.snr,
        speechFrameRatio: decision.speechFrameRatio,
        threshold: decision.threshold,
        processor: debugRef.current.processor,
      };

      if (decision.isSpeaking !== speakingRef.current) {
        speakingRef.current = decision.isSpeaking;
        setInternalSpeaking(decision.isSpeaking);
      }

      if (
        isDev &&
        decision.shouldStop ||
        (isDev && decision.state !== lastLoggedStateRef.current) ||
        (isDev && now - lastLogAtRef.current >= VAD_CONFIG.debugLogIntervalMs)
      ) {
        if (isDev) {
          console.log('[VAD]', {
            state: decision.state,
            rms: Number(decision.rms.toFixed(4)),
            zcr: Number(decision.zcr.toFixed(4)),
            snr: Number(decision.snr.toFixed(2)),
            speechFrameRatio: Number(decision.speechFrameRatio.toFixed(2)),
            threshold: Number(decision.threshold.toFixed(4)),
            processor: debugRef.current.processor,
          });
          lastLoggedStateRef.current = decision.state;
          lastLogAtRef.current = now;
        }
      }

      if (decision.shouldStop && !stopRequestedRef.current) {
        stopRequestedRef.current = true;
        onSpeechCompleteRef.current?.();
      }
    };

    void (async () => {
      try {
        ctx = new Ctor();
        // Safari can start AudioContext suspended until a user-driven record session begins.
        // Resume before wiring analysis so VAD sees real microphone samples.
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        if (cancelled) {
          void ctx.close();
          return;
        }

        source = ctx.createMediaStreamSource(stream);
        const bridge = await createAudioFrameBridge(ctx, source, processSamples, () => cancelled);
        if (cancelled || ctx.state === 'closed') {
          bridge.cleanup();
          return;
        }
        debugRef.current = {
          ...debugRef.current,
          processor: bridge.processor,
        };
        teardownProcessor = bridge.cleanup;
      } catch (err) {
        console.error('[VAD] Failed to initialize voice activity detector', err);
        teardown();
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [active, streamRef]);

  // Gate the returned value on `active` so consumers see `false` instantly
  // when activation flips off — without us having to call setState inside
  // the effect body or cleanup.
  return {
    isSpeaking: active && internalSpeaking,
    getLastSessionQuality: () => lastSessionQualityRef.current,
  };
}
