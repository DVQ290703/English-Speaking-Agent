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

// Try to write `next` to localStorage. If we hit a quota error, progressively
// shed data (audio refs first, then oldest sessions) and retry. Returns the
// list that was actually persisted, or null if every fallback failed.
function writeSessions(next) {
  let attempt = next;
  let lastError = null;
  for (let i = 0; i < 6; i++) {
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
      if (i === 0) {
        // First fallback: strip audio blobs from message transcripts.
        attempt = attempt.map((s) => ({
          ...s,
          messages: Array.isArray(s.messages)
            ? s.messages.map(trimMessage)
            : s.messages,
        }));
      } else if (attempt.length > 1) {
        // Drop the oldest session and retry.
        attempt = attempt.slice(0, attempt.length - 1);
      } else if (
        attempt.length === 1 &&
        Array.isArray(attempt[0].messages) &&
        attempt[0].messages.length > 0
      ) {
        // Last resort: drop the transcript on the only remaining session.
        attempt = [{ ...attempt[0], messages: [] }];
      } else {
        break;
      }
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

export function formatDuration(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min} min`;
}
