import { useCallback, type MutableRefObject } from 'react';
import { assessPronunciation, chatRespond } from '../api/chat';
import { getAuthSession } from '../auth/tokenStorage';
import {
  LANGUAGE_CODES,
  TOPICS,
  type FeedbackItem,
  type Gender,
  type Language,
  type TopicId,
} from '../components/voice-agent/constants';
import type { Message, Mistake } from '../components/voice-agent/MessageBubble';

export interface UseSendChatMessageParams {
  messages: Message[];
  topic: TopicId | null;
  subOption: string | null;
  gender: Gender;
  language: Language;
  agentTyping: boolean;
  conversationIdRef: MutableRefObject<string | null>;
  msgCounterRef: MutableRefObject<number>;
  feedbackCounterRef: MutableRefObject<number>;
  timersRef: MutableRefObject<ReturnType<typeof setTimeout>[]>;
  localAudioUrlsRef: MutableRefObject<string[]>;
  audioBlobsRef: MutableRefObject<Record<number, Blob>>;
  inputRef: MutableRefObject<HTMLTextAreaElement | null>;
  trimLocalAudioUrls: () => void;
  playAgentAudio: (text: string, audioUrl?: string) => string | undefined;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setFeedbacks: React.Dispatch<React.SetStateAction<FeedbackItem[]>>;
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
 * All inputs come in as refs/setters so the caller (VoiceAgent) keeps the
 * canonical state and the hook stays pure with respect to React lifecycle.
 */
export default function useSendChatMessage({
  messages,
  topic,
  subOption,
  gender,
  language,
  agentTyping,
  conversationIdRef,
  msgCounterRef,
  feedbackCounterRef,
  timersRef: _timersRef,
  localAudioUrlsRef,
  audioBlobsRef,
  inputRef,
  trimLocalAudioUrls,
  playAgentAudio,
  setMessages,
  setFeedbacks,
  setExpandedMsgId,
  setChatInput,
  setAgentTyping,
  setAgentSpeaking,
  setMicEnabled,
}: UseSendChatMessageParams) {
  return useCallback(
    async (text: string, audioBlob?: Blob) => {
      const trimmed = text.trim();
      if (!trimmed || agentTyping) return;

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
        ...messages
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
        if (session?.token) {
          const data = await chatRespond({
            token: session.token,
            text: trimmed,
            audioBlob,
            history: historyPayload,
            topic:
              TOPICS.find((item) => item.id === (topic as TopicId | undefined))?.label ??
              topic ??
              undefined,
            subOption: subOption ?? undefined,
            voiceGender: gender,
            conversationId: conversationIdRef.current ?? undefined,
          });
          if (data.conversation_id) {
            conversationIdRef.current = data.conversation_id;
          }
          userMessageId = data.user_message_id ?? null;

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
        if (session?.token && audioBlob) {
          try {
            const assessment = await assessPronunciation({
              token: session.token,
              audioBlob,
              referenceText: trimmed,
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
                      mistakes,
                      score: overall,
                      assessmentStatus: 'available',
                    }
                  : message,
              ),
            );

            const newFb: FeedbackItem = {
              id: feedbackCounterRef.current++,
              type: 'pronunciation',
              original: trimmed,
              corrected: '',
              explanation: `Overall ${overall} — pronunciation ${pron}${
                scoreDetails.completeness != null
                  ? ` — completeness ${scoreDetails.completeness}`
                  : ''
              }`,
              timestamp: new Date(),
            };
            setFeedbacks((prev) => [newFb, ...prev]);
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
      agentTyping,
      messages,
      playAgentAudio,
      topic,
      subOption,
      gender,
      language,
      trimLocalAudioUrls,
      conversationIdRef,
      localAudioUrlsRef,
      audioBlobsRef,
      msgCounterRef,
      feedbackCounterRef,
      inputRef,
      setMessages,
      setFeedbacks,
      setExpandedMsgId,
      setChatInput,
      setAgentTyping,
      setAgentSpeaking,
      setMicEnabled,
    ],
  );
}
