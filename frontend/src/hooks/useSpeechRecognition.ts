import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  LANGUAGE_CODES,
  type ConnectionStatus,
  type ISpeechRecognition,
  type Language,
} from '../components/voice-agent/constants';

export interface UseSpeechRecognitionParams {
  status: ConnectionStatus;
  micEnabled: boolean;
  language: Language;
  selectedMicId: string;
  selectedMicIdRef: MutableRefObject<string>;
  mediaStreamRef: MutableRefObject<MediaStream | null>;
  refreshMicDevicesRef: MutableRefObject<() => Promise<void>>;
  setIsRecording: (next: boolean) => void;
  setMicEnabled: (next: boolean) => void;
  setChatInput: (next: string) => void;
  startUserAudioCapture: () => Promise<void>;
  stopUserAudioCapture: () => Promise<Blob | undefined>;
  sendChatMessage: (text: string, audioBlob?: Blob) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * Drives the Web Speech API recognition lifecycle:
 * - Auto-start/stop when mic toggle or connection changes
 * - Pre-flight `getUserMedia` permission probe (required inside cross-origin
 *   iframes / preview frames)
 * - Consecutive-error backoff to avoid runaway restart loops
 * - Stops capture and cleans up the recognition instance on unmount
 */
export default function useSpeechRecognition({
  status,
  micEnabled,
  language,
  selectedMicId,
  selectedMicIdRef,
  mediaStreamRef,
  refreshMicDevicesRef,
  setIsRecording,
  setMicEnabled,
  setChatInput,
  startUserAudioCapture,
  stopUserAudioCapture,
  sendChatMessage,
  t,
}: UseSpeechRecognitionParams) {
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const micPermissionInFlightRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (status !== 'connected' || !micEnabled) {
      recognitionRef.current?.stop();
      // Defer state updates to avoid triggering cascading renders inside
      // the effect body (keeps behaviour identical while satisfying the
      // lint rule).
      setTimeout(() => {
        try {
          setIsRecording(false);
          setChatInput('');
        } catch {}
      }, 0);
      void stopUserAudioCapture();
      return;
    }

    // When the user switches mic, stop the current stream so ensureMicPermission
    // opens a fresh one pointing at the newly selected device.
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((tr) => tr.stop());
      mediaStreamRef.current = null;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      alert(t('va.alert.noBrowserSupport'));
      setTimeout(() => {
        try {
          setMicEnabled(false);
        } catch {}
      }, 0);
      return;
    }

    let stopped = false;
    let consecutiveErrors = 0;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    const ensureMicPermission = (): Promise<boolean> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert(t('va.alert.noMicAPI'));
        return Promise.resolve(false);
      }
      const existing = mediaStreamRef.current;
      if (existing) {
        const hasLiveTrack = existing.getTracks().some((tr) => tr.readyState === 'live');
        if (hasLiveTrack) return Promise.resolve(true);
        existing.getTracks().forEach((tr) => tr.stop());
        mediaStreamRef.current = null;
      }

      if (micPermissionInFlightRef.current) {
        return micPermissionInFlightRef.current;
      }

      const p = (async (): Promise<boolean> => {
        try {
          const deviceId = selectedMicIdRef.current;
          const probe = await navigator.mediaDevices.getUserMedia({
            audio: {
              ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
              channelCount: 1,
            },
          });
          if (stopped) {
            probe.getTracks().forEach((tr) => tr.stop());
            return false;
          }
          void refreshMicDevicesRef.current();
          if (
            mediaStreamRef.current &&
            mediaStreamRef.current.getTracks().some((tr) => tr.readyState === 'live')
          ) {
            probe.getTracks().forEach((tr) => tr.stop());
          } else {
            mediaStreamRef.current = probe;
          }
          return true;
        } catch (err) {
          const name = (err as { name?: string })?.name || '';
          console.error('[VoiceAgent] getUserMedia failed:', err);
          if (name === 'NotAllowedError' || name === 'SecurityError') {
            alert(t('va.alert.micBlockedPreview'));
          } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
            alert(t('va.alert.micNotFound'));
          } else if (name === 'NotReadableError') {
            alert(t('va.alert.micBusy'));
          } else {
            alert(
              t('va.alert.micGeneric', {
                detail: name || t('va.alert.unknownError'),
              }),
            );
          }
          return false;
        } finally {
          micPermissionInFlightRef.current = null;
        }
      })();

      micPermissionInFlightRef.current = p;
      return p;
    };

    function startListening() {
      if (stopped) return;

      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
      }

      const recognition = new SpeechRecognitionAPI!();
      recognition.lang = LANGUAGE_CODES[language];
      recognition.interimResults = true;
      recognition.continuous = false;
      recognitionRef.current = recognition;
      let hasSentFinal = false;

      recognition.onstart = () => {
        consecutiveErrors = 0;
        setIsRecording(true);
        void startUserAudioCapture();
      };

      recognition.onresult = async (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) final += transcript;
          else interim += transcript;
        }
        if (final && !hasSentFinal) {
          hasSentFinal = true;
          const recordedAudio = await stopUserAudioCapture();
          setChatInput('');
          sendChatMessage(final, recordedAudio);
        } else {
          setChatInput(interim);
        }
      };

      recognition.onerror = (event: Event) => {
        const err = (event as { error?: string }).error || '';
        console.warn('[VoiceAgent] SpeechRecognition error:', err);
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          stopped = true;
          setMicEnabled(false);
          alert(t('va.alert.recogBlockedPreview'));
        } else if (err === 'audio-capture') {
          stopped = true;
          setMicEnabled(false);
          alert(t('va.alert.noSignal'));
        } else if (err === 'network') {
          consecutiveErrors += 3;
        } else if (err !== 'no-speech' && err !== 'aborted') {
          consecutiveErrors += 1;
        }
        setIsRecording(false);
        void stopUserAudioCapture();
      };

      recognition.onend = () => {
        setIsRecording(false);
        void stopUserAudioCapture();
        if (stopped) return;
        if (consecutiveErrors >= 4) {
          stopped = true;
          setMicEnabled(false);
          console.error('[VoiceAgent] giving up after repeated SpeechRecognition errors');
          alert(t('va.alert.recogGivingUp'));
          return;
        }
        const delay = 200 + consecutiveErrors * 400;
        restartTimer = setTimeout(() => {
          if (!stopped) startListening();
        }, delay);
      };

      try {
        recognition.start();
      } catch (err) {
        console.warn('[VoiceAgent] recognition.start() threw:', err);
      }
    }

    void ensureMicPermission().then((ok) => {
      if (ok && !stopped) startListening();
    });

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      void stopUserAudioCapture();
    };
  }, [
    status,
    micEnabled,
    language,
    selectedMicId,
    sendChatMessage,
    startUserAudioCapture,
    stopUserAudioCapture,
    setChatInput,
    setIsRecording,
    setMicEnabled,
    mediaStreamRef,
    refreshMicDevicesRef,
    selectedMicIdRef,
    t,
  ]);
}
