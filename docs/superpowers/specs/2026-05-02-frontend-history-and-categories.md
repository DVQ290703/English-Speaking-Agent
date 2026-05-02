# Frontend: History Sidebar, Full Category Expansion & sessionHistory Removal

**Date:** 2026-05-02
**Branch:** TheAnh_fetch_his
**Scope:** VoiceAgent left sidebar, full 10-category topic data, server-side history with scores + word details, sessionHistory.js deletion, clear-history button

---

## 1. Goals

1. Replace localStorage session history (`sessionHistory.js`) with full server-side conversation history
2. Add a ChatGPT/Claude-style **left sidebar** to VoiceAgent showing all past conversations, grouped by date
3. Clicking any sidebar conversation loads full history: messages + pronunciation scores + word-level details + audio (lazy-loaded)
4. User can continue speaking in any loaded conversation (messages append to the same `conversation_id`)
5. Add a standalone **Clear History** button in the chat header
6. Expand topic data from 4 → 10 categories × 64 sub-topics across Dashboard and VoiceAgent

---

## 2. What Is Deleted

| File | Action |
|------|--------|
| `frontend/src/api/sessionHistory.js` | **Delete entirely** |
| All `import … from '../api/sessionHistory'` usages | Remove from `VoiceAgent.tsx`, `DashboardPage.jsx` |
| `StorageUsageBar` component in `DashboardPage.jsx` | Remove (localStorage storage indicator, no longer needed) |
| `?session=<id>` URL param handling in `VoiceAgent.tsx` | Remove (replaced by sidebar selection) |
| `DASHBOARD_TO_TOPIC_ID` / `DASHBOARD_TO_SUB_OPTION` maps in `VoiceAgent.tsx` | Remove (replaced by DB topic codes) |
| `saveSession`, `getSession`, `getSessions`, `deleteSession`, `pruneOldestSessions` call sites | Remove from both pages |

---

## 3. New Backend Endpoint

### `GET /api/conversations/{id}/messages-with-scores`

Returns all messages for a conversation (respecting `cleared_at`) with pronunciation data embedded. One SQL query using LEFT JOINs.

**Response schema (new Pydantic models in `schemas.py`):**

```python
class WordDetail(BaseModel):
    word_index: int
    word: str
    accuracy_score: float | None
    error_type: str | None        # None | Omission | Insertion | Mispronunciation | …
    start_ms: int | None
    duration_ms: int | None

class MessageScoreOut(BaseModel):
    overall_score: float | None
    accuracy_score: float | None
    fluency_score: float | None
    completeness_score: float | None
    prosody_score: float | None
    words: list[WordDetail]

class MessageWithScoreOut(BaseModel):
    id: str
    role: str                     # user | assistant | system
    input_mode: str | None
    text_content: str | None
    created_at: datetime
    audio_url: str | None         # presigned URL, None for assistant TTS replay
    score: MessageScoreOut | None # None for assistant/system messages

class ConversationWithScoresResponse(BaseModel):
    conversation_id: str
    messages: list[MessageWithScoreOut]
```

**SQL (in `conversations.py`):**

```sql
SELECT
    m.id::text,
    m.role,
    m.input_mode,
    m.text_content,
    m.created_at,
    aa.storage_key,
    pa.overall_score,
    pa.accuracy_score,
    pa.fluency_score,
    pa.completeness_score,
    pa.prosody_score,
    pa.id::text AS assessment_id
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
LEFT JOIN audio_assets aa ON aa.message_id = m.id AND aa.audio_type = 'user_input'
LEFT JOIN pronunciation_assessments pa ON pa.message_id = m.id
WHERE m.conversation_id = %s
  AND (c.cleared_at IS NULL OR m.created_at > c.cleared_at)
ORDER BY m.created_at ASC
```

Word details are fetched in a second query for all `assessment_id`s in the result set (one batch query, not N+1):

```sql
SELECT assessment_id::text, word_index, word, accuracy_score, error_type, start_ms, duration_ms
FROM pronunciation_word_details
WHERE assessment_id = ANY(%s)
ORDER BY assessment_id, word_index
```

Route is added to the existing `conversations.py` router. No new file needed.

---

## 4. Topic Data Expansion

### 4.1 `TOPIC_CATEGORIES` in `DashboardPage.jsx`

Replace the current 4-category constant with all 10 categories and 64 topics. Each topic uses the DB code as `key` (e.g., `'ielts_part1'`, `'business_job_interview'`).

