import { useCallback, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import { updateConversation } from '../api/conversations';
import { getAuthSession } from '../auth/tokenStorage';

export interface UseSessionPersistenceParams {
  hasSavedCurrentSessionRef: MutableRefObject<boolean>;
  conversationIdRef: MutableRefObject<string | null>;
}

/**
 * Provides a stable `persistSession` / `persistSessionRef` pair used by
 * VoiceAgent to mark the current session as "done" (sets the guard flag so
 * the same session isn't processed twice). It also triggers a backend call
 * to set the ended_at timestamp for duration tracking.
 */
export default function useSessionPersistence({
  hasSavedCurrentSessionRef,
  conversationIdRef,
}: UseSessionPersistenceParams) {
  const persistSession = useCallback(() => {
    // 1. Guard against double-saving the same UI session
    if (hasSavedCurrentSessionRef.current) return;
    hasSavedCurrentSessionRef.current = true;

    // 2. Notify backend to set ended_at if we have a valid conversation
    const conversationId = conversationIdRef.current;
    const session = getAuthSession();
    if (conversationId && session?.token) {
      void updateConversation(session.token, conversationId).catch(() => {
        /* silent fail for persistence background calls */
      });
    }
  }, [hasSavedCurrentSessionRef, conversationIdRef]);

  const persistSessionRef = useRef(persistSession);
  useLayoutEffect(() => {
    persistSessionRef.current = persistSession;
  }, [persistSession]);

  return { persistSession, persistSessionRef };
}
