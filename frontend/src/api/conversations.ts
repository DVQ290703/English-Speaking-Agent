// frontend/src/api/conversations.ts
import { API_BASE_URL, ENDPOINTS } from './config';

export interface ConversationSummary {
  id: string;
  title: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  topic_id: string | null;
  topic_code: string | null; // DB topic code e.g. "ielts_part1"
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

export interface PhonemeDetailOut {
  phoneme: string;
  accuracy_score: number | null;
}

export interface WordDetailOut {
  word_index: number;
  word: string;
  accuracy_score: number | null;
  error_type: string | null;
  start_ms: number | null;
  duration_ms: number | null;
  phonemes: PhonemeDetailOut[];
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
  assistant_audio_url: string | null;
  score: MessageScoreOut | null;
}

export interface ForTopicConversation {
  id: string;
  title: string | null;
  status: string;
  session_number: number;
  started_at: string;
  updated_at: string;
}

export interface ForTopicResponse {
  topic_code: string;
  topic_title: string;
  conversations: ForTopicConversation[];
  total: number;
  limit_reached: boolean;
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
    ENDPOINTS.conversations.list,
    token,
  );
  return data.conversations;
}

export async function fetchConversationMessages(
  token: string,
  conversationId: string,
): Promise<MessageSummary[]> {
  const data = await apiFetch<{ conversation_id: string; messages: MessageSummary[] }>(
    ENDPOINTS.conversations.messages(conversationId),
    token,
  );
  return data.messages;
}

export async function fetchMessagesWithScores(
  token: string,
  conversationId: string,
): Promise<MessageWithScoreOut[]> {
  const data = await apiFetch<{ conversation_id: string; messages: MessageWithScoreOut[] }>(
    ENDPOINTS.conversations.withScores(conversationId),
    token,
  );
  return data.messages;
}

export async function clearConversation(token: string, conversationId: string): Promise<void> {
  await apiFetch<void>(ENDPOINTS.conversations.clear(conversationId), token, {
    method: 'POST',
  });
}

export async function fetchForTopic(token: string, topicCode: string): Promise<ForTopicResponse> {
  return apiFetch<ForTopicResponse>(ENDPOINTS.conversations.forTopic(topicCode), token);
}

export async function deleteConversation(token: string, conversationId: string): Promise<void> {
  await apiFetch<void>(ENDPOINTS.conversations.delete(conversationId), token, {
    method: 'DELETE',
  });
}

export interface ConversationScores {
  pronunciation: number | null;
  fluency: number | null;
  accuracy: number | null;
}

export interface ConversationStat {
  id: string;
  topic: string;
  topic_code: string | null;
  started_at: string;
  duration_ms: number | null;
  avg_score: number | null;
  user_message_count: number;
  scores: ConversationScores | null;
}

export async function fetchConversationStats(token: string): Promise<ConversationStat[]> {
  const data = await apiFetch<{ sessions: ConversationStat[] }>(
    ENDPOINTS.conversations.stats,
    token,
  );
  return data.sessions;
}
