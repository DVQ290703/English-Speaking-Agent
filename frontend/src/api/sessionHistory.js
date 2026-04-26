const STORAGE_KEY = "vt_session_history_v1";
const MAX_SESSIONS = 50;

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

export function saveSession(session) {
  const all = getSessions();
  const id =
    session.id ?? `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    messages: session.messages ?? [],
    topicKey: session.topicKey ?? null,
  };
  const filtered = all.filter((s) => s.id !== id);
  const next = [entry, ...filtered].slice(0, MAX_SESSIONS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
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