**New structure** (mirrors the DB seed exactly):

| Category `name` | `accent` | Topics (key → icon) |
|-----------------|----------|---------------------|
| `IELTS Speaking` | `blue` | `ielts_part1` 🎤, `ielts_part2` 📋, `ielts_part3` 🎓, `ielts_describe_person` 🧑, `ielts_describe_place` 🏞️, `ielts_describe_event` 🎉, `ielts_describe_object` 🎁 |
| `Business & Career` | `violet` | `business_job_interview` 💼, `business_meeting` 🗂️, `business_presentation` 📊, `business_negotiation` 🤝, `business_networking` 🌐, `business_performance_review` 📝, `business_leadership` 👔 |
| `Daily Life` | `emerald` | `daily_greetings` 💬, `daily_shopping` 🛍️, `daily_healthcare` 🏥, `daily_family` 👨‍👩‍👧, `daily_hobbies` 🎨, `daily_housing` 🏠, `daily_cooking` 🍳 |
| `Travel & Culture` | `amber` | `travel_planning` ✈️, `travel_restaurant` 🍽️, `travel_hotel` 🏨, `travel_airport` 🛫, `travel_sightseeing` 🗺️, `travel_culture` 🌏, `travel_emergency` 🆘 |
| `Academic & Education` | `teal` | `academic_classroom` 📚, `academic_research` 🔬, `academic_study_abroad` 🌍, `academic_presentations` 🖥️, `academic_campus` 🏫, `academic_online` 💻 |
| `Health & Wellness` | `rose` | `health_doctor` 🏥, `health_mental` 🧠, `health_diet` 🥗, `health_exercise` 🏋️, `health_stress` 😮‍💨, `health_public` 🦠 |
| `Technology & Innovation` | `indigo` | `tech_social_media` 📱, `tech_ai` 🤖, `tech_gadgets` 💻, `tech_cybersecurity` 🔒, `tech_ecommerce` 🛒, `tech_gaming` 🎮 |
| `Social Life & Relationships` | `pink` | `social_friendship` 👥, `social_dating` 💕, `social_conflict` 🤲, `social_peer_pressure` 🛑, `social_cross_cultural` 🌐, `social_community` 🤝 |
| `Environment & Society` | `green` | `env_climate` 🌍, `env_sustainable` ♻️, `env_social_issues` ⚖️, `env_immigration` 🗺️, `env_urban_rural` 🏙️, `env_politics` 🗳️ |
| `Entertainment & Media` | `orange` | `ent_movies` 🎬, `ent_music` 🎵, `ent_books` 📖, `ent_sports` ⚽, `ent_celebrities` ⭐, `ent_news` 📰 |

`ACCENT_STYLES` in `DashboardPage.jsx` gains 6 new entries: `teal`, `rose`, `indigo`, `pink`, `green`, `orange`.

### 4.2 `TOPICS` flat array in `VoiceAgent.tsx`

Replace the 10-item flat array with 64 entries. Format: `{ id: 'ielts_part1', label: 'Part 1: Personal Questions', desc: '...' }` where `id` is the DB topic code. The `TopicId` type is inferred from this array.

Remove `DASHBOARD_TO_TOPIC_ID` and `DASHBOARD_TO_SUB_OPTION` maps. When the Dashboard navigates to VoiceAgent with `?topic=<db_code>`, VoiceAgent directly sets `topic` state from the URL param (the new `id` values match the DB codes so no mapping is needed).

### 4.3 `translations.ts`

Add 6 new `category.*` keys and 44 new `topic.*` keys (for the 44 new topics). Existing 20 topic keys are renamed to use the new DB codes. Both `en` and `vi` dicts are updated.

Pattern: `'category.IELTS Speaking.name'` stays the same (name is the display name, not the code). Topic keys change to `'topic.ielts_part1.title'` etc.

---

## 5. VoiceAgent Layout — Left Sidebar

### 5.1 Structure

```
┌─────────────────────────────────────────────────────────┐
│  [☰]  Sidebar toggle (mobile)                           │
├──────────────┬──────────────────────────────────────────┤
│  SIDEBAR     │  CHAT AREA                               │
│  280px       │  (existing layout unchanged)             │
│              │                                          │
│  + New Chat  │  Topic: [dropdown]  [🗑 Clear]  [⚙ …]  │
│  ────────    │                                          │
│  Today       │  <messages>                              │
│   • Job…     │                                          │
│  Yesterday   │                                          │
│   • IELTS…   │                                          │
│  Older       │                                          │
│   • Daily…   │                                          │
└──────────────┴──────────────────────────────────────────┘
```

