// File: src/lib/vad/hallucinationFilter.ts

export const KNOWN_HALLUCINATIONS = [
  'egentligen',
  'subtitles by',
  'www.',
  '.com',
  'ここを留めた',
  'よろしくお願いします',
  'ありがとうございました',
  'hmm',
  'amara.org',
];

export const HALLUCINATION_ALLOWLIST = ['yes', 'no', 'ok', 'hi', 'bye', 'yeah', 'nope'];

export function containsNonLatinScript(text: string): boolean {
  return /[\u0400-\u04FF]|[\u0600-\u06FF]|[\u3000-\u9FFF]|[\uAC00-\uD7AF]|[\u0E00-\u0E7F]/.test(
    text,
  );
}

export function containsWhisperMetaTag(text: string): boolean {
  return /\[.*?\]|\(.*?\)|<.*?>|\{.*?\}|\*.*?\*/.test(text);
}

export function isHallucinatedTranscript(transcript: string): boolean {
  const t = transcript.trim();
  const lower = t.toLowerCase();

  // Guard 0: Explicit allowlist
  if (HALLUCINATION_ALLOWLIST.includes(lower)) return false;

  // Guard 1: Too short
  if (t.length < 3) return true;

  // Guard 2: Garbled unicode
  if (/[\u{FFFD}\u{25A1}\u{25C6}\u{2022}]/u.test(t)) return true;

  // Guard 3: Word confidence check
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const avgWordLen = words.reduce((s, w) => s + w.length, 0) / words.length;
  if (avgWordLen > 15) return true;

  // Guard 4: Repetition detection
  if (words.length >= 4) {
    const unique = new Set(words.map((w) => w.toLowerCase()));
    const repetitionRatio = unique.size / words.length;
    if (repetitionRatio < 0.4) return true;
  }

  // Guard 5: Known phrases
  if (KNOWN_HALLUCINATIONS.some((h) => lower.includes(h))) return true;

  // Guard 6: Non-Latin script
  if (containsNonLatinScript(t)) return true;

  // Guard 7: Whisper Meta-tags (Chặn [speaking Russian])
  if (containsWhisperMetaTag(t)) return true;

  return false;
}
