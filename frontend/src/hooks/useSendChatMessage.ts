import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { assessPronunciation, chatRespond } from '../api/chat';
import { getAuthSession } from '../auth/tokenStorage';
import { LANGUAGE_CODES, type Accent, type Gender, type Language } from '../components/voice-agent/constants';
import type { Message, Mistake } from '../components/voice-agent/MessageBubble';

export interface UseSendChatMessageParams {
  messages: Message[];
  topic: string | null;
  category: string | null;
  subOption: string | null;
  gender: Gender;
  accent: Accent;
  language: Language;
  agentTyping: boolean;
  conversationIdRef: MutableRefObject<string | null>;
  msgCounterRef: MutableRefObject<number>;
  timersRef: MutableRefObject<ReturnType<typeof setTimeout>[]>;
  localAudioUrlsRef: MutableRefObject<string[]>;
  audioBlobsRef: MutableRefObject<Record<number, Blob>>;
  inputRef: MutableRefObject<HTMLTextAreaElement | null>;
  trimLocalAudioUrls: () => void;
  playAgentAudio: (text: string, audioUrl?: string) => string | undefined;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setGrammarErrors: React.Dispatch<React.SetStateAction<Mistake[]>>;
  setGrammarCorrectedSentence: React.Dispatch<React.SetStateAction<string>>;
  setIsGrammarLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setExpandedMsgId: (next: number | null) => void;
  setChatInput: (next: string) => void;
  setAgentTyping: (next: boolean) => void;
  setAgentSpeaking: (next: boolean) => void;
  setMicEnabled: (next: boolean) => void;
}

/**
 * Encapsulates the optimistic message lifecycle:
 *   1. Push a user bubble + a "typing" agent bubble
 *   2. Call `chatRespond` (or fall back to a canned reply when offline)
 *   3. Play the returned audio
 *   4. Run pronunciation assessment in the background
 *   5. Map Azure assessment words into per-message `mistakes` + `scoreDetails`
 *
 * Also exposes `sendGreeting` — a fire-and-forget call that makes the AI open
 * the conversation with a topic-appropriate greeting (no user bubble shown).
 *
 * All inputs come in as refs/setters so the caller (VoiceAgent) keeps the
 * canonical state and the hook stays pure with respect to React lifecycle.
 */
