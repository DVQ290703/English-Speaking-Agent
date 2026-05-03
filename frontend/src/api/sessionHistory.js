const STORAGE_KEY = 'vt_session_history_v1';
const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 200;

// ---------------------------------------------------------------------------
// Read cache
// ---------------------------------------------------------------------------
// getSessions() is called from saveSession, deleteSession, getSession,
// pruneOldestSessions, and getStorageUsage on every user interaction. Each
// call previously re-read + JSON.parsed the full history, which for 50
// sessions × 200 messages each can visibly block the main thread.
//
// The cache is keyed on the raw localStorage string. Because JS is
// single-threaded and localStorage is synchronous, the raw string can only
// change when our own code calls localStorage.setItem / removeItem, so we
// simply call invalidateSessionsCache() after every write.
let _cachedRaw = /** @type {string|null} */ (null); // null = cache miss
let _cachedSessions = /** @type {any[]|null} */ (null);

function invalidateSessionsCache() {
  _cachedRaw = null;
  _cachedSessions = null;
}

export function getSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      invalidateSessionsCache();
      return [];
    }
    // Cache hit: same raw string means the data hasn't changed.
    if (raw === _cachedRaw && _cachedSessions !== null) {
      return _cachedSessions;
    }
    const parsed = JSON.parse(raw);
    _cachedSessions = Array.isArray(parsed) ? parsed : [];
    _cachedRaw = raw;
    return _cachedSessions;
  } catch {
    return [];
  }
}

export function getSession(id) {
  return getSessions().find((s) => s.id === id) ?? null;
}

// Look up the most recent session whose topicKey matches `topicKey`.
// Sessions are stored newest-first, so the first match wins. Returns
// `null` when nothing matches — used by the dashboard to resume a
// topic from where the user left off.
export function getLatestSessionByTopic(topicKey) {
  if (!topicKey) return null;
  const all = getSessions();
  for (const s of all) {
    if (s && s.topicKey === topicKey) return s;
  }
  return null;
}

export function deleteSession(id) {
  const next = getSessions().filter((s) => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    invalidateSessionsCache();
  } catch {
    // ignore
  }
}

// Strip large/transient fields from a message so it survives in localStorage.
function trimMessage(m) {
  if (!m || typeof m !== 'object') return m;
  // userAudioUrl (blob: URLs) and audioBlob are transient and shouldn't
  // be persisted across page loads — object URLs are only valid per-document.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { audioUrl, audioBlob, _audioBuffer, _localUrl, userAudioUrl, ...rest } = m;
  return rest;
}

// Yield to the browser between heavy stringify+setItem passes so the UI
// thread can repaint between retries on lower-end devices.
function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Serialise concurrent writes so two rapid saveSession calls (e.g. one from
// `beforeunload` and one from `visibilitychange` firing back-to-back) can't
// interleave their async retries and let stale data clobber fresh data.
//
// We only ever care about the *latest* queued payload — any intermediate
// queued writes would be immediately overwritten by the next one, so we
// drop them and only commit the most recent state.
let writeChain = Promise.resolve();
let pendingPayload = null;
let pendingResolvers = [];

function scheduleWrite(next) {
  pendingPayload = next;
  return new Promise((resolve) => {
    pendingResolvers.push(resolve);
    writeChain = writeChain.then(async () => {
      // Snapshot whatever is queued *now* — earlier callers will all be
      // resolved with this same result since later writes supersede them.
      if (pendingPayload === null) {
        const resolvers = pendingResolvers;
        pendingResolvers = [];
        resolvers.forEach((r) => r(null));
        return;
      }
      const toWrite = pendingPayload;
      const resolvers = pendingResolvers;
      pendingPayload = null;
      pendingResolvers = [];
      try {
        const result = await writeSessions(toWrite);
        resolvers.forEach((r) => r(result));
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.warn('[sessionHistory] write chain rejected:', err);
        }
        resolvers.forEach((r) => r(null));
      }
    });
  });
}

// Try to write `next` to localStorage. If we hit a quota error, shed data
// using a binary-shrink strategy so the worst case is only a handful of
// stringify+setItem passes (each one on a smaller payload than the last) —
// avoiding the UI jank of repeatedly serialising large arrays.
//
// Strategy (max 5 attempts, each on progressively smaller data):
//   0. Original payload as given.
//   1. Strip audio blobs from message transcripts.
//   2. Keep only the newest half of sessions.
//   3. Keep only the newest quarter of sessions.
//   4. Keep only the newest single session with no transcript.
//
// On the happy path (no quota error) this is a single synchronous write,
// completing before the function even awaits. On the quota path, each
// retry awaits a 0ms timer so the browser can repaint between large
// serialisations. Returns the list actually persisted, or null if every
// fallback failed.
async function writeSessions(next) {
  const stages = [
    (arr) => arr,
    (arr) =>
      arr.map((s) => ({
        ...s,
        messages: Array.isArray(s.messages) ? s.messages.map(trimMessage) : s.messages,
      })),
    (arr) => arr.slice(0, Math.max(1, Math.ceil(arr.length / 2))),
    (arr) => arr.slice(0, Math.max(1, Math.ceil(arr.length / 4))),
    (arr) => (arr.length > 0 ? [{ ...arr[0], messages: [] }] : arr),
  ];

  let attempt = next;
  let lastError = null;
  let lastSize = -1;
  for (let i = 0; i < stages.length; i++) {
    // Yield before every retry (but not before the first attempt) so the
    // browser can paint between potentially-expensive serialisations.
    if (i > 0) await yieldToBrowser();
    attempt = stages[i](attempt);
    // Skip a redundant attempt if shrinking didn't actually reduce size
    // (e.g. halving a 1-item array). Avoids wasted serialise+setItem work.
    if (i > 0 && attempt.length === lastSize) continue;
    lastSize = attempt.length;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(attempt));
      invalidateSessionsCache();
      if (i > 0 && typeof console !== 'undefined') {
        console.warn(
          `[sessionHistory] storage quota tight — kept ${attempt.length} session(s) after ${i} retr${i === 1 ? 'y' : 'ies'}.`,
        );
      }
      return attempt;
    } catch (err) {
      lastError = err;
    }
  }
  if (typeof console !== 'undefined') {
    console.warn('[sessionHistory] could not persist session history to localStorage:', lastError);
  }
  return null;
}