- Desktop: sidebar always visible, `flex` layout
- Mobile (< 768px): sidebar hidden, toggle button top-left opens it as an overlay drawer
- Dark mode: sidebar respects `isDark` state (existing dark CSS classes)

### 5.2 Sidebar Component

New file: `frontend/src/components/voice-agent/ConversationSidebar.tsx`

Props:
```ts
interface ConversationSidebarProps {
  conversations: ConversationOut[];     // from GET /api/conversations
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onNewChat: () => void;
  isOpen: boolean;                      // mobile drawer state
  onClose: () => void;
  isDark: boolean;
}
```

Grouping logic (pure function, no library):
```
Today       → started_at >= today 00:00
Yesterday   → started_at >= yesterday 00:00, < today 00:00
This Week   → started_at >= 7 days ago
Older       → everything else
```

Each conversation row shows:
- Topic title (looked up from the `TOPICS` array by `topic_id` code — `ConversationOut.topic_id` is a UUID; need the topic code resolved via a `topicsById` map passed as prop or built from the fetched conversations' `topic_id` matched against a topic lookup)
- Relative date (e.g., "2 hours ago", "Yesterday")
- Status dot: green for `active`, grey for `completed`/`abandoned`

> **Note on topic title lookup:** `ConversationOut.topic_id` is a UUID. To show the topic title in the sidebar without a new API call, the backend `ConversationOut` should include `topic_code: str | None` alongside `topic_id`. Add `topic_code` to the `SELECT` in `list_conversations` (`JOIN topics ON …` or just `topics.code`) and to the `ConversationOut` Pydantic model and `ConversationSummary` TypeScript interface.

### 5.3 Conversation Loading in VoiceAgent

New state:
```ts
const [sidebarOpen, setSidebarOpen] = useState(false);          // mobile
const [historyLoading, setHistoryLoading] = useState(false);
```

`useQuery` for the sidebar list (already in DashboardPage; move/share via `queryClient`):
```ts
const { data: conversations } = useQuery({
  queryKey: ['conversations'],
  queryFn: () => fetchConversations(token),
  enabled: !!token,
  staleTime: 30_000,
});
```

`handleSelectConversation(conversationId: string)`:
1. Set `currentConversationId = conversationId`
2. Set `historyLoading = true`
3. Call `GET /api/conversations/{id}/messages-with-scores`
4. Map response to `Message[]` (rehydrate `score` and `mistakes` from word details)
5. Set `messages = rehydrated`
6. Set `historyLoading = false`
7. Auto-scroll to bottom

### 5.4 Rehydrating History Messages into `Message` Type

The existing `Message` type in `MessageBubble.tsx` (or `voice-agent/index.ts`) already has `scoreDetails` and `mistakes`. When loading from history:

History messages get negative numeric IDs (e.g., `-1, -2, …`) so they never collide with live messages which use incrementing positive IDs.

```ts
function rehydrateHistoryMessage(raw: MessageWithScoreOut, index: number): Message {
  return {
    id: -(index + 1),             // negative to avoid collision with live message IDs
    role: raw.role as 'user' | 'assistant',
    text: raw.text_content ?? '',
    timestamp: new Date(raw.created_at),
    audioUrl: undefined,          // loaded lazily — see §5.5
    _serverAudioUrl: raw.audio_url, // stored separately for lazy load
    scoreDetails: raw.score ? {
      overall: raw.score.overall_score ?? 0,
      pronunciation: raw.score.overall_score ?? 0, // PronScore = overall pronunciation quality
      fluency: raw.score.fluency_score ?? 0,
      accuracy: raw.score.accuracy_score ?? 0,
    } : undefined,
    mistakes: raw.score?.words
      .filter(w => w.error_type && w.error_type !== 'None')
      .map(w => ({
        type: mapErrorType(w.error_type),
        original: w.word,
        corrected: '',
        explanation: `${w.error_type} error`,
      })) ?? [],
    isHistory: true,   // new flag — prevents re-assessment on load
  };
}
```

### 5.5 Lazy Audio Loading

For history messages with `_serverAudioUrl`, audio is not fetched on load. Instead, `MessageBubble.tsx` is updated to:
- Show a "▶ Play" button when `isHistory && _serverAudioUrl` and `audioUrl` is undefined
- On click, set `audioUrl = _serverAudioUrl` and play (IntersectionObserver is optional; click-to-load is simpler and sufficient)

### 5.6 New Chat Button

`onNewChat` in the sidebar calls the existing `handleReset()` function in VoiceAgent (already resets messages, clears `currentConversationId`, starts a new connection).

---

## 6. Clear History Button

Location: top of the chat area, right of the topic label, left of the settings gear.

Button: `🗑 Clear` (icon + label, small, ghost style).

Behaviour:
- Shows a confirmation tooltip/popover: "Clear all messages? This cannot be undone." with Confirm / Cancel
- On confirm: calls `POST /api/conversations/{currentConversationId}/clear` → clears rendered messages → calls `queryClient.invalidateQueries(['conversations'])`
- Does **not** disconnect — the session stays active; the user can keep speaking

The existing `clearConversation` call inside `handleReset` is kept as-is (it fires on reconnect too). The new button is an **additional** entry point, not a replacement.

---

## 7. Dashboard Changes

### 7.1 Remove sessionHistory dependencies
- Delete `StorageUsageBar` component
- Remove `getSessions`, `saveSession`, `deleteSession`, `getStorageUsage`, `formatBytes`, `pruneOldestSessions` imports
- Session history section now reads **only** from `serverConversations` (already fetched via `useQuery`) and `cachedConversations` (IndexedDB). The localStorage merge in `realSessions` useMemo is removed.
- `SessionCard.onDelete` calls `DELETE /api/conversations/{id}` (new endpoint) or is hidden for now — see note below

> **Delete conversation endpoint:** The Dashboard currently calls `clearConversation` on delete. A real `DELETE /api/conversations/{id}` endpoint should be added. For now, the delete button can be hidden until that endpoint exists (low risk — don't block on it).

### 7.2 `TOPIC_CATEGORIES` update
Same 10-category constant as in §4.1. DashboardPage and VoiceAgent can import a shared constant from a new file `frontend/src/constants/topics.ts` to avoid duplication.

### 7.3 `onView` for session cards
Currently navigates to `/VoiceAgent?session=<id>`. Change to `/VoiceAgent?conversation=<id>` (UUID). VoiceAgent reads the `conversation` param on mount, sets `currentConversationId`, and loads history via the new endpoint.

---

## 8. Shared `topics.ts` Constant

New file: `frontend/src/constants/topics.ts`

Exports:
```ts
export const TOPIC_CATEGORIES: TopicCategory[]   // 10 categories × 64 topics
export const TOPICS_FLAT: TopicEntry[]            // 64 flat entries for VoiceAgent dropdown
export type TopicId = typeof TOPICS_FLAT[number]['id']
```

Both `DashboardPage.jsx` and `VoiceAgent.tsx` import from here. This removes the duplication between the two pages.

---

## 9. Files Changed

| Action | File |
|--------|------|
| **Delete** | `frontend/src/api/sessionHistory.js` |
| **New** | `frontend/src/constants/topics.ts` |
| **New** | `frontend/src/components/voice-agent/ConversationSidebar.tsx` |
| **Modify** | `frontend/src/pages/VoiceAgent.tsx` — sidebar, history loading, clear button, topic data |
| **Modify** | `frontend/src/pages/DashboardPage.jsx` — remove localStorage history, update topics |
| **Modify** | `frontend/src/components/voice-agent/MessageBubble.tsx` — lazy audio play button |
| **Modify** | `frontend/src/components/voice-agent/index.ts` — export `ConversationSidebar` |
| **Modify** | `frontend/src/api/conversations.ts` — add `fetchMessagesWithScores`, update `ConversationSummary` to include `topic_code` |
| **Modify** | `frontend/src/i18n/translations.ts` — 6 new category keys, 44 new topic keys, rename 20 existing topic keys |
| **Modify** | `app/api/conversations.py` — add `messages-with-scores` route, add `topic_code` to list query |
| **Modify** | `app/api/schemas.py` — add `WordDetail`, `MessageScoreOut`, `MessageWithScoreOut`, `ConversationWithScoresResponse`; add `topic_code` to `ConversationOut` |

---

## 10. Out of Scope

- `DELETE /api/conversations/{id}` endpoint — delete button on Dashboard hidden for now
- i18n Vietnamese translations for new topics (placeholder keys added, translations deferred)
- Pagination of sidebar conversations (first 100 sufficient per existing `LIMIT 100`)
- Phoneme/syllable level display in history (word-level is included; phoneme is not)
- Score writing back to DB from live session (unchanged — still done in `assess.py`)
