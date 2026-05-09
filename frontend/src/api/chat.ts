import { API_BASE_URL, ENDPOINTS } from './config';

export interface ChatRespondParams {
  token: string;
  text?: string;
  audioBlob?: Blob;
  history?: Array<{ role: string; text: string }>;
  topic?: string;
  category?: string;
  subOption?: string;
  voiceGender?: 'Male' | 'Female' | string;
  conversationId?: string | null;
}

export interface ChatRespondResult {
  response_text: string;
  audio_base64?: string;
  audio_mime?: string;
  user_input?: string;
  user_audio_url?: string | null;
  assistant_audio_url?: string | null;
  conversation_id?: string;
  user_message_id?: string;
}

export interface GrammarFeedbackItem {
  original_text?: string;
  corrected_text?: string;
  explanation?: string;
  original?: string;
  corrected?: string;
  wrong?: string;
  correct?: string;
  note?: string;
}

export interface GrammarFeedbackPayload {
  message_id?: string;
  user_input?: string;
  errors?: GrammarFeedbackItem[];
  corrected_sentence?: string;
  overall_score?: number;
}

export async function chatRespond({
  token,
  text,
  audioBlob,
  history = [],
  topic = '',
  category = '',
  subOption = '',
  voiceGender = '',
  conversationId = null,
}: ChatRespondParams): Promise<ChatRespondResult> {
  const formData = new FormData();

  if (text && text.trim()) {
    formData.append('text', text.trim());
  }

  if (Array.isArray(history) && history.length > 0) {
    formData.append('history', JSON.stringify(history));
  }

  if (topic && topic.trim()) {
    formData.append('topic', topic.trim());
  }

  if (category && category.trim()) {
    formData.append('category', category.trim());
  }

  if (subOption && subOption.trim()) {
    formData.append('sub_option', subOption.trim());
  }

  if (voiceGender && voiceGender.trim()) {
    formData.append('voice_gender', voiceGender.trim());
  }

  if (audioBlob) {
    formData.append('audio_file', audioBlob, audioBlob.type === 'audio/wav' ? 'recording.wav' : 'recording.webm');
  }

  if (conversationId) {
    formData.append('conversation_id', conversationId);
  }

  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.chat.respond}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error((data as { detail?: string }).detail || 'Chat request failed');
  }

  return data as ChatRespondResult;
}

// Placeholder: ready for the upcoming grammar endpoint contract.
// Keep this signature stable so callers can integrate now and swap response mapping later.
export async function fetchGrammarFeedback(
  token: string,
  messageId: string,
  signal?: AbortSignal,
): Promise<GrammarFeedbackPayload> {
  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.grammar.detailFeedback(messageId)}`, {
    method: 'GET',
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error((data as { detail?: string }).detail || 'Grammar feedback request failed');
  }

  if (Array.isArray(data)) {
    return { message_id: messageId, errors: data as GrammarFeedbackItem[] };
  }

  const payload = data as GrammarFeedbackPayload;
  return {
    message_id: payload.message_id ?? messageId,
    user_input: payload.user_input,
    errors: Array.isArray(payload.errors) ? payload.errors : [],
    corrected_sentence: payload.corrected_sentence,
    overall_score: payload.overall_score,
  };
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // 16-bit
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export async function toWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: 16000 });
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const wavBuffer = encodeWav(audioBuffer.getChannelData(0), 16000);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  } finally {
    await audioCtx.close();
  }
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
  error_type:
    | 'None'
    | 'Omission'
    | 'Insertion'
    | 'Mispronunciation'
    | 'UnexpectedBreak'
    | 'MissingBreak'
    | 'Monotone';
  syllables: SyllableResult[];
  phonemes: PhonemeResult[];
}

export interface AssessPronunciationParams {
  token: string;
  audioBlob: Blob;
  referenceText?: string | null;
  language?: string | null;
  messageId?: string | null;
}

export interface AssessPronunciationResult {
  mode: 'scripted' | 'unscripted';
  recognized_text: string;
  pron_score: number;
  accuracy_score: number;
  fluency_score: number;
  completeness_score: number | null;
  prosody_score: number | null;
  words: WordResult[];
}

export async function assessPronunciation({
  token,
  audioBlob,
  referenceText = null,
  language = null,
  messageId = null,
}: AssessPronunciationParams): Promise<AssessPronunciationResult> {
  const wavBlob = await toWav(audioBlob);
  const formData = new FormData();
  formData.append('audio_file', wavBlob, 'recording.wav');

  if (referenceText && referenceText.trim()) {
    formData.append('reference_text', referenceText.trim());
  }

  if (language && language.trim()) {
    formData.append('language', language.trim());
  }

  if (messageId && messageId.trim()) {
    formData.append('message_id', messageId.trim());
  }

  const response = await fetch(`${API_BASE_URL}${ENDPOINTS.chat.assess}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error((data as { detail?: string }).detail || 'Assessment request failed');
  }

  return data as AssessPronunciationResult;
}