export default function useSendChatMessage({
  messages,
  topic,
  category,
  subOption,
  gender,
  accent,
  language,
  agentTyping,
  conversationIdRef,
  msgCounterRef,
  timersRef: _timersRef,
  localAudioUrlsRef,
  audioBlobsRef,
  inputRef,
  trimLocalAudioUrls,
  playAgentAudio,
  setMessages,
  setGrammarErrors,
  setGrammarCorrectedSentence,
  setIsGrammarLoading,
  setExpandedMsgId,
  setChatInput,
  setAgentTyping,
  setAgentSpeaking,
  setMicEnabled,
}: UseSendChatMessageParams) {
  // Refs to avoid stale closures inside sendChatMessage.
  // agentTyping and messages change frequently; reading them via ref ensures
  // the callback always sees the latest value without needing to be recreated.
  const agentTypingRef = useRef(agentTyping);
  const messagesRef = useRef(messages);
  useEffect(() => {
    agentTypingRef.current = agentTyping;
  }, [agentTyping]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // topic is already the DB code (e.g. "academic", "daily_conversation")
  const sendChatMessage = useCallback(
    async (text: string, audioBlob?: Blob) => {
      const trimmed = text.trim();
      const hasText = !!trimmed;
      const hasAudio = !!audioBlob && audioBlob.size > 0;
      console.log('[SendMessage] called', {
        hasText,
        hasBlob: hasAudio,
        blobSize: audioBlob?.size,
      });
      if (!hasText && !hasAudio) {
        // Edge: window.SpeechRecognition fires onend without onresult for some utterances.
        // Delegate transcription to backend Groq Whisper STT via audio_file upload.
        console.warn('[SendMessage] nothing to send — no text and no blob');
        return;
      }
      // Use ref so we always read the latest value, not the stale closure value.
      // Without this, rapid double-sends (e.g. Edge onend+onresult race) can
      // both pass the check because React hasn't re-rendered yet.
      if (agentTypingRef.current) {
        console.log('[SendMessage] SKIPPED send — reason:', 'agentTyping in progress');
        return;
      }

      const session = getAuthSession();
      const userId = msgCounterRef.current++;
      const typingId = msgCounterRef.current++;
      const userMsg: Message = {
        id: userId,
        role: 'user',
        text: trimmed,
        timestamp: new Date(),
        userAudioUrl: audioBlob ? URL.createObjectURL(audioBlob) : undefined,
        audioBlob: audioBlob ?? undefined,
        assessmentStatus: audioBlob && session?.token ? 'pending' : 'unavailable',
      };

      if (userMsg.userAudioUrl) {
        localAudioUrlsRef.current.push(userMsg.userAudioUrl);
        trimLocalAudioUrls();
      }
      // Keep a memory-only reference to the original Blob so replay works
      // even if something else later clears the `audioBlob` property.
      if (audioBlob) audioBlobsRef.current[userId] = audioBlob;

      const historyPayload: { role: string; text: string }[] = [
        ...messagesRef.current
          .filter((message) => !message.typing)
          .map((message) => ({
            role: message.role === 'agent' ? 'assistant' : 'user',
            text: message.text,
          })),
        { role: 'user', text: trimmed },
      ];

      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: typingId,
          role: 'agent',
          text: '',
          timestamp: new Date(),
          typing: true,
        },
      ]);
      setChatInput('');
      inputRef.current?.focus();
      setAgentTyping(true);

      try {
        let userMessageId: string | null = null;
        let backendTranscript = '';
        if (session?.token) {
          console.log('[SendMessage] sending to API', { hasBlob: hasAudio });
          const data = await chatRespond({
            token: session.token,
            text: trimmed,
            audioBlob,
            history: historyPayload,
            topic: topic ?? undefined,
            category: category ?? undefined,
            subOption: subOption ?? undefined,
            voiceGender: gender,
            voiceAccent: accent,
            conversationId: conversationIdRef.current ?? undefined,
          });
          if (data.conversation_id) {
            conversationIdRef.current = data.conversation_id;
          }
          userMessageId = data.user_message_id ?? null;

          // Grammar is returned inline in the chat response — no follow-up fetch needed
          setIsGrammarLoading(true);
          const grammarPayload = data.grammar_detail ?? null;
          if (grammarPayload) {
            const items = grammarPayload.errors ?? [];
            setGrammarCorrectedSentence(grammarPayload.corrected_sentence ?? '');
            const grammarMistakes = items.reduce<Mistake[]>((acc, item) => {
              const raw = item as Record<string, unknown>;
              const wrong = String(
                item.wrong ??
                item.original_text ??
                item.original ??
                raw.original ??
                raw.text ??
                raw.error_text ??
                raw.incorrect ??
                '',
              ).trim();
              const correct = String(
                item.correct ??
                item.corrected_text ??
                item.corrected ??
                raw.corrected ??
                raw.suggestion ??
                raw.fix ??
                '',
              ).trim();
              const note = String(
                item.note ?? item.explanation ?? raw.reason ?? raw.detail ?? raw.message ?? '',
              ).trim();
              acc.push({
                wrong: wrong || '—',
                correct: correct || '—',
                type: 'Grammar' as const,
                note: note || undefined,
              });
              return acc;
            }, []);
            setGrammarErrors(grammarMistakes);
            setMessages((prev) =>
              prev.map((message) => {
                if (message.id !== userId) return message;
                const existing = message.mistakes ?? [];
                const nonGrammar = existing.filter((m) => m.type !== 'Grammar');
                return {
                  ...message,
                  mistakes: [...nonGrammar, ...grammarMistakes],
                  grammarChecked: true,
                };
              }),
            );
          } else {
            setGrammarErrors([]);
            setGrammarCorrectedSentence('');
            setMessages((prev) =>
              prev.map((message) =>
                message.id === userId ? { ...message, grammarChecked: true } : message,
              ),
            );
          }
          setIsGrammarLoading(false);

          // Capture backend transcript (used when audio-only send — no frontend text)
          backendTranscript = String(data.user_input || '').trim();
          if (backendTranscript && !trimmed) {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === userId ? { ...message, text: backendTranscript } : message,
              ),
            );
          }

          const responseText = String(data.response_text || '').trim();

          if (!responseText) {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === typingId
                  ? {
                    ...message,
                    text: "Sorry, I couldn't get a response. Please try again.",
                    typing: false,
                  }
                  : message,
              ),
            );
          } else {
            // audio_base64 is the real-time delivery format — always use it for
            // immediate playback. assistant_audio_url is a MinIO presigned URL with
            // a Docker-internal hostname (minio:9000) that the browser cannot reach;
            // it is only useful for conversation history replay via the messages API.
            let audioUrl: string | undefined;
            if (data.audio_base64) {
              audioUrl = `data:audio/mpeg;base64,${data.audio_base64}`;
            } else if (data.assistant_audio_url) {
              audioUrl = data.assistant_audio_url;
            }

            const playedUrl = playAgentAudio(responseText, audioUrl);

            setMessages((prev) =>
              prev.map((message) =>
                message.id === userId
                  ? {
                    ...message,
                    backendMessageId: userMessageId ?? message.backendMessageId,
                    // Keep the local blob URL (created before the API call).
                    // MinIO presigned URLs use the internal Docker hostname and
                    // are unreachable from the browser.
                    userAudioUrl: message.userAudioUrl || data.user_audio_url || undefined,
                  }
                  : message.id === typingId
                    ? {
                      ...message,
                      text: responseText,
                      typing: false,
                      audioUrl: playedUrl,
                      minioUrl: data.assistant_audio_url || undefined,
                      toolSteps: data.tool_steps ?? [],
                    }
                    : message,
              ),
            );
          }
        } else {
          const errorReply = "Sorry, I couldn't get a response. Please try again.";
          setMessages((prev) =>
            prev.map((message) =>
              message.id === typingId ? { ...message, text: errorReply, typing: false } : message,
            ),
          );
        }

        // If we have an audio blob and a logged-in session, call the backend
        // pronunciation assessment API and map the Azure response into the
        // message `scoreDetails` and `mistakes` shown in the AI Feedback panel.
        const referenceText = trimmed || backendTranscript;
        if (session?.token && audioBlob && referenceText) {
          try {
            const assessment = await assessPronunciation({
              token: session.token,
              audioBlob,
              referenceText,
              language: LANGUAGE_CODES[language],
              messageId: userMessageId,
            });

            const pron = Math.round(assessment.pron_score ?? 0);
            const accuracy = Math.round(assessment.accuracy_score ?? 0);
            const fluency = Math.round(assessment.fluency_score ?? 0);
            const completenessRaw = assessment.completeness_score;
            const completeness = completenessRaw != null ? Math.round(completenessRaw) : null;

            // Fixed-weight overall when completeness is available:
            // Pronunciation 35%, Accuracy 35%, Fluency 20%, Completeness 10%.
            // Otherwise fall back to (Accuracy 40%, Pronunciation 40%, Fluency 20%).
            let overall: number;
            if (completeness != null) {
              overall = Math.round(
                accuracy * 0.35 + pron * 0.35 + fluency * 0.2 + completeness * 0.1,
              );
            } else {
              overall = Math.round(accuracy * 0.4 + pron * 0.4 + fluency * 0.2) || pron;
            }

            const scoreDetails = {
              overall,
              pronunciation: pron,
              fluency,
              accuracy,
              completeness: completeness ?? undefined,
            };

            const words = assessment.words ?? [];
            const mistakes: Mistake[] = words.flatMap((w) => {
              const err = w.error_type;
              const acc = Math.round((w.accuracy_score ?? 0) as number);

              const phonemes = (w.phonemes || []).map((p) => ({
                phoneme: p.phoneme,
                accuracy_score: Math.round(p.accuracy_score ?? 0),
              }));
              const lowPhonemes = phonemes.filter((p) => p.accuracy_score < 80);
              const phonemeNote =
                lowPhonemes.length > 0
                  ? ` Phonemes: ${lowPhonemes
                    .map((p) => `${p.phoneme} ${p.accuracy_score}%`)
                    .join(', ')}`
                  : '';

              if (err && err !== 'None') {
                const type = err === 'Mispronunciation' ? 'Pronunciation' : 'Fluency';
                return [
                  {
                    wrong: w.word || '—',
                    correct: w.word || '—',
                    type,
                    note: `Accuracy ${acc}%` + phonemeNote,
                    phonemes: lowPhonemes.length > 0 ? lowPhonemes : undefined,
                  },
                ];
              }

              if (acc < 90 || lowPhonemes.length > 0) {
                return [
                  {
                    wrong: w.word || '—',
                    correct: w.word || '—',
                    type: 'Pronunciation',
                    note: `Accuracy ${acc}%` + phonemeNote,
                    phonemes: lowPhonemes.length > 0 ? lowPhonemes : undefined,
                  },
                ];
              }
              return [] as Mistake[];
            });

            setMessages((prev) =>
              prev.map((message) =>
                message.id === userId
                  ? {
                    ...message,
                    scoreDetails,
                    mistakes: [
                      ...mistakes,
                      ...((message.mistakes ?? []).filter((m) => m.type === 'Grammar') ?? []),
                    ],
                    score: overall,
                    assessmentStatus: 'available',
                  }
                  : message,
              ),
            );

            setExpandedMsgId(null);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setMessages((prev) =>
              prev.map((message) =>
                message.id === userId
                  ? { ...message, assessmentStatus: 'failed', assessmentNote: msg }
                  : message,
              ),
            );
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Chat request failed';
        setMessages((prev) =>
          prev.map((message) =>
            message.id === typingId
              ? {
                ...message,
                text: `Agent error: ${errorMessage}`,
                typing: false,
              }
              : message,
          ),
        );
        setAgentSpeaking(false);
        setMicEnabled(true);
      } finally {
        setAgentTyping(false);
      }
    },
    [
      // agentTyping and messages are intentionally excluded — they are read
      // via agentTypingRef / messagesRef to avoid stale closure bugs.
      playAgentAudio,
      topic,
      category,
      subOption,
      gender,
      accent,
      language,
      trimLocalAudioUrls,
      conversationIdRef,
      localAudioUrlsRef,
      audioBlobsRef,
      msgCounterRef,
      inputRef,
      setMessages,
      setGrammarErrors,
      setGrammarCorrectedSentence,
      setIsGrammarLoading,
      setExpandedMsgId,
      setChatInput,
      setAgentTyping,
      setAgentSpeaking,
      setMicEnabled,
    ],
  );

  return { sendChatMessage };
}