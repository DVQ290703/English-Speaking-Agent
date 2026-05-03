import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

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

  const startUserAudioCapture = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      return;
    }

    if (!mediaStreamRef.current) {
      const deviceId = selectedMicIdRef.current;
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
    }

    const preferredMimeType = 'audio/webm;codecs=opus';
    const recorder = MediaRecorder.isTypeSupported(preferredMimeType)
      ? new MediaRecorder(mediaStreamRef.current, {
          mimeType: preferredMimeType,
        })
      : new MediaRecorder(mediaStreamRef.current);

    audioChunksRef.current = [];
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    recorder.start(100);
    mediaRecorderRef.current = recorder;
  }, [selectedMicIdRef]);

  const stopUserAudioCapture = useCallback(async (): Promise<Blob | undefined> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      return undefined;
    }

    if (recorder.state === 'inactive') {
      mediaRecorderRef.current = null;
      if (audioChunksRef.current.length === 0) {
        return undefined;
      }
      const blob = new Blob(audioChunksRef.current, {
        type: recorder.mimeType || 'audio/webm',
      });
      audioChunksRef.current = [];
      return blob.size > 0 ? blob : undefined;
    }

    return await new Promise<Blob | undefined>((resolve) => {
      recorder.onstop = () => {
        mediaRecorderRef.current = null;
        const blob = audioChunksRef.current.length
          ? new Blob(audioChunksRef.current, {
              type: recorder.mimeType || 'audio/webm',
            })
          : undefined;
        audioChunksRef.current = [];
        resolve(blob && blob.size > 0 ? blob : undefined);
      };
      recorder.stop();
    });
  }, []);

  const releaseMediaStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
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
