import { API_BASE_URL, ENDPOINTS } from './config';

export type ApiTopic = {
  code: string;
  title: string;
  description: string | null;
  difficulty_level: string | null;
  sort_order: number;
};

export type ApiCategory = {
  code: string;
  title: string;
  sort_order: number;
  topics: ApiTopic[];
};

export async function fetchTopicCategories(token?: string): Promise<ApiCategory[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.topics.categories}`, { headers });
  if (!res.ok) throw new Error(`Topics API error ${res.status}`);
  return (await res.json()) as ApiCategory[];
}
