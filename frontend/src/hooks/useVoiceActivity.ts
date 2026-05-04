import { useEffect, useState, type RefObject } from 'react';

type WindowWithWebkitAudio = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
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
  options: { threshold?: number; attackMs?: number; releaseMs?: number } = {},
) {
  const { threshold = 0.025, attackMs = 30, releaseMs = 220 } = options;
  const [internalSpeaking, setInternalSpeaking] = useState(false);

  useEffect(() => {
    if (!active) return;
    const stream = streamRef.current;
    if (!stream) return;

    const w = window as WindowWithWebkitAudio;
    const Ctor = w.AudioContext || w.webkitAudioContext;
    if (!Ctor) return;

    let cancelled = false;
    let raf: number | null = null;
    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    const teardown = () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      try {
        source?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        analyser?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        if (ctx && ctx.state !== 'closed') void ctx.close();
      } catch {
        /* ignore */
      }
      source = null;
      analyser = null;
      ctx = null;
    };

    try {
      ctx = new Ctor();
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      // Some browsers (notably iOS Safari) start AudioContexts in the
      // 'suspended' state until a user gesture; resume opportunistically
      // so RMS sampling actually reflects the input level.
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
    } catch {
      teardown();
      return;
    }

    const data = new Uint8Array(analyser.fftSize);
    let lastSpeaking = false;
    let firstTick = true;
    let aboveSince = 0;
    let belowSince = 0;

    const tick = () => {
      if (cancelled || !analyser) return;
      // First tick after (re)binding: clear any stale `true` from a previous
      // activation cycle so the consumer doesn't briefly see "speaking" while
      // the new mic input is still silent. Done in the rAF callback (allowed
      // by `react-hooks/set-state-in-effect`) rather than the effect body.
      if (firstTick) {
        firstTick = false;
        setInternalSpeaking(false);
      }
      // If the underlying stream was swapped (e.g. user changed mic device),
      // stop sampling — the parent effect will re-bind on the next active
      // toggle. This avoids reporting speech from a stale, possibly closed
      // MediaStreamSource.
      if (streamRef.current !== stream) {
        if (lastSpeaking) {
          lastSpeaking = false;
          setInternalSpeaking(false);
        }
        return;
      }
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const isLoud = rms > threshold;
      const now = performance.now();

      if (isLoud) {
        if (aboveSince === 0) aboveSince = now;
        belowSince = 0;
        if (!lastSpeaking && now - aboveSince >= attackMs) {
          lastSpeaking = true;
          setInternalSpeaking(true);
        }
      } else {
        if (belowSince === 0) belowSince = now;
        aboveSince = 0;
        if (lastSpeaking && now - belowSince >= releaseMs) {
          lastSpeaking = false;
          setInternalSpeaking(false);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      teardown();
    };
  }, [active, streamRef, threshold, attackMs, releaseMs]);

  // Gate the returned value on `active` so consumers see `false` instantly
  // when activation flips off — without us having to call setState inside
  // the effect body or cleanup.
  return active && internalSpeaking;
}
