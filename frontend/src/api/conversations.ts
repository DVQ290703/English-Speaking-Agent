// frontend/src/api/conversations.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface ConversationSummary {
  id: string;
  title: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  topic_id: string | null;
  topic_code: string | null;   // DB topic code e.g. "ielts_part1"
  cleared_at: string | null;
}

export interface MessageSummary {
  id: string;
  role: 'user' | 'assistant' | 'system';
  input_mode: string | null;
  text_content: string | null;
  created_at: string;
  audio_url: string | null;
}

export interface WordDetailOut {
  word_index: number;
  word: string;
  accuracy_score: number | null;
  error_type: string | null;
  start_ms: number | null;
  duration_ms: number | null;
}

export interface MessageScoreOut {
  overall_score: number | null;
  accuracy_score: number | null;
  fluency_score: number | null;
  completeness_score: number | null;
  prosody_score: number | null;
  words: WordDetailOut[];
}

export interface MessageWithScoreOut {
  id: string;
  role: string;
  input_mode: string | null;
  text_content: string | null;
  created_at: string;
  audio_url: string | null;
  score: MessageScoreOut | null;
}

async function apiFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || `Request failed: ${resp.status}`);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

export async function fetchConversations(token: string): Promise<ConversationSummary[]> {
  const data = await apiFetch<{ conversations: ConversationSummary[] }>(
    '/api/conversations',
    token
  );
  return data.conversations;
}

export async function fetchConversationMessages(
  token: string,
  conversationId: string
): Promise<MessageSummary[]> {
  const data = await apiFetch<{ conversation_id: string; messages: MessageSummary[] }>(
    `/api/conversations/${conversationId}/messages`,
    token
  );
  return data.messages;
}

export async function fetchMessagesWithScores(
  token: string,
  conversationId: string
): Promise<MessageWithScoreOut[]> {
  const data = await apiFetch<{ conversation_id: string; messages: MessageWithScoreOut[] }>(
    `/api/conversations/${conversationId}/messages-with-scores`,
    token
  );
  return data.messages;
}

export async function clearConversation(token: string, conversationId: string): Promise<void> {
  await apiFetch<void>(`/api/conversations/${conversationId}/clear`, token, {
    method: 'POST',
  });
}
