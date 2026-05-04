// frontend/src/lib/audioCache.ts
// Cache API helpers for audio blobs.
const CACHE_NAME = 'vin-audio-v1';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export function audioProxyUrl(storageKey: string): string {
  return `${API_BASE_URL}/api/audio/${storageKey}`;
}

export async function getAudioUrl(
  storageKey: string,
  authToken: string
): Promise<string> {
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = `/audio-cache/${storageKey}`;

  const cached = await cache.match(cacheKey);
  if (cached) {
    const blob = await cached.blob();
    return URL.createObjectURL(blob);
  }

  const resp = await fetch(audioProxyUrl(storageKey), {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  if (!resp.ok) {
    throw new Error(`Audio fetch failed: ${resp.status}`);
  }

  await cache.put(cacheKey, resp.clone());
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

export async function evictConversationAudio(conversationId: string): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  await Promise.all(
    keys
      .filter(req => req.url.includes(conversationId))
      .map(req => cache.delete(req))
  );
}

export async function audioCacheCount(): Promise<number> {
  const cache = await caches.open(CACHE_NAME);
  return (await cache.keys()).length;
}
