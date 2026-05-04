# Topics & Categories API Design

**Date:** 2026-05-04
**Branch:** TheAnh_fetch_his

## Problem

`frontend/src/constants/topics.ts` hardcodes all 10 categories and 64 topics. The DB already has these seeded in the `categories` and `topics` tables. The UI must fetch live data from the API instead.

## Decision: UI-only fields stay in the frontend

`icon` (emoji) and category `accent` (Tailwind color token) are pure UI concerns. They are not added to the DB. A slim frontend lookup file maps `code → icon` and `code → accent`. The API returns only DB fields.

---

## Backend

### New file: `app/api/topics.py`

Single route, no authentication required (topic list is not user-specific):

```
GET /api/topics/categories
```

**Query:** One JOIN across `categories` and `topics`, filtered to `is_active = true`, ordered by `categories.sort_order`, then `topics.sort_order`.

**Response (list of category objects):**
```json
[
  {
    "code": "ielts",
    "title": "IELTS Speaking",
    "sort_order": 1,
    "topics": [
      {
        "code": "ielts_part1",
        "title": "Part 1: Personal Questions",
        "description": "Answer questions about yourself, your life, and familiar topics",
        "difficulty_level": "beginner",
        "sort_order": 1
      }
    ]
  }
]
```

**Pydantic schemas** (added to `app/api/schemas.py`):
- `TopicOut` — `code`, `title`, `description`, `difficulty_level`, `sort_order`
- `CategoryWithTopicsOut` — `code`, `title`, `sort_order`, `topics: list[TopicOut]`

**Registration:** `app/api/router.py` includes the new `topics_router`.

---

## Frontend

### New file: `src/api/topics.ts`

Fetch function calling `GET /api/topics/categories`. Returns `CategoryWithTopics[]`.

### New file: `src/constants/topicMeta.ts`

UI-only lookup, keyed by `code`:

```ts
export const CATEGORY_META: Record<string, { accent: string }> = {
  ielts: { accent: 'blue' },
  business: { accent: 'violet' },
  // ... all 10 categories
}

export const TOPIC_META: Record<string, { icon: string }> = {
  ielts_part1: { icon: '🎤' },
  ielts_part2: { icon: '📋' },
  // ... all 64 topics
}
```

### Modified: `src/constants/topics.ts`

- Remove the `TOPIC_CATEGORIES` constant, `TOPICS_FLAT`, and all hardcoded data.
- Keep the `TopicEntry` and `TopicCategory` interfaces — referenced by other components.
- Replace `TopicId` (currently derived from `TOPICS_FLAT`) with `type TopicId = string` to avoid a compile error after the array is removed.

### Modified: `src/components/voice-agent/ConversationSidebar.tsx`

- Replace the `TOPIC_CATEGORIES` import with a `useQuery` call to `GET /api/topics/categories`.
- At render time, merge API data with `TOPIC_META` and `CATEGORY_META` for icon and accent.
- Show a loading skeleton or spinner while the query is in flight.

---

## Out of scope

- No DB schema changes.
- No pagination (64 topics is small enough for a single response).
- No caching layer beyond React Query's default stale-while-revalidate.
