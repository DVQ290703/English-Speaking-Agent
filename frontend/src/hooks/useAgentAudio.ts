import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { toWav } from '../api/chat';
import type { Message } from '../components/voice-agent/MessageBubble';
import { LANGUAGE_CODES, type Gender, type Language } from '../components/voice-agent/constants';

const MAX_LOCAL_AUDIO_URLS = 50;

export interface UseAgentAudioParams {
  setMicEnabled: (next: boolean) => void;
  setAgentSpeaking: (next: boolean) => void;
  languageRef: MutableRefObject<Language>;
  genderRef: MutableRefObject<Gender>;
  userMicIntentRef: MutableRefObject<boolean>;
  messagesRef: MutableRefObject<Message[]>;
  timersRef: MutableRefObject<ReturnType<typeof setTimeout>[]>;
}

export interface UseAgentAudioResult {
  ttsActiveRef: MutableRefObject<boolean>;
  localAudioUrlsRef: MutableRefObject<string[]>;
  audioBlobsRef: MutableRefObject<Record<number, Blob>>;
  speakText: (text: string) => void;
  playAgentAudio: (text: string, audioUrl?: string) => string | undefined;
  playMessageAudio: (id: number) => Promise<void>;
  trimLocalAudioUrls: (max?: number) => void;
  clearLocalAudioUrls: () => void;
  stopAndCleanupAudio: (id: number) => void;
}

/**
 * Centralizes agent TTS playback, recorded user audio replay, and the
 * lifecycle of any blob: object URLs we create. Auto-mute-during-TTS is
 * driven through the `setMicEnabled` callback + `userMicIntentRef`.
 */
