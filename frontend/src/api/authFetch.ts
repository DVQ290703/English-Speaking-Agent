import { AUTH_EXPIRED_EVENT } from '../auth/AuthContext';

/**
 * Fires the global auth-expired event when a 401 is received.
 * Call this after every `fetch()` response check in API modules.
 */
export function handleUnauthorized(response: Response): void {
  if (response.status === 401) {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
}
