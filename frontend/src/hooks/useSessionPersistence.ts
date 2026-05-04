import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { saveSession as saveSessionHistory } from '../api/sessionHistory';
import { TOPICS, type TopicId } from '../components/voice-agent/constants';
import type { Message } from '../components/voice-agent/MessageBubble';
import type { SessionSummary } from '../components/voice-agent/SessionSummaryModal';

export interface UseSessionPersistenceParams {
  messagesRef: MutableRefObject<Message[]>;
  sessionSummaryRef: MutableRefObject<SessionSummary | null>;
  topicRef: MutableRefObject<TopicId | null>;
  customTopicLabelRef: MutableRefObject<string | null>;
  sessionIdRef: MutableRefObject<string | null>;
  sessionStartRef: MutableRefObject<number | null>;
  hasSavedCurrentSessionRef: MutableRefObject<boolean>;
}

/**
 * Encapsulates `persistSession` plus the lifecycle handlers that flush a
 * session before the user leaves (visibilitychange + beforeunload + unmount).
 * Callers also receive a stable `persistSessionRef` they can call from
 * other event handlers without invalidating their useCallback closures.
 */
export default function useSessionPersistence({
  messagesRef,
  sessionSummaryRef,
  topicRef,
  customTopicLabelRef,
  sessionIdRef,
  sessionStartRef,
  hasSavedCurrentSessionRef,
}: UseSessionPersistenceParams) {
  const persistSession = useCallback(() => {
    if (hasSavedCurrentSessionRef.current) return;
    const currentMessages = messagesRef.current;
    if (!currentMessages.length) return;
    hasSavedCurrentSessionRef.current = true;
    const currentSummary = sessionSummaryRef.current;
    const currentTopic = topicRef.current;
    const currentCustomTopicLabel = customTopicLabelRef.current;
    const topicLabel =
      currentCustomTopicLabel ??
      TOPICS.find((tp) => tp.id === currentTopic)?.label ??
      'Daily Conversation';
    const startedAt = sessionStartRef.current ?? Date.now();
    if (!sessionIdRef.current) {
      sessionIdRef.current = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    saveSessionHistory({
      id: sessionIdRef.current,
      topic: topicLabel,
      topicKey: currentTopic,
      avgScore: currentSummary?.scores.overall ?? 0,
      sentenceCount: currentSummary?.sentenceCount ?? 0,
      corrections: currentSummary?.totalErrors ?? 0,
      durationMs: Date.now() - startedAt,
      scores: currentSummary?.scores ?? null,
      topErrors: currentSummary?.topErrors ?? [],
      messages: currentMessages,
    });
  }, [
    customTopicLabelRef,
    hasSavedCurrentSessionRef,
    messagesRef,
    sessionIdRef,
    sessionStartRef,
    sessionSummaryRef,
    topicRef,
  ]);

  const persistSessionRef = useRef(persistSession);
  useLayoutEffect(() => {
    persistSessionRef.current = persistSession;
  }, [persistSession]);

  useEffect(() => {
    const onHide = () => {
      try {
        persistSessionRef.current?.();
      } catch {
        /* ignore */
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        persistSessionRef.current?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return { persistSession, persistSessionRef };
}
