import { useEffect, useRef, useCallback, type MutableRefObject } from 'react';
import {
  LANGUAGE_CODES,
  type ConnectionStatus,
  type ISpeechRecognition,
  type SpeechRecognitionEvent,
  type Language,
} from '../components/voice-agent/constants';
import type { VADSessionQuality } from '../lib/vad/VADTypes';
import { isHallucinatedTranscript } from '../lib/vad/hallucinationFilter';

const VAD_GATE_MIN_SPEECH_RATIO = 0.07; // was 0.1
const VAD_GATE_MIN_PEAK_RMS = 0.003; // was 0.005
const VAD_GATE_MIN_DURATION_MS = 400; // was 400

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
  getLastSessionQuality: () => VADSessionQuality;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export interface UseSpeechRecognitionResult {
  stopSpeechRecognition: () => void;
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
  getLastSessionQuality,
  t,
}: UseSpeechRecognitionParams): UseSpeechRecognitionResult {
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          // console.log('[Speech] cleanup: aborting recognition on unmount');
          recognitionRef.current.abort();
          recognitionRef.current = null;
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        // console.log('[Speech] stopping recognition manually');
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);
  const micPermissionInFlightRef = useRef<Promise<boolean> | null>(null);
  const isHandlingEndRef = useRef(false);
  const backendOnlyCaptureRef = useRef(false);
  const stopUserAudioCaptureRef = useRef(stopUserAudioCapture);
  const sendChatMessageRef = useRef(sendChatMessage);
  const getLastSessionQualityRef = useRef(getLastSessionQuality);

  useEffect(() => {
    stopUserAudioCaptureRef.current = stopUserAudioCapture;
  }, [stopUserAudioCapture]);

  useEffect(() => {
    sendChatMessageRef.current = sendChatMessage;
  }, [sendChatMessage]);

  useEffect(() => {
    getLastSessionQualityRef.current = getLastSessionQuality;
  }, [getLastSessionQuality]);

  useEffect(() => {
    const passesVADQualityGate = (hasTranscript = false): boolean => {
      const quality = getLastSessionQualityRef.current();

      /*
      console.log('[Speech] VAD quality gate check', {
        speechDetected: quality.speechDetected,
        speechFrameRatio: quality.speechFrameRatio,
        peakRMS: quality.peakRMS,
        durationMs: quality.durationMs,
      });
      */

      // Bug 1 fix: Require BOTH confirmed speech state AND minimum speech frames
      // Prevents breath sounds (detected as speech but ratio=0) from passing.
      const hasRealSpeech =
        quality.speechDetected && quality.speechFrameRatio >= VAD_GATE_MIN_SPEECH_RATIO;
      const hasAudioEnergy = quality.peakRMS >= VAD_GATE_MIN_PEAK_RMS;

      if (!hasRealSpeech && !hasAudioEnergy && !hasTranscript) {
        // Genuine silence — reject
        return false;
      }

      if (!hasRealSpeech && !hasTranscript) {
        /*
        console.warn('[Speech] VAD gate: rejected — breath/noise', {
          reason: !quality.speechDetected
            ? 'VAD never entered speech state'
            : 'speech ratio too low — likely breath/noise',
          speechDetected: quality.speechDetected,
          speechFrameRatio: quality.speechFrameRatio,
          peakRMS: quality.peakRMS,
        });
        */
        return false;
      }

      // If the browser already produced a transcript, we trust it and pass the gate 
      // immediately to ensure the user's message is sent automatically.
      if (hasTranscript) return true;

      if (
        quality.durationMs < VAD_GATE_MIN_DURATION_MS &&
        quality.speechFrameRatio < VAD_GATE_MIN_SPEECH_RATIO * 2
      ) {
        // console.warn('[Speech] VAD quality gate: too short with low speech ratio — send aborted');
        return false;
      }

      // console.log('[Speech] VAD quality gate: PASSED — proceeding to send');
      return true;
    };

    const safeStopRecording = async (reason: string): Promise<Blob | undefined> => {
      try {
        return await stopUserAudioCaptureRef.current();
      } catch (err) {
        if (reason !== 'effect cleanup') {
          // console.error('[Speech] stopRecording threw:', { reason, err });
        }
        return undefined;
      }
    };

    const stopAndSendBackendOnly = async (reason: string) => {
      if (isHandlingEndRef.current) {
        return;
      }

      isHandlingEndRef.current = true;
      try {
        const recordedAudio = await safeStopRecording(reason);
        if (!recordedAudio || recordedAudio.size === 0) {
          // console.warn('[Speech] backend-only mode: blob missing or empty — send aborted');
          return;
        }

        if (!passesVADQualityGate()) {
          setChatInput('');
          return;
        }

        // Firefox and other non-Web-Speech browsers still capture audio via MediaRecorder.
        // Delegate transcription to backend Groq Whisper STT via audio_file upload.
        /*
        console.log(
          '[Speech] SpeechRecognition unavailable — delegating transcription to backend STT',
        );
        */
        setChatInput('');
        await Promise.resolve(sendChatMessageRef.current('', recordedAudio));
      } finally {
        backendOnlyCaptureRef.current = false;
        isHandlingEndRef.current = false;
      }
    };

    if (status !== 'connected' || !micEnabled) {
      recognitionRef.current?.stop();
      // Defer state updates to avoid triggering cascading renders inside
      // the effect body (keeps behaviour identical while satisfying the
      // lint rule).
      setTimeout(() => {
        try {
          setIsRecording(false);
          setChatInput('');
        } catch {
          /* ignore */
        }
      }, 0);
      if (!isHandlingEndRef.current && (recognitionRef.current || backendOnlyCaptureRef.current)) {
        void safeStopRecording('status/mic gate');
      }
      if (!isHandlingEndRef.current && backendOnlyCaptureRef.current) {
        void stopAndSendBackendOnly('status/mic gate');
      }
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
      // Firefox does not expose SpeechRecognition/WebKitSpeechRecognition.
      // Keep MediaRecorder capture enabled and let the backend transcribe audio_file.
      // console.log('[Speech] SpeechRecognition not supported — using backend STT only');
      backendOnlyCaptureRef.current = true;
      setIsRecording(true);
      void startUserAudioCapture();

      return () => {
        backendOnlyCaptureRef.current = false;
      };
    }

    let stopped = false;
    let consecutiveErrors = 0;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;

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
      let hasSentAny = false;
      recognition.continuous = true;
      recognitionRef.current = recognition;
      let hasSentFinal = false;
      let finalTranscript = '';
      let interimTranscript = '';

      const stopAndSend = async () => {
        if (isHandlingEndRef.current) return;
        if (hasSentAny) return;
        hasSentAny = true;

        // Edge: prevent double-stop race condition
        isHandlingEndRef.current = true;

        const safetyTimer = setTimeout(() => {
          isHandlingEndRef.current = false;
        }, 5000);

        try {
          // console.log('[Speech] calling stopRecording, blob expected next');
          const recordedAudio = await safeStopRecording('stopAndSend');
          /*
          console.log('[Speech] received blob', {
            type: recordedAudio?.type,
            size: recordedAudio?.size,
          });
          */

          if (!recordedAudio || recordedAudio.size === 0) {
            // console.error('[Speech] blob missing or empty — send aborted');
            return;
          }

          const messageText = (finalTranscript.trim() || interimTranscript.trim()).trim();
          const quality = getLastSessionQualityRef.current();

          if (!passesVADQualityGate(!!messageText)) {
            // Only clear input if we didn't get any transcript from the browser.
            // If the browser heard something, we keep it visible even if audio gate failed.
            if (!messageText) setChatInput('');
            return;
          }

          // Hallucination Guard: Filter out garbled or known fake patterns.
          if (messageText && isHallucinatedTranscript(messageText)) {
            /*
            console.warn('[Speech] hallucination detected — send aborted', {
              transcript: messageText,
            });
            */
            setChatInput('');
            return;
          }
          if (!messageText && !recordedAudio) {
            // console.warn('[Speech] no transcript and no blob — send aborted');
            return;
          }

          if (!messageText && recordedAudio) {
            // Edge: window.SpeechRecognition fires onend without onresult for some utterances.
            // Delegate transcription to backend Groq Whisper STT via audio_file upload.
            // console.log('[Speech] transcript empty but blob present — delegating STT to backend');
          }

          if (messageText) {
            /*
            console.log('[Speech] using transcript', {
              source: finalTranscript.trim() ? 'final' : 'interim (Edge fallback)',
              text: messageText,
            });
            */
          }

          setChatInput('');
          /*
          console.log('[Speech] calling sendMessage with blob', {
            hasBlob: !!recordedAudio,
            size: recordedAudio?.size,
          });
          */
          await Promise.resolve(sendChatMessageRef.current(messageText, recordedAudio));
        } catch (err) {
          // console.error('[Speech] stop/send flow failed', err);
          hasSentAny = false;
        } finally {
          clearTimeout(safetyTimer);
          isHandlingEndRef.current = false;
        }
      };

      recognition.onstart = () => {
        consecutiveErrors = 0;
        isHandlingEndRef.current = false;
        finalTranscript = '';
        interimTranscript = '';
        if (silenceTimer) clearTimeout(silenceTimer);
        setIsRecording(true);
        void startUserAudioCapture();
      };

      recognition.onresult = async (event: SpeechRecognitionEvent) => {
        interimTranscript = '';
        let finalChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalChunk += transcript;
          else interimTranscript += transcript;
        }

        if (finalChunk) {
          finalTranscript = `${finalTranscript} ${finalChunk}`.trim();
        }

        setChatInput(interimTranscript || finalTranscript);

        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          if (!hasSentFinal && (finalTranscript || interimTranscript)) {
            hasSentFinal = true;
            void stopAndSend();
          }
        }, 5000);
      };

      recognition.onerror = (event: Event) => {
        const err = (event as { error?: string }).error || '';
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
        if (!isHandlingEndRef.current) {
          void safeStopRecording('recognition.onerror');
        }
      };

      recognition.onend = async () => {
        // console.log('[Speech] recognition ended, triggering stop flow');
        setIsRecording(false);
        // ⚠️ RACE CONDITION: Edge fires onend BEFORE onresult, opposite of Chrome.
        // Wait 80ms to give onresult a chance to arrive and call stopAndSend() first
        // with the actual transcript. If onresult wins, hasSentAny will be true and
        // the stopAndSend() call below will be a no-op.
        await new Promise<void>((r) => setTimeout(r, 150));
        if (!isHandlingEndRef.current && !hasSentAny) {
          try {
            await stopAndSend();
          } catch (err) {
            // console.error('[Speech] onend flow failed', err);
          }
        }
        if (stopped) return;
        if (consecutiveErrors >= 4) {
          stopped = true;
          setMicEnabled(false);
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
        void err;
      }
    }

    void ensureMicPermission().then((ok) => {
      if (ok && !stopped) startListening();
    });

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      if (silenceTimer) clearTimeout(silenceTimer);
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      if (!isHandlingEndRef.current) {
        void safeStopRecording('effect cleanup');
      }
    };
  }, [
    status,
    micEnabled,
    language,
    selectedMicId,
    startUserAudioCapture,
    setChatInput,
    setIsRecording,
    setMicEnabled,
    mediaStreamRef,
    refreshMicDevicesRef,
    selectedMicIdRef,
    t,
  ]);

  return { stopSpeechRecognition };
}