export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export const ENDPOINTS = {
  auth: {
    login: '/api/auth/login',
    register: '/api/auth/register',
    me: '/api/auth/me',
  },
  oauth: {
    login: (provider: string) => `/api/auth/oauth/login/${provider}`,
  },
  chat: {
    respond: '/api/chat/respond',
    assess: '/api/assess',
    transcribe: '/api/chat/transcribe',
  },
  conversations: {
    list: '/api/conversations',
    messages: (id: string) => `/api/conversations/${id}/messages`,
    withScores: (id: string) => `/api/conversations/${id}/messages-with-scores`,
    clear: (id: string) => `/api/conversations/${id}/clear`,
    forTopic: (code: string) =>
      `/api/conversations/for-topic?topic_code=${encodeURIComponent(code)}`,
    delete: (conversationId: string) => `/api/conversations/${conversationId}`,
    update: (conversationId: string) => `/api/conversations/${conversationId}`,
    stats: '/api/conversations/stats',
  },
  topics: {
    categories: '/api/topics/get_categories_topics',
  },
  grammar: {
    detailFeedback: (messageId: string) =>
      `/api/grammar/detail_grammar_fb/${encodeURIComponent(messageId)}`,
  },
  flashcards: {
    decks: '/api/flashcards/decks',
    deck: (id: string) => `/api/flashcards/decks/${id}`,
    deckStats: (id: string) => `/api/flashcards/decks/${id}/stats`,
    cards: (deckId: string) => `/api/flashcards/decks/${deckId}/cards`,
    cardsWithMedia: (deckId: string) => `/api/flashcards/decks/${deckId}/cards/with-media`,
    card: (id: string) => `/api/flashcards/cards/${id}`,
    due: '/api/flashcards/reviews/due',
    review: (cardId: string) => `/api/flashcards/reviews/${cardId}`,
  },
} as const;
