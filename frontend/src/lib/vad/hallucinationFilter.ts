/**
 * Known Whisper hallucination phrases (English learning context).
 */
export const KNOWN_HALLUCINATIONS = [
  'thank you for watching',
  'thanks for watching',
  'please subscribe',
  'egentligen', // Swedish — wrong language hallucination
  'subtitles by',
  'www.',
  '.com',
  'ここを留めた', // Japanese hallucination on silence/breath
  'よろしくお願いします',
  'ありがとうございました',
  'hmm', // breathing sound
];

/**
 * Common short real answers that should be allowed even if they are < 3 chars.
 */
export const HALLUCINATION_ALLOWLIST = ['yes', 'no', 'ok', 'hi', 'bye', 'yeah', 'nope'];

/**
 * Detects non-Latin scripts (CJK, Arabic, Cyrillic, Thai, etc.).
 * English learning app should only receive Latin alphabet text.
 */
export function containsNonLatinScript(text: string): boolean {
  // Matches: Japanese (hiragana/katakana/kanji), Chinese, Korean,
  // Arabic, Hebrew, Cyrillic, Thai, and other non-Latin scripts
  return /[\u0400-\u04FF]|[\u0600-\u06FF]|[\u3000-\u9FFF]|[\uAC00-\uD7AF]|[\u0E00-\u0E7F]/.test(
    text,
  );
}

/**
 * Detects whether a transcript is likely a Whisper hallucination caused by
 * background noise or silence.
 */
export function isHallucinatedTranscript(transcript: string): boolean {
  const t = transcript.trim();
  const lower = t.toLowerCase();

  // Guard 0: Explicit allowlist for short real answers
  if (HALLUCINATION_ALLOWLIST.includes(lower)) return false;

  // Guard 1: Too short to be meaningful
  if (t.length < 3) return true;

  // Guard 2: Contains garbled unicode / replacement characters
  // Hallucinations often contain □, •, ◆, 🗒️ type artifacts
  if (/[\u{FFFD}\u{25A1}\u{25C6}\u{2022}]/u.test(t)) return true;

  // Guard 3: Word confidence check
  // Real speech → words separated by spaces, avg word length 2-10 chars
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const avgWordLen = words.reduce((s, w) => s + w.length, 0) / words.length;
  if (avgWordLen > 15) return true; // No real word is 15+ chars

  // Guard 4: Repetition detection (Whisper hallucinates repeated phrases)
  // e.g. "thank you thank you thank you thank you"
  if (words.length >= 4) {
    const unique = new Set(words.map((w) => w.toLowerCase()));
    const repetitionRatio = unique.size / words.length;
    if (repetitionRatio < 0.4) return true; // > 60% repeated words = hallucination
  }

  // Guard 5: Known Whisper hallucination phrases
  if (KNOWN_HALLUCINATIONS.some((h) => lower.includes(h))) return true;

  // Guard 6: Non-Latin script = wrong language hallucination
  // English-only app should not receive Japanese, Chinese, etc.
  if (containsNonLatinScript(t)) return true;

  return false;
}