export default function useAgentAudio({
  setMicEnabled,
  setAgentSpeaking,
  languageRef,
  genderRef,
  userMicIntentRef,
  messagesRef,
  timersRef,
}: UseAgentAudioParams): UseAgentAudioResult {
  const ttsActiveRef = useRef(false);
  const localAudioUrlsRef = useRef<string[]>([]);
  const audioBlobsRef = useRef<Record<number, Blob>>({});
  const audioPlayersRef = useRef<
    Record<
      number,
      { audio: HTMLAudioElement; url: string; createdUrl: boolean; timeoutId?: number }
    >
  >({});
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const trimLocalAudioUrls = useCallback((max = MAX_LOCAL_AUDIO_URLS) => {
    while (localAudioUrlsRef.current.length > max) {
      const oldest = localAudioUrlsRef.current.shift();
      try {
        if (oldest) URL.revokeObjectURL(oldest);
      } catch {}
    }
  }, []);

  const clearLocalAudioUrls = useCallback(() => {
    localAudioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localAudioUrlsRef.current = [];
    audioBlobsRef.current = {};
  }, []);

  useEffect(() => {
    return () => {
      clearLocalAudioUrls();
    };
  }, [clearLocalAudioUrls]);

  const stopAndCleanupAudio = useCallback((id: number) => {
    const p = audioPlayersRef.current[id];
    if (!p) return;
    try {
      p.audio.pause();
    } catch {}
    try {
      p.audio.removeAttribute('src');
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      p.audio.load && p.audio.load();
    } catch {}
    if (p.timeoutId) {
      try {
        clearTimeout(p.timeoutId);
      } catch {}
    }
    if (p.createdUrl) {
      try {
        URL.revokeObjectURL(p.url);
      } catch {}
      const idx = localAudioUrlsRef.current.indexOf(p.url);
      if (idx !== -1) localAudioUrlsRef.current.splice(idx, 1);
    }
    delete audioPlayersRef.current[id];
  }, []);

  useEffect(() => {
    const players = audioPlayersRef.current;
    return () => {
      Object.keys(players).forEach((k) => {
        try {
          stopAndCleanupAudio(Number(k));
        } catch {}
      });
    };
  }, [stopAndCleanupAudio]);

  const speakText = useCallback(
    (text: string) => {
      if (!text) return;

      setAgentSpeaking(true);

      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        const currentLanguage = languageRef.current;
        const currentGender = genderRef.current;
        utt.lang = LANGUAGE_CODES[currentLanguage];
        utt.rate = 1;
        utt.pitch = currentGender === 'Female' ? 1.15 : 0.9;

        const applyVoiceAndSpeak = () => {
          const voices = window.speechSynthesis.getVoices();
          const langPrefix = LANGUAGE_CODES[currentLanguage].split('-')[0];
          const filtered = voices.filter((v) => v.lang.startsWith(langPrefix));
          if (filtered.length > 0) {
            const femaleKeywords = /female|woman|zira|samantha|nữ/i;
            const maleKeywords = /male|man|david|mark|nam/i;
            const preferred =
              currentGender === 'Female'
                ? (filtered.find((v) => femaleKeywords.test(v.name)) ??
                  filtered.find((v) => !maleKeywords.test(v.name)) ??
                  filtered[0])
                : (filtered.find((v) => maleKeywords.test(v.name)) ??
                  filtered.find((v) => !femaleKeywords.test(v.name)) ??
                  filtered[0]);
            utt.voice = preferred;
          }
          ttsActiveRef.current = true;
          setMicEnabled(false);
          utt.onend = () => {
            ttsActiveRef.current = false;
            setAgentSpeaking(false);
            if (userMicIntentRef.current) setMicEnabled(true);
          };
          utt.onerror = () => {
            ttsActiveRef.current = false;
            setAgentSpeaking(false);
            if (userMicIntentRef.current) setMicEnabled(true);
          };
          window.speechSynthesis.speak(utt);
        };

        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          applyVoiceAndSpeak();
        } else {
          window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.onvoiceschanged = null;
            applyVoiceAndSpeak();
          };
        }
      } else {
        const speakEnd = setTimeout(
          () => setAgentSpeaking(false),
          Math.min(text.length * 35, 4000),
        );
        timersRef.current.push(speakEnd);
      }
    },
    [genderRef, languageRef, setAgentSpeaking, setMicEnabled, timersRef, userMicIntentRef],
  );

  const playAgentAudio = useCallback(
    (text: string, audioUrl?: string) => {
      if (!audioUrl) {
        speakText(text);
        return undefined;
      }

      try {
        window.speechSynthesis?.cancel();
        const audio = new Audio(audioUrl);
        ttsActiveRef.current = true;
        setMicEnabled(false);
        setAgentSpeaking(true);
        audio.onended = () => {
          ttsActiveRef.current = false;
          setAgentSpeaking(false);
          if (userMicIntentRef.current) setMicEnabled(true);
        };
        audio.onerror = () => {
          ttsActiveRef.current = false;
          setAgentSpeaking(false);
          if (userMicIntentRef.current) setMicEnabled(true);
          speakText(text);
        };
        void audio.play().catch(() => {
          ttsActiveRef.current = false;
          setAgentSpeaking(false);
          if (userMicIntentRef.current) setMicEnabled(true);
          speakText(text);
        });
      } catch {
        speakText(text);
      }

      return audioUrl;
    },
    [setAgentSpeaking, setMicEnabled, speakText, userMicIntentRef],
  );

  const playMessageAudio = useCallback(
    async (id: number) => {
      if (!isMountedRef.current) return;
      const msg = messagesRef.current.find((m) => m.id === id);
      if (!msg) return;

      if (msg.role === 'agent') {
        const audioUrl = msg.minioUrl || msg.audioUrl;
        if (audioUrl) {
          playAgentAudio(msg.text, audioUrl);
        } else {
          speakText(msg.text);
        }
        return;
      }

      if (!msg.userAudioUrl && !msg.audioBlob && !audioBlobsRef.current[id]) return;

      try {
        let blob: Blob | undefined = msg.audioBlob ?? audioBlobsRef.current[id];

        if (!blob && msg.userAudioUrl) {
          try {
            const resp = await fetch(msg.userAudioUrl);
            if (!isMountedRef.current) return;
            if (resp.ok) blob = await resp.blob();
          } catch {
            // ignore fetch errors
          }
        }

        if (blob) {
          const audioEl = document.createElement('audio');
          const canPlay = audioEl.canPlayType(blob.type || 'audio/webm;codecs=opus');

          if (!canPlay) {
            try {
              const wavBlob = await toWav(blob);
              if (!isMountedRef.current) return;
              const wavUrl = URL.createObjectURL(wavBlob);
              localAudioUrlsRef.current.push(wavUrl);
              trimLocalAudioUrls();

              stopAndCleanupAudio(id);

              const audio = new Audio(wavUrl);
              audioPlayersRef.current[id] = { audio, url: wavUrl, createdUrl: true };
              audio.addEventListener('ended', () => stopAndCleanupAudio(id));
              audio.addEventListener('error', () => stopAndCleanupAudio(id));

              if (!isMountedRef.current) {
                stopAndCleanupAudio(id);
                return;
              }

              void audio.play().catch((err) => {
                stopAndCleanupAudio(id);
                console.warn('User audio playback failed for', wavUrl, err);
              });
            } catch (err) {
              console.warn('Failed to convert user audio to WAV', err);
              if (!isMountedRef.current) return;
              speakText(msg.text);
            }
          } else {
            let url: string;
            let createdUrl = false;
            if (msg.userAudioUrl) {
              url = msg.userAudioUrl;
            } else {
              if (!isMountedRef.current) return;
              url = URL.createObjectURL(blob);
              createdUrl = true;
              localAudioUrlsRef.current.push(url);
              trimLocalAudioUrls();
            }

            stopAndCleanupAudio(id);
            const audio = new Audio(url);
            audioPlayersRef.current[id] = { audio, url, createdUrl };
            audio.addEventListener('ended', () => stopAndCleanupAudio(id));
            audio.addEventListener('error', () => stopAndCleanupAudio(id));

            if (!isMountedRef.current) {
              stopAndCleanupAudio(id);
              return;
            }

            void audio.play().catch((err) => {
              stopAndCleanupAudio(id);
              console.warn('User audio playback failed for', url, err);
            });
          }
        } else if (msg.userAudioUrl) {
          stopAndCleanupAudio(id);
          if (!isMountedRef.current) return;
          const audio = new Audio(msg.userAudioUrl);
          audioPlayersRef.current[id] = { audio, url: msg.userAudioUrl, createdUrl: false };
          audio.addEventListener('ended', () => stopAndCleanupAudio(id));
          audio.addEventListener('error', () => stopAndCleanupAudio(id));

          if (!isMountedRef.current) {
            stopAndCleanupAudio(id);
            return;
          }

          void audio.play().catch((err) => {
            stopAndCleanupAudio(id);
            console.warn('User audio playback failed for', msg.userAudioUrl, err);
          });
        } else {
          speakText(msg.text);
        }
      } catch (err) {
        console.warn('User audio playback error', err);
      }
    },
    [messagesRef, playAgentAudio, speakText, stopAndCleanupAudio, trimLocalAudioUrls],
  );

  return {
    ttsActiveRef,
    localAudioUrlsRef,
    audioBlobsRef,
    speakText,
    playAgentAudio,
    playMessageAudio,
    trimLocalAudioUrls,
    clearLocalAudioUrls,
    stopAndCleanupAudio,
  };
}
