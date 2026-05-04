export type BadgeId =
  | 'firstSession'
  | 'threeDayStreak'
  | 'sevenDayStreak'
  | 'tenSessions'
  | 'band65'
  | 'band70'
  | 'hourPracticed';

export type Badge = {
  id: BadgeId;
  emoji: string;
  unlocked: boolean;
};

type SessionLite = {
  date: string;
  avgScore?: number;
  durationMs?: number;
};

export function computeStreak(sessions: SessionLite[]): number {
  if (sessions.length === 0) return 0;
  const daySet = new Set<string>();
  for (const s of sessions) {
    try {
      daySet.add(new Date(s.date).toDateString());
    } catch {
      // noop
    }
  }
  let count = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (daySet.has(d.toDateString())) {
      count++;
    } else if (count > 0) {
      break;
    }
  }
  return count;
}

export function bandFromScore(score: number): number {
  // The dashboard stores `avgScore` as a 0-100 integer. Convert to a 0-9 IELTS band.
  return Math.max(0, Math.min(9, score / 11.11));
}

export function computeBadges(sessions: SessionLite[]): Badge[] {
  const totalSessions = sessions.length;
  const totalMs = sessions.reduce((a, s) => a + (s.durationMs ?? 0), 0);
  const totalMins = totalMs / 60000;
  const streak = computeStreak(sessions);
  const maxBand = sessions.reduce((m, s) => Math.max(m, bandFromScore(s.avgScore ?? 0)), 0);

  return [
    { id: 'firstSession', emoji: '🌱', unlocked: totalSessions >= 1 },
    { id: 'threeDayStreak', emoji: '🔥', unlocked: streak >= 3 },
    { id: 'sevenDayStreak', emoji: '⚡', unlocked: streak >= 7 },
    { id: 'tenSessions', emoji: '💪', unlocked: totalSessions >= 10 },
    { id: 'hourPracticed', emoji: '⏰', unlocked: totalMins >= 60 },
    { id: 'band65', emoji: '🥈', unlocked: maxBand >= 6.5 },
    { id: 'band70', emoji: '🥇', unlocked: maxBand >= 7.0 },
  ];
}

// Compare two equal-length time slices and return the band delta.
// Returns null when not enough data to compare.
export function computePeriodDelta(
  sessions: SessionLite[],
  periodSize: number,
): { current: number; previous: number; delta: number } | null {
  if (sessions.length < periodSize * 2) return null;
  // Sessions arrive newest-first OR are sliced ascending — sort by date asc.
  const sorted = [...sessions].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const recent = sorted.slice(-periodSize);
  const prior = sorted.slice(-periodSize * 2, -periodSize);
  const avg = (arr: SessionLite[]) =>
    arr.length === 0 ? 0 : arr.reduce((s, x) => s + bandFromScore(x.avgScore ?? 0), 0) / arr.length;
  const cur = avg(recent);
  const prev = avg(prior);
  return { current: cur, previous: prev, delta: cur - prev };
}
