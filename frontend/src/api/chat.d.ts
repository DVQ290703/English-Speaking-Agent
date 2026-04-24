export interface ChatRespondParams {
  token: string;
  text?: string;
  audioBlob?: Blob;
  history?: Array<{ role: string; text: string }>;
  topic?: string;
}

export interface ChatRespondResult {
  response_text: string;
  audio_base64?: string;
  audio_mime?: string;
  user_input?: string;
  user_audio_url?: string | null;
  assistant_audio_url?: string | null;
  conversation_id?: string;
}

export function chatRespond(params: ChatRespondParams): Promise<ChatRespondResult>;

export interface AssessPronunciationParams {
  token: string;
  audioBlob: Blob;
  referenceText?: string | null;
  language?: string | null;
}

export interface PhonemeResult {
  phoneme: string;
  accuracy_score: number;
}

export interface SyllableResult {
  syllable: string;
  accuracy_score: number;
}

export interface WordResult {
  word: string;
  accuracy_score: number;
  error_type: "None" | "Omission" | "Insertion" | "Mispronunciation" | "UnexpectedBreak" | "MissingBreak" | "Monotone";
  syllables: SyllableResult[];
  phonemes: PhonemeResult[];
}

export interface AssessPronunciationResult {
  mode: "scripted" | "unscripted";
  recognized_text: string;
  pron_score: number;
  accuracy_score: number;
  fluency_score: number;
  completeness_score: number | null;
  prosody_score: number | null;
  words: WordResult[];
}

export function assessPronunciation(params: AssessPronunciationParams): Promise<AssessPronunciationResult>;
