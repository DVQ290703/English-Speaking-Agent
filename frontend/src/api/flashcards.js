import { API_BASE_URL, ENDPOINTS } from './config';

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function request(url, options = {}) {
  const res = await fetch(`${API_BASE_URL}${url}`, options);
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `Request failed: ${res.status}`);
  return data;
}

// ── Decks ─────────────────────────────────────────────────────────────────────

export const listDecks = (token) =>
  request(ENDPOINTS.flashcards.decks, { headers: authHeaders(token) });

export const createDeck = (token, { name, description }) =>
  request(ENDPOINTS.flashcards.decks, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });

export const updateDeck = (token, deckId, { name, description }) =>
  request(ENDPOINTS.flashcards.deck(deckId), {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });

export const deleteDeck = (token, deckId) =>
  request(ENDPOINTS.flashcards.deck(deckId), {
    method: 'DELETE',
    headers: authHeaders(token),
  });

export const getDeckStats = (token, deckId) =>
  request(ENDPOINTS.flashcards.deckStats(deckId), { headers: authHeaders(token) });

// ── Cards ─────────────────────────────────────────────────────────────────────

export const listCards = (token, deckId) =>
  request(ENDPOINTS.flashcards.cards(deckId), { headers: authHeaders(token) });

export const createCard = (token, deckId, { front_text, back_text, tags }) =>
  request(ENDPOINTS.flashcards.cards(deckId), {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ front_text, back_text, tags: tags || [] }),
  });

// mediaFiles: [{ file: File, side: 'front'|'back', media_type: 'image'|'audio' }, ...]
export const createCardWithMedia = (token, deckId, { front_text, back_text, tags, mediaFiles }) => {
  const form = new FormData();
  form.append('front_text', front_text);
  form.append('back_text', back_text);
  (tags || []).forEach(t => form.append('tags', t));
  (mediaFiles || []).forEach(({ file, side, media_type }) => {
    form.append('files', file);
    form.append('sides', side);
    form.append('media_types', media_type);
  });
  // Do NOT set Content-Type — browser sets it with correct multipart boundary
  return request(ENDPOINTS.flashcards.cardsWithMedia(deckId), {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  });
};

export const updateCard = (token, cardId, { front_text, back_text, tags }) =>
  request(ENDPOINTS.flashcards.card(cardId), {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ front_text, back_text, tags }),
  });

export const deleteCard = (token, cardId) =>
  request(ENDPOINTS.flashcards.card(cardId), {
    method: 'DELETE',
    headers: authHeaders(token),
  });

// ── Media ─────────────────────────────────────────────────────────────────────

export const uploadCardMedia = (token, cardId, { side, media_type, file }) => {
  const form = new FormData();
  form.append('side', side);
  form.append('media_type', media_type);
  form.append('file', file);
  return request(`${ENDPOINTS.flashcards.card(cardId)}/media`, {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  });
};

export const deleteCardMedia = (token, mediaId) =>
  request(`/api/flashcards/media/${mediaId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });

// ── Reviews ───────────────────────────────────────────────────────────────────

export const getDueCards = (token, deckId) =>
  request(
    deckId
      ? `${ENDPOINTS.flashcards.due}?deck_id=${deckId}`
      : ENDPOINTS.flashcards.due,
    { headers: authHeaders(token) },
  );

export const submitReview = (token, cardId, rating) =>
  request(ENDPOINTS.flashcards.review(cardId), {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  });