export function saveSession(session) {
  const all = getSessions();
  const id = session.id ?? `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const messages = Array.isArray(session.messages) ? session.messages : [];
  // Cap transcript length to keep individual sessions reasonable.
  const cappedMessages =
    messages.length > MAX_MESSAGES_PER_SESSION
      ? messages.slice(-MAX_MESSAGES_PER_SESSION)
      : messages;
  const entry = {
    id,
    date: session.date ?? new Date().toISOString(),
    topic: session.topic ?? 'Daily Conversation',
    avgScore: session.avgScore ?? 0,
    sentenceCount: session.sentenceCount ?? 0,
    corrections: session.corrections ?? 0,
    durationMs: session.durationMs ?? 0,
    scores: session.scores ?? null,
    topErrors: session.topErrors ?? [],
    messages: cappedMessages,
    topicKey: session.topicKey ?? null,
  };
  const filtered = all.filter((s) => s.id !== id);
  const next = [entry, ...filtered].slice(0, MAX_SESSIONS);

  // Fast path: attempt a fully synchronous write, which is critical for
  // `beforeunload` / `visibilitychange(hidden)` callers — the browser will
  // not wait for any promise to settle after those events fire.
  //
  // We intentionally limit the sync path to TWO attempts instead of the
  // five used by the async `writeSessions` path. Each attempt calls
  // JSON.stringify on potentially large data; browsers grant only ~50 ms
  // to beforeunload handlers, and running five expensive serialisations on
  // a history of 50 × 200 messages can exceed that budget and silently drop
  // the write entirely. Two attempts — full data, then the smallest possible
  // emergency payload — gives the best chance of saving something useful
  // within the time budget.
  //
  // 1st attempt: full payload (>99 % of calls succeed here).
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    invalidateSessionsCache();
    return entry;
  } catch {
    // Quota exceeded — fall through to the emergency minimal save.
  }

  // 2nd attempt: keep only the newest session, no transcript at all.
  // This is always tiny (<1 KB) so the write is fast and quota-safe.
  const emergency = next.length > 0 ? [{ ...next[0], messages: [] }] : next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emergency));
    invalidateSessionsCache();
    if (typeof console !== 'undefined') {
      console.warn(
        '[sessionHistory] storage quota tight — saved only latest session without transcript.',
      );
    }
    return entry;
  } catch {
    // Storage is completely full — fall back to the async write queue
    // which can yield between intermediate-shrink retries. This write
    // may not complete if the tab closes immediately afterwards, but
    // both synchronous attempts already failed, so there is nothing
    // more we can do synchronously.
    if (typeof console !== 'undefined') {
      console.warn(
        '[sessionHistory] sync write failed entirely — falling back to async write queue.',
      );
    }
    void scheduleWrite(next);
    return entry;
  }
}

export function clearSessions() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    invalidateSessionsCache();
  } catch {
    // ignore
  }
}

// Drop the oldest half of stored sessions to free up space. Returns the
// number of sessions removed.
export function pruneOldestSessions(keepRatio = 0.5) {
  const all = getSessions();
  if (all.length <= 1) return 0;
  const keep = Math.max(1, Math.ceil(all.length * keepRatio));
  if (keep >= all.length) return 0;
  const removed = all.length - keep;
  const next = all.slice(0, keep);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    invalidateSessionsCache();
  } catch {
    // If even the trimmed list won't fit, fall back through the write
    // queue so it can shrink/retry without racing other writers.
    void scheduleWrite(next);
  }
  return removed;
}

// Browsers usually give ~5MB total to localStorage per origin. We use this
// as a soft ceiling for the usage indicator — actual quotas vary by browser.
const APPROX_LOCALSTORAGE_QUOTA = 5 * 1024 * 1024;

// Estimate how much of the localStorage quota our session history is using.
// This is intentionally conservative — we measure only our own key, not the
// entire origin, since other apps could also be storing data.
export function getStorageUsage() {
  let bytes = 0;
  let sessionCount = 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? '';
    bytes = raw.length;
    sessionCount = getSessions().length;
  } catch {
    // ignore
  }
  const percent = Math.min(100, Math.round((bytes / APPROX_LOCALSTORAGE_QUOTA) * 100));
  return { bytes, percent, sessionCount, max: MAX_SESSIONS };
}

export function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDuration(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min} min`;
}
