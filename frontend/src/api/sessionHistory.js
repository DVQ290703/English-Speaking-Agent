const STORAGE_KEY = "vt_session_history_v1";
const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 200;

export function getSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getSession(id) {
  return getSessions().find((s) => s.id === id) ?? null;
}

export function deleteSession(id) {
  const next = getSessions().filter((s) => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

// Strip large/transient fields from a message so it survives in localStorage.
function trimMessage(m) {
  if (!m || typeof m !== "object") return m;
  const { audioUrl, audioBlob, _audioBuffer, _localUrl, ...rest } = m;
  return rest;
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
// Returns the list actually persisted, or null if everything failed.
function writeSessions(next) {
  const stages = [
    (arr) => arr,
    (arr) =>
      arr.map((s) => ({
        ...s,
        messages: Array.isArray(s.messages)
          ? s.messages.map(trimMessage)
          : s.messages,
      })),
    (arr) => arr.slice(0, Math.max(1, Math.ceil(arr.length / 2))),
    (arr) => arr.slice(0, Math.max(1, Math.ceil(arr.length / 4))),
    (arr) => (arr.length > 0 ? [{ ...arr[0], messages: [] }] : arr),
  ];

  let attempt = next;
  let lastError = null;
  let lastSize = -1;
  for (let i = 0; i < stages.length; i++) {
    attempt = stages[i](attempt);
    // Skip a redundant attempt if shrinking didn't actually reduce size
    // (e.g. halving a 1-item array). Avoids wasted serialise+setItem work.
    if (i > 0 && attempt.length === lastSize) continue;
    lastSize = attempt.length;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(attempt));
      if (i > 0 && typeof console !== "undefined") {
        console.warn(
          `[sessionHistory] storage quota tight — kept ${attempt.length} session(s) after ${i} retr${i === 1 ? "y" : "ies"}.`,
        );
      }
      return attempt;
    } catch (err) {
      lastError = err;
    }
  }
  if (typeof console !== "undefined") {
    console.warn(
      "[sessionHistory] could not persist session history to localStorage:",
      lastError,
    );
  }
  return null;
}

export function saveSession(session) {
  const all = getSessions();
  const id =
    session.id ?? `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const messages = Array.isArray(session.messages) ? session.messages : [];
  // Cap transcript length to keep individual sessions reasonable.
  const cappedMessages =
    messages.length > MAX_MESSAGES_PER_SESSION
      ? messages.slice(-MAX_MESSAGES_PER_SESSION)
      : messages;
  const entry = {
    id,
    date: session.date ?? new Date().toISOString(),
    topic: session.topic ?? "Daily Conversation",
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
  writeSessions(next);
  return entry;
}

export function clearSessions() {
  try {
    localStorage.removeItem(STORAGE_KEY);
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
  } catch {
    // If even the trimmed list won't fit, fall back through writeSessions.
    writeSessions(next);
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
    const raw = localStorage.getItem(STORAGE_KEY) ?? "";
    // UTF-16 string in memory but stored ~UTF-8 by the browser; approximate
    // size by char length which is close enough for an indicator.
    bytes = raw.length;
    const parsed = raw ? JSON.parse(raw) : [];
    sessionCount = Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    // ignore
  }
  const percent = Math.min(
    100,
    Math.round((bytes / APPROX_LOCALSTORAGE_QUOTA) * 100),
  );
  return { bytes, percent, sessionCount, max: MAX_SESSIONS };
}

export function formatBytes(bytes) {
  if (!bytes) return "0 KB";
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
