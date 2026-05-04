import { useCallback, useLayoutEffect, useRef, type MutableRefObject } from 'react';

export interface UseSessionPersistenceParams {
  hasSavedCurrentSessionRef: MutableRefObject<boolean>;
}

/**
 * Provides a stable `persistSession` / `persistSessionRef` pair used by
 * VoiceAgent to mark the current session as "done" (sets the guard flag so
 * the same session isn't processed twice).  The previous localStorage write
 * has been removed — dashboard stats now come directly from the API.
 */
export default function useSessionPersistence({
  hasSavedCurrentSessionRef,
}: UseSessionPersistenceParams) {
  const persistSession = useCallback(() => {
    hasSavedCurrentSessionRef.current = true;
  }, [hasSavedCurrentSessionRef]);

  const persistSessionRef = useRef(persistSession);
  useLayoutEffect(() => {
    persistSessionRef.current = persistSession;
  }, [persistSession]);

  return { persistSession, persistSessionRef };
}
