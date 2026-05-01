// frontend/src/api/conversations.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface ConversationSummary {
  id: string;
  title: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  topic_id: string | null;
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

export async function fetchConversations(
  token: string
): Promise<ConversationSummary[]> {
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

export async function clearConversation(
  token: string,
  conversationId: string
): Promise<void> {
  await apiFetch<void>(`/api/conversations/${conversationId}/clear`, token, {
    method: 'POST',
  });
}
