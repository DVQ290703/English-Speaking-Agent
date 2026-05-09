/**
 * TanStack Query hooks wrapping the existing flashcard API functions.
 * This replaces @workspace/api-client-react from the standalone project.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthSession } from '@/auth/tokenStorage';
import {
  listDecks,
  createDeck,
  updateDeck,
  deleteDeck,
  getDeckStats,
  listCards,
  createCard,
  createCardWithMedia,
  updateCard,
  deleteCard,
  getDueCards,
  submitReview,
  uploadCardMedia,
  deleteCardMedia,
} from '@/api/flashcards';

export interface Deck {
  id: string;
  name: string;
  description?: string;
  card_count?: number;
  due_count?: number;
}

export interface MediaFile {
  id: string;
  side: 'front' | 'back';
  media_type: 'image' | 'audio';
  public_url: string;
  mime_type?: string;
  file_name?: string;
}

export interface Card {
  id: string;
  deck_id: string;
  front_text: string;
  back_text: string;
  tags?: string[];
  media?: MediaFile[];
  deck_name?: string;
}

function useToken() {
  return getAuthSession()?.token ?? null;
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const getListDecksQueryKey = () => ['/api/flashcards/decks'];
export const getGetDeckQueryKey = (deckId: string) => ['/api/flashcards/decks', deckId];
export const getListCardsQueryKey = (deckId: string) => ['/api/flashcards/decks', deckId, 'cards'];
export const getGetDueCardsQueryKey = (deckId?: string) => ['/api/flashcards/reviews/due', deckId];

// ── Deck hooks ────────────────────────────────────────────────────────────────

export function useListDecks() {
  const token = useToken();
  return useQuery({
    queryKey: getListDecksQueryKey(),
    queryFn: () => listDecks(token!),
    enabled: !!token,
  });
}

export function useCreateDeck() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      createDeck(token!, data as { name: string; description: string }),
    onSuccess: () => qc.invalidateQueries({ queryKey: getListDecksQueryKey() }),
  });
}

export function useUpdateDeck() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deckId, ...data }: { deckId: string; name: string; description?: string }) =>
      updateDeck(token!, deckId, data as { name: string; description: string }),
    onSuccess: () => qc.invalidateQueries({ queryKey: getListDecksQueryKey() }),
  });
}

export function useDeleteDeck() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deckId: string) => deleteDeck(token!, deckId),
    onSuccess: () => qc.invalidateQueries({ queryKey: getListDecksQueryKey() }),
  });
}

export function useGetDeckStats(deckId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['/api/flashcards/decks', deckId, 'stats'],
    queryFn: () => getDeckStats(token!, deckId),
    enabled: !!token && !!deckId,
  });
}

// ── Card hooks ────────────────────────────────────────────────────────────────

export function useGetDeck(deckId: string) {
  const token = useToken();
  return useQuery({
    queryKey: getGetDeckQueryKey(deckId),
    queryFn: async () => {
      const decks = await listDecks(token!);
      return (decks as Deck[]).find((d) => d.id === deckId) ?? null;
    },
    enabled: !!token && !!deckId,
  });
}

export function useListCards(deckId: string) {
  const token = useToken();
  return useQuery({
    queryKey: getListCardsQueryKey(deckId),
    queryFn: () => listCards(token!, deckId),
    enabled: !!token && !!deckId,
  });
}

export function useCreateCard() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      deckId,
      ...data
    }: {
      deckId: string;
      front_text: string;
      back_text: string;
      tags?: string[];
      mediaFiles?: { file: File; side: string; media_type: string }[];
    }) => {
      if (data.mediaFiles?.length) {
        return createCardWithMedia(
          token!,
          deckId,
          data as unknown as {
            front_text: string;
            back_text: string;
            tags: string[];
            mediaFiles: { file: File; side: string; media_type: string }[];
          },
        );
      }
      return createCard(
        token!,
        deckId,
        data as unknown as {
          front_text: string;
          back_text: string;
          tags: string[];
        },
      );
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: getListCardsQueryKey(variables.deckId) });
      qc.invalidateQueries({ queryKey: getListDecksQueryKey() });
    },
  });
}

export function useUpdateCard() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      cardId,
      deckId: _deckId,
      ...data
    }: {
      cardId: string;
      deckId: string;
      front_text: string;
      back_text: string;
      tags?: string[];
    }) =>
      updateCard(
        token!,
        cardId,
        data as unknown as {
          front_text: string;
          back_text: string;
          tags: string[];
        },
      ),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: getListCardsQueryKey(variables.deckId) });
    },
  });
}

export function useDeleteCard() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, deckId: _deckId }: { cardId: string; deckId: string }) =>
      deleteCard(token!, cardId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: getListCardsQueryKey(variables.deckId) });
      qc.invalidateQueries({ queryKey: getListDecksQueryKey() });
    },
  });
}

// ── Review hooks ──────────────────────────────────────────────────────────────

export function useGetDueCards(deckId?: string) {
  const token = useToken();
  return useQuery({
    queryKey: getGetDueCardsQueryKey(deckId),
    queryFn: () => getDueCards(token!, deckId),
    enabled: !!token,
  });
}

export function useSubmitReview() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, rating }: { cardId: string; rating: string }) =>
      submitReview(token!, cardId, rating),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/flashcards/reviews/due'] });
      qc.invalidateQueries({ queryKey: getListDecksQueryKey() });
    },
  });
}
// ── Media hooks ──────────────────────────────────────────────────────────────

export function useUploadMedia() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      cardId,
      deckId: _deckId,
      ...data
    }: {
      cardId: string;
      deckId: string;
      side: string;
      media_type: string;
      file: File;
    }) => uploadCardMedia(token!, cardId, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: getListCardsQueryKey(variables.deckId) });
      qc.invalidateQueries({ queryKey: getGetDeckQueryKey(variables.deckId) });
    },
  });
}

export function useDeleteMedia() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, deckId: _deckId }: { mediaId: string; deckId: string }) =>
      deleteCardMedia(token!, mediaId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: getListCardsQueryKey(variables.deckId) });
      qc.invalidateQueries({ queryKey: getGetDeckQueryKey(variables.deckId) });
    },
  });
}
