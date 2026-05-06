import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
] as const;

type WindowWithWebkitAudio = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function negotiateRecorderMimeType(): string {
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return '';
}

export interface UseAudioCaptureResult {
  mediaStreamRef: MutableRefObject<MediaStream | null>;
  startUserAudioCapture: () => Promise<void>;
  stopUserAudioCapture: () => Promise<Blob | undefined>;
  releaseMediaStream: () => void;
}

/**
 * Owns MediaRecorder + getUserMedia lifecycle for capturing user audio.
 * The exposed `mediaStreamRef` is shared with the speech-recognition effect
 * and `useVoiceActivity` so the same stream powers all three concerns.
 */
export default function useAudioCapture(
  selectedMicIdRef: MutableRefObject<string>,
): UseAudioCaptureResult {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recorderMimeTypeRef = useRef<string>('');
  const isStoppingRef = useRef(false);
  const lastBlobRef = useRef<Blob | null>(null);
  const blobResolversRef = useRef<Array<(blob: Blob) => void>>([]);
  const stopWaitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startUserAudioCapture = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      console.error('[AudioCapture] MediaRecorder init stage: browser APIs unavailable');
      return;
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      return;
    }

    // Edge: prevent double-stop race condition by resetting stop guard
    // at the beginning of each recording session.
    isStoppingRef.current = false;
    lastBlobRef.current = null;
    blobResolversRef.current = [];

    // Edge/Safari can keep AudioContext suspended until a user gesture lifecycle
    // settles; proactively resume so capture initialization is not blocked.
    let activationCtx: AudioContext | null = null;
    try {
      const w = window as WindowWithWebkitAudio;
      const Ctor = w.AudioContext || w.webkitAudioContext;
      if (Ctor) {
        activationCtx = new Ctor();
        if (activationCtx.state === 'suspended') {
          await activationCtx.resume();
        }
      }
    } catch (err) {
      console.warn('[AudioCapture] Permission stage: AudioContext resume guard failed', err);
    }

    if (!mediaStreamRef.current) {
      const deviceId = selectedMicIdRef.current;
      console.log('[AudioCapture] Permission stage: requesting microphone stream');
      try {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 1,
          },
        });
      } catch (err) {
        console.error('[AudioCapture] Permission stage: getUserMedia failed', err);
        return;
      }
    }

    if (!mediaStreamRef.current) {
      console.error('[AudioCapture] Permission stage: no media stream available after request');
      return;
    }

    let recorder: MediaRecorder;
    try {
      const negotiatedMimeType = negotiateRecorderMimeType();
      recorderMimeTypeRef.current = negotiatedMimeType;
      console.log('[AudioCapture] MediaRecorder init stage: negotiated MIME type', {
        mimeType: negotiatedMimeType || '(browser default)',
      });

      recorder = negotiatedMimeType
        ? new MediaRecorder(mediaStreamRef.current, { mimeType: negotiatedMimeType })
        : new MediaRecorder(mediaStreamRef.current);
    } catch (err) {
      console.error('[AudioCapture] MediaRecorder init stage: failed to initialize', err);
      return;
    } finally {
      if (activationCtx) {
        try {
          await activationCtx.close();
        } catch {
          // ignore cleanup errors from activation context
        }
      }
    }

    audioChunksRef.current = [];
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    recorder.onerror = (event: Event) => {
      console.error('[AudioCapture] Capture/blob stage: MediaRecorder error', event);
    };

    recorder.onstop = () => {
      console.log('[AudioCapture] Capture/blob stage: recorder stop event fired');

      if (stopWaitTimeoutRef.current) {
        clearTimeout(stopWaitTimeoutRef.current);
        stopWaitTimeoutRef.current = null;
      }

      const blob = new Blob(audioChunksRef.current, {
        type: recorder.mimeType || recorderMimeTypeRef.current || 'audio/webm',
      });
      lastBlobRef.current = blob;

      blobResolversRef.current.forEach((resolve) => resolve(blob));
      blobResolversRef.current = [];
      // Edge timing: useSpeechRecognition.onend fires AFTER blobResolvers resolve,
      // so we must NOT clear lastBlobRef here — late caller needs it from cache.

      console.log('[AudioCapture] Capture/blob stage: blob finalized (stop event)', {
        type: blob.type,
        size: blob.size,
      });

      audioChunksRef.current = [];
      isStoppingRef.current = false;
    };

    try {
      // Avoid tiny timeslices that can behave inconsistently across browsers.
      recorder.start(250);
    } catch (err) {
      console.error('[AudioCapture] Capture/blob stage: failed to start recorder', err);
      return;
    }

    mediaRecorderRef.current = recorder;
  }, [selectedMicIdRef]);

  const stopUserAudioCapture = useCallback(async (): Promise<Blob | undefined> => {
    // PRIORITY 1: return cached blob first (Edge can stop recorder before speech end).
    if (lastBlobRef.current) {
      const cached = lastBlobRef.current;
      // DESIGN RULE: lastBlobRef is write-once per session (set in onstop,
      // cleared only in startRecording). Never clear it inside stopRecording()
      // because multiple callers per cycle all need to read the same blob.
      console.log('[AudioCapture] stopRecording: returning cached blob', {
        type: cached.type,
        size: cached.size,
      });
      return cached;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      console.error('[AudioCapture] stopRecording: inactive recorder and no cached blob');
      throw new Error('No active recorder and no cached blob');
    }

    // PRIORITY 2: recorder active, stop and await onstop resolver queue.
    if (recorder.state === 'recording') {
      console.log('[AudioCapture] stopRecording: recorder active, stopping now');

      if (isStoppingRef.current) {
        return await new Promise<Blob>((resolve) => {
          blobResolversRef.current.push(resolve);
        });
      }

      isStoppingRef.current = true;

      return await new Promise<Blob | undefined>((resolve, reject) => {
        blobResolversRef.current.push(resolve as (blob: Blob) => void);

        try {
          recorder.stop();
        } catch (err) {
          console.error('[AudioCapture] Capture/blob stage: recorder.stop() failed', err);
          isStoppingRef.current = false;
          blobResolversRef.current = [];
          reject(err instanceof Error ? err : new Error('[AudioCapture] recorder.stop() failed'));
        }
      });
    }

    // PRIORITY 3: recorder not recording and no cached blob.
    if (recorder.state === 'inactive') {
      console.log('[AudioCapture] stopRecording: inactive, onstop pending - waiting for blob');

      // Edge: recognition.onend can fire before onstop in the same event loop tick.
      // Register a pending resolver instead of rejecting - onstop will fulfill it.
      return await new Promise<Blob>((resolve, reject) => {
        if (stopWaitTimeoutRef.current) {
          clearTimeout(stopWaitTimeoutRef.current);
        }

        const resolveWhenReady = (blob: Blob) => {
          if (stopWaitTimeoutRef.current) {
            clearTimeout(stopWaitTimeoutRef.current);
            stopWaitTimeoutRef.current = null;
          }
          resolve(blob);
        };

        stopWaitTimeoutRef.current = setTimeout(() => {
          blobResolversRef.current = blobResolversRef.current.filter((resolver) => resolver !== resolveWhenReady);
          stopWaitTimeoutRef.current = null;
          console.error('[AudioCapture] stopRecording: timed out waiting for onstop blob');
          reject(new Error('Timed out waiting for blob after recorder inactive'));
        }, 200);

        blobResolversRef.current.push(resolveWhenReady);
      });
    }

    console.error('[AudioCapture] stopRecording: no recorder initialized');
    throw new Error('No active recorder and no cached blob');
  }, []);

  const releaseMediaStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (stopWaitTimeoutRef.current) {
        clearTimeout(stopWaitTimeoutRef.current);
        stopWaitTimeoutRef.current = null;
      }
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    };
  }, []);

  return {
    mediaStreamRef,
    startUserAudioCapture,
    stopUserAudioCapture,
    releaseMediaStream,
  };
}
