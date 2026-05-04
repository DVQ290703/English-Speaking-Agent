# Topics & Categories API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a `GET /api/topics/categories` endpoint so the frontend can fetch live topic/category data instead of reading from a hardcoded constant file.

**Architecture:** New backend route reads from the seeded `categories` + `topics` tables with one JOIN query. Frontend introduces a thin fetch module (`src/api/topics.ts`) and a UI-only meta file (`src/constants/topicMeta.ts`) for icons and accent colors. `TOPIC_CATEGORIES` and `TOPICS_FLAT` are removed from `topics.ts`; `ConversationSidebar`, `VoiceAgent`, and `DashboardPage` switch to API data via React Query.

**Tech Stack:** Python/FastAPI (psycopg2, Pydantic v2), pytest + FastAPI TestClient; TypeScript/React, @tanstack/react-query

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `app/api/schemas.py` | Add `TopicOut`, `CategoryWithTopicsOut` |
| Create | `app/api/topics.py` | `GET /api/topics/categories` route |
| Modify | `app/api/router.py` | Register topics router |
| Create | `tests/test_api/test_topics.py` | Unit tests for the new endpoint |
| Create | `frontend/src/constants/topicMeta.ts` | Icon + accent lookup by code |
| Modify | `frontend/src/constants/topics.ts` | Remove hardcoded data; keep interfaces |
| Create | `frontend/src/api/topics.ts` | Fetch function + TS interfaces |
| Modify | `frontend/src/components/voice-agent/ConversationSidebar.tsx` | Use API data |
| Modify | `frontend/src/pages/VoiceAgent.tsx` | Use API data |
| Modify | `frontend/src/pages/DashboardPage.jsx` | Use API data |

---

## Task 1: Add Pydantic schemas for topics/categories response

**Files:**
- Modify: `app/api/schemas.py`

- [ ] **Step 1: Add two models at the end of `app/api/schemas.py`**

```python
class TopicOut(BaseModel):
    code: str
    title: str
    description: str | None
    difficulty_level: str | None
    sort_order: int


class CategoryWithTopicsOut(BaseModel):
    code: str
    title: str
    sort_order: int
    topics: list[TopicOut]
```

- [ ] **Step 2: Commit**

```bash
git add app/api/schemas.py
git commit -m "feat: add TopicOut and CategoryWithTopicsOut Pydantic schemas"
```

---

## Task 2: Write the failing test for the new endpoint

**Files:**
- Create: `tests/test_api/test_topics.py`

- [ ] **Step 1: Write the test file**

```python
# tests/test_api/test_topics.py
"""Unit tests for GET /api/topics/categories"""
import os
import sys
import types
from unittest.mock import MagicMock, patch

_minio_stub = types.ModuleType("minio")
_minio_stub.Minio = MagicMock  # type: ignore[attr-defined]
_minio_error_stub = types.ModuleType("minio.error")
_minio_error_stub.S3Error = Exception  # type: ignore[attr-defined]
sys.modules.setdefault("minio", _minio_stub)
sys.modules.setdefault("minio.error", _minio_error_stub)

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only!")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("POSTGRES_DB", "test_db")
os.environ.setdefault("POSTGRES_USER", "test_user")
os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
os.environ.setdefault("MINIO_SECRET_KEY", "minio-test-secret-2026")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key-2026")

import pytest
from fastapi.testclient import TestClient

with (
    patch("app.core.database.init_db_pool"),
    patch("app.core.storage.init_storage"),
):
    from app.main import app

client = TestClient(app, raise_server_exceptions=True)


def make_mock_conn(rows):
    """Return a mock psycopg2 context-manager connection whose cursor yields `rows`."""
    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = rows
    mock_conn = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return mock_conn


def test_get_categories_returns_grouped_structure():
    """Two rows from the same category should be nested under one category object."""
    db_rows = [
        # cat_code, cat_title, cat_sort, topic_code, topic_title, topic_desc, difficulty, topic_sort
        ("ielts", "IELTS Speaking", 1, "ielts_part1", "Part 1", "Intro questions", "beginner", 1),
        ("ielts", "IELTS Speaking", 1, "ielts_part2", "Part 2", "Long turn", "intermediate", 2),
    ]
    mock_conn = make_mock_conn(db_rows)
    with patch("app.core.database.get_connection", return_value=mock_conn):
        resp = client.get("/api/topics/categories")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    cat = data[0]
    assert cat["code"] == "ielts"
    assert cat["title"] == "IELTS Speaking"
    assert cat["sort_order"] == 1
    assert len(cat["topics"]) == 2
    assert cat["topics"][0]["code"] == "ielts_part1"
    assert cat["topics"][1]["code"] == "ielts_part2"


def test_get_categories_two_categories():
    """Rows from two distinct categories produce two top-level objects."""
    db_rows = [
        ("ielts",    "IELTS Speaking", 1, "ielts_part1", "Part 1", None, "beginner",     1),
        ("business", "Business",       2, "business_job_interview", "Job Interview", None, "intermediate", 1),
    ]
    mock_conn = make_mock_conn(db_rows)
    with patch("app.core.database.get_connection", return_value=mock_conn):
        resp = client.get("/api/topics/categories")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["code"] == "ielts"
    assert data[1]["code"] == "business"


def test_get_categories_empty_db():
    """Empty DB returns an empty list (not an error)."""
    mock_conn = make_mock_conn([])
    with patch("app.core.database.get_connection", return_value=mock_conn):
        resp = client.get("/api/topics/categories")

    assert resp.status_code == 200
    assert resp.json() == []


def test_get_categories_no_auth_required():
    """Endpoint must be accessible without an Authorization header."""
    mock_conn = make_mock_conn([])
    with patch("app.core.database.get_connection", return_value=mock_conn):
        resp = client.get("/api/topics/categories")
    assert resp.status_code == 200
```

- [ ] **Step 2: Run the test to verify it fails (route does not exist yet)**

```bash
cd D:/work/projects/English-Speaking-Agent
python -m pytest tests/test_api/test_topics.py -v
```

Expected: 4 failures — `404 Not Found` or import errors because `app/api/topics.py` does not exist.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/test_api/test_topics.py
git commit -m "test: add failing tests for GET /api/topics/categories"
```

---

## Task 3: Implement the topics route

**Files:**
- Create: `app/api/topics.py`

- [ ] **Step 1: Create `app/api/topics.py`**

```python
from __future__ import annotations

from fastapi import APIRouter

from app.api.schemas import CategoryWithTopicsOut, TopicOut
from app.core.database import get_connection
from app.core.logger import logger

router = APIRouter(prefix="/topics", tags=["topics"])


@router.get("/categories", response_model=list[CategoryWithTopicsOut])
def list_categories():
    """Return all active categories with their active topics, ordered by sort_order."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    c.code        AS cat_code,
                    c.title       AS cat_title,
                    c.sort_order  AS cat_sort,
                    t.code        AS topic_code,
                    t.title       AS topic_title,
                    t.description AS topic_desc,
                    t.difficulty_level,
                    t.sort_order  AS topic_sort
                FROM categories c
                JOIN topics t ON t.category_id = c.id
                WHERE c.is_active = TRUE
                  AND t.is_active = TRUE
                ORDER BY c.sort_order, t.sort_order
                """
            )
            rows = cur.fetchall()

    # Group topics under their category (rows are already sorted)
    categories: list[CategoryWithTopicsOut] = []
    cat_index: dict[str, int] = {}

    for cat_code, cat_title, cat_sort, topic_code, topic_title, topic_desc, difficulty, topic_sort in rows:
        if cat_code not in cat_index:
            cat_index[cat_code] = len(categories)
            categories.append(
                CategoryWithTopicsOut(
                    code=cat_code,
                    title=cat_title,
                    sort_order=cat_sort,
                    topics=[],
                )
            )
        categories[cat_index[cat_code]].topics.append(
            TopicOut(
                code=topic_code,
                title=topic_title,
                description=topic_desc,
                difficulty_level=difficulty,
                sort_order=topic_sort,
            )
        )

    logger.info("list_categories returned %d categories", len(categories))
    return categories
```

- [ ] **Step 2: Register the router in `app/api/router.py`**

Current content of `app/api/router.py`:
```python
from __future__ import annotations

from fastapi import APIRouter

from app.api.assess import router as assess_router
from app.api.audio import router as audio_router
from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.conversations import router as conversations_router

router = APIRouter(prefix="/api")
router.include_router(auth_router)
router.include_router(chat_router)
router.include_router(assess_router)
router.include_router(conversations_router)
router.include_router(audio_router)
```

Replace with:
```python
from __future__ import annotations

from fastapi import APIRouter

from app.api.assess import router as assess_router
from app.api.audio import router as audio_router
from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.conversations import router as conversations_router
from app.api.topics import router as topics_router

router = APIRouter(prefix="/api")
router.include_router(auth_router)
router.include_router(chat_router)
router.include_router(assess_router)
router.include_router(conversations_router)
router.include_router(audio_router)
router.include_router(topics_router)
```

- [ ] **Step 3: Run the tests and verify they pass**

```bash
cd D:/work/projects/English-Speaking-Agent
python -m pytest tests/test_api/test_topics.py -v
```

Expected output:
```
PASSED tests/test_api/test_topics.py::test_get_categories_returns_grouped_structure
PASSED tests/test_api/test_topics.py::test_get_categories_two_categories
PASSED tests/test_api/test_topics.py::test_get_categories_empty_db
PASSED tests/test_api/test_topics.py::test_get_categories_no_auth_required
4 passed
```

- [ ] **Step 4: Run the full backend test suite to check for regressions**

```bash
python -m pytest tests/ -v --tb=short
```

Expected: all previously passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/topics.py app/api/router.py
git commit -m "feat: add GET /api/topics/categories endpoint"
```

---

## Task 4: Create the frontend UI-only meta lookup

**Files:**
- Create: `frontend/src/constants/topicMeta.ts`

- [ ] **Step 1: Create `frontend/src/constants/topicMeta.ts`**

This file contains only icons and accent colors — nothing that belongs in the DB.

```typescript
// frontend/src/constants/topicMeta.ts
// UI-only metadata keyed by DB code. Add new entries here when topics are added to the DB.

export const CATEGORY_META: Record<string, { accent: string }> = {
  ielts:         { accent: 'blue' },
  business:      { accent: 'violet' },
  daily:         { accent: 'emerald' },
  travel:        { accent: 'amber' },
  academic:      { accent: 'teal' },
  health:        { accent: 'rose' },
  technology:    { accent: 'indigo' },
  social:        { accent: 'pink' },
  environment:   { accent: 'green' },
  entertainment: { accent: 'orange' },
};

export const TOPIC_META: Record<string, { icon: string }> = {
  // IELTS
  ielts_part1:          { icon: '🎤' },
  ielts_part2:          { icon: '📋' },
  ielts_part3:          { icon: '🎓' },
  ielts_describe_person: { icon: '🧑' },
  ielts_describe_place:  { icon: '🏞️' },
  ielts_describe_event:  { icon: '🎉' },
  ielts_describe_object: { icon: '🎁' },
  // Business & Career
  business_job_interview:    { icon: '💼' },
  business_meeting:          { icon: '🗂️' },
  business_presentation:     { icon: '📊' },
  business_negotiation:      { icon: '🤝' },
  business_networking:       { icon: '🌐' },
  business_performance_review: { icon: '📝' },
  business_leadership:       { icon: '👔' },
  // Daily Life
  daily_greetings:  { icon: '💬' },
  daily_shopping:   { icon: '🛍️' },
  daily_healthcare: { icon: '🏥' },
  daily_family:     { icon: '👨‍👩‍👧' },
  daily_hobbies:    { icon: '🎨' },
  daily_housing:    { icon: '🏠' },
  daily_cooking:    { icon: '🍳' },
  // Travel & Culture
  travel_planning:    { icon: '✈️' },
  travel_restaurant:  { icon: '🍽️' },
  travel_hotel:       { icon: '🏨' },
  travel_airport:     { icon: '🛫' },
  travel_sightseeing: { icon: '🗺️' },
  travel_culture:     { icon: '🌏' },
  travel_emergency:   { icon: '🆘' },
  // Academic & Education
  academic_classroom:    { icon: '📚' },
  academic_research:     { icon: '🔬' },
  academic_study_abroad: { icon: '🌍' },
  academic_presentations: { icon: '🖥️' },
  academic_campus:       { icon: '🏫' },
  academic_online:       { icon: '💻' },
  // Health & Wellness
  health_doctor:   { icon: '🏥' },
  health_mental:   { icon: '🧠' },
  health_diet:     { icon: '🥗' },
  health_exercise: { icon: '🏋️' },
  health_stress:   { icon: '😮‍💨' },
  health_public:   { icon: '🦠' },
  // Technology & Innovation
  tech_social_media:  { icon: '📱' },
  tech_ai:            { icon: '🤖' },
  tech_gadgets:       { icon: '💻' },
  tech_cybersecurity: { icon: '🔒' },
  tech_ecommerce:     { icon: '🛒' },
  tech_gaming:        { icon: '🎮' },
  // Social Life & Relationships
  social_friendship:      { icon: '👥' },
  social_dating:          { icon: '💕' },
  social_conflict:        { icon: '🤲' },
  social_peer_pressure:   { icon: '🛑' },
  social_cross_cultural:  { icon: '🌐' },
  social_community:       { icon: '🤝' },
  // Environment & Society
  env_climate:       { icon: '🌍' },
  env_sustainable:   { icon: '♻️' },
  env_social_issues: { icon: '⚖️' },
  env_immigration:   { icon: '🗺️' },
  env_urban_rural:   { icon: '🏙️' },
  env_politics:      { icon: '🗳️' },
  // Entertainment & Media
  ent_movies:      { icon: '🎬' },
  ent_music:       { icon: '🎵' },
  ent_books:       { icon: '📖' },
  ent_sports:      { icon: '⚽' },
  ent_celebrities: { icon: '⭐' },
  ent_news:        { icon: '📰' },
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/constants/topicMeta.ts
git commit -m "feat: add topicMeta.ts with icon and accent lookup"
```

---

## Task 5: Create the frontend API fetch module

**Files:**
- Create: `frontend/src/api/topics.ts`

- [ ] **Step 1: Create `frontend/src/api/topics.ts`**

```typescript
// frontend/src/api/topics.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface TopicOut {
  code: string;
  title: string;
  description: string | null;
  difficulty_level: string | null;
  sort_order: number;
}

export interface CategoryWithTopics {
  code: string;
  title: string;
  sort_order: number;
  topics: TopicOut[];
}

export async function fetchTopicCategories(): Promise<CategoryWithTopics[]> {
  const resp = await fetch(`${API_BASE_URL}/api/topics/categories`);
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || `Request failed: ${resp.status}`);
  }
  return resp.json() as Promise<CategoryWithTopics[]>;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/topics.ts
git commit -m "feat: add fetchTopicCategories API client"
```

---

## Task 6: Trim `src/constants/topics.ts`

**Files:**
- Modify: `frontend/src/constants/topics.ts`

- [ ] **Step 1: Replace the entire file content**

The old file had hardcoded `TOPIC_CATEGORIES`, `TOPICS_FLAT`, and a derived `TopicId` union type. After this change the file is a lean types-only module.

```typescript
// frontend/src/constants/topics.ts
// Type definitions only. Live data is fetched from GET /api/topics/categories.
// UI-only metadata (icon, accent) lives in src/constants/topicMeta.ts.

export interface TopicEntry {
  code: string;
  title: string;
  description: string | null;
  difficulty_level: string | null;
  sort_order: number;
}

export interface TopicCategory {
  code: string;
  title: string;
  sort_order: number;
  topics: TopicEntry[];
}

// Widened to string because valid codes now come from the DB.
export type TopicId = string;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/constants/topics.ts
git commit -m "refactor: remove hardcoded TOPIC_CATEGORIES from topics.ts, keep type definitions"
```

---

## Task 7: Update `ConversationSidebar.tsx`

**Files:**
- Modify: `frontend/src/components/voice-agent/ConversationSidebar.tsx`

The sidebar currently imports `TOPIC_CATEGORIES` from the now-trimmed constants file.
Replace it with a `useQuery` call to the topics API, merging in `TOPIC_META` and `CATEGORY_META` at render time.

- [ ] **Step 1: Replace the file**

Diff summary:
- Remove: `import { TOPIC_CATEGORIES } from '../../constants/topics'`
- Add: `import { useQuery } from '@tanstack/react-query'` (already imported)
- Add: `import { fetchTopicCategories, type CategoryWithTopics } from '../../api/topics'`
- Add: `import { CATEGORY_META, TOPIC_META } from '../../constants/topicMeta'`
- Add a `useQuery` call for categories
- In the browse view, replace `TOPIC_CATEGORIES.map(...)` with the API data

Full updated component:

```tsx
// frontend/src/components/voice-agent/ConversationSidebar.tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ArrowLeft, MessageSquarePlus, Trash2, X } from 'lucide-react';
import { fetchTopicCategories } from '../../api/topics';
import { TOPIC_META } from '../../constants/topicMeta';
import { fetchForTopic, type ForTopicResponse } from '../../api/conversations';

interface ConversationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
  activeTopic: string | null;
  activeConversationId: string | null;
  token: string;
  onSelectConversation: (conversationId: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (conversationId: string) => void;
  onTopicSelect: (topicCode: string) => void;
}

type SidebarView = 'browse' | 'topic-history';

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ConversationSidebar({
  isOpen,
  onClose,
  isDark,
  activeTopic,
  activeConversationId,
  token,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onTopicSelect,
}: ConversationSidebarProps) {
  const [view, setView] = useState<SidebarView>('browse');
  const [browseTopic, setBrowseTopic] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTopic) {
      setBrowseTopic(activeTopic);
      setView('topic-history');
    }
  }, [activeTopic]);

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['topics-categories'],
    queryFn: fetchTopicCategories,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: topicData, isLoading } = useQuery<ForTopicResponse>({
    queryKey: ['for-topic', browseTopic],
    queryFn: () => fetchForTopic(token, browseTopic!),
    enabled: !!browseTopic && !!token,
  });

  const base = isDark
    ? 'bg-gray-900 border-gray-700 text-gray-100'
    : 'bg-[#f5f7fa] border-gray-200 text-gray-900';

  const itemBase = isDark
    ? 'hover:bg-gray-800 text-gray-300'
    : 'hover:bg-gray-100 text-gray-700';

  const itemActive = isDark
    ? 'bg-blue-900/50 text-blue-300 border border-blue-700/50'
    : 'bg-blue-50 text-blue-700 border border-blue-200';

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} />
      )}

      {/* Panel */}
      <div
        className={`fixed md:relative z-40 md:z-auto top-0 left-0 h-full md:h-auto w-72 md:w-64 lg:w-72 flex flex-col border-r shrink-0 transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${base}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-inherit">
          {view === 'topic-history' ? (
            <button
              onClick={() => setView('browse')}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${isDark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <span className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              Topics
            </span>
          )}
          {/* Mobile close */}
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded text-gray-500 hover:text-gray-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
          {view === 'browse' ? (
            /* Browse view: categories accordion */
            <div>
              {categoriesLoading && (
                <p className={`text-xs text-center mt-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Loading topics...
                </p>
              )}
              {categories.map(category => {
                const isExpanded = expandedCategory === category.code;
                return (
                  <div key={category.code}>
                    {/* Category header */}
                    <button
                      onClick={() => setExpandedCategory(isExpanded ? null : category.code)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm font-semibold transition-colors ${isDark ? 'text-gray-200 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      <span>{category.title}</span>
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 shrink-0" />
                        : <ChevronRight className="w-4 h-4 shrink-0" />
                      }
                    </button>

                    {/* Topic rows */}
                    {isExpanded && (
                      <div className="ml-2">
                        {category.topics.map(topic => {
                          const isActive = topic.code === activeTopic;
                          const icon = TOPIC_META[topic.code]?.icon ?? '💬';
                          return (
                            <button
                              key={topic.code}
                              onClick={() => {
                                setBrowseTopic(topic.code);
                                setView('topic-history');
                                onTopicSelect(topic.code);
                              }}
                              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg mx-1 my-0.5 text-sm transition-colors ${isActive ? itemActive : itemBase}`}
                              style={{ width: 'calc(100% - 8px)' }}
                            >
                              <span className="text-base shrink-0">{icon}</span>
                              <span className="truncate text-[13px]">{topic.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Topic-history view */
            <div className="px-2">
              {/* Topic title */}
              {topicData && (
                <div className={`px-2 py-2 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {topicData.topic_title}
                </div>
              )}

              {/* New Chat button */}
              <div className="px-1 pb-2">
                {topicData?.limit_reached ? (
                  <div
                    title="Max 5 sessions reached — delete one first"
                    className="w-full"
                  >
                    <button
                      disabled
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium opacity-50 cursor-not-allowed bg-gray-400 text-white"
                    >
                      <MessageSquarePlus className="w-4 h-4" />
                      New Chat
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onNewChat}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    New Chat
                  </button>
                )}
              </div>

              {/* Loading state */}
              {isLoading && (
                <p className={`text-xs text-center mt-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Loading...
                </p>
              )}

              {/* Conversation list */}
              {!isLoading && topicData && topicData.conversations.length === 0 && (
                <div className="text-center mt-6 px-2">
                  <p className={`text-xs mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    No history yet — start a new chat.
                  </p>
                  <button
                    onClick={onNewChat}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors mx-auto ${isDark ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    New Chat
                  </button>
                </div>
              )}

              {!isLoading && topicData && topicData.conversations.map(conv => {
                const isActive = conv.id === activeConversationId;
                const isDeleting = deletingId === conv.id;

                return (
                  <div key={conv.id} className="my-0.5">
                    {isDeleting ? (
                      /* Confirm delete row */
                      <div className={`rounded-lg px-3 py-2 mx-1 ${isDark ? 'bg-red-900/30 border border-red-700/40' : 'bg-red-50 border border-red-200'}`}>
                        <p className={`text-xs mb-2 font-medium ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                          Delete this session?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              onDeleteConversation(conv.id);
                              setDeletingId(null);
                            }}
                            className="flex-1 px-2 py-1 rounded text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Normal conversation row */
                      <div
                        className={`flex items-center gap-1 rounded-lg mx-1 transition-colors ${isActive ? itemActive : itemBase}`}
                        style={{ width: 'calc(100% - 8px)' }}
                      >
                        <button
                          onClick={() => {
                            onSelectConversation(conv.id);
                            onClose();
                          }}
                          className="flex-1 text-left px-3 py-2 min-w-0"
                        >
                          <div className="truncate font-medium text-[13px]">
                            {conv.title ?? `Session ${conv.session_number}`}
                          </div>
                          <div className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            {relativeTime(conv.updated_at)}
                          </div>
                        </button>
                        {!isActive && (
                          <button
                            onClick={() => setDeletingId(conv.id)}
                            className={`p-1.5 mr-1 rounded transition-colors shrink-0 ${isDark ? 'text-gray-600 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
                            title="Delete session"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/voice-agent/ConversationSidebar.tsx
git commit -m "feat: ConversationSidebar fetches topics from API instead of hardcoded constants"
```

---

## Task 8: Update `VoiceAgent.tsx`

**Files:**
- Modify: `frontend/src/pages/VoiceAgent.tsx`

`VoiceAgent.tsx` uses `TOPICS_FLAT` in three ways:
1. Line 53: import — remove it
2. Lines 111-112: `const TOPICS = TOPICS_FLAT` — replace with data from `useQuery`
3. Line 201: `TOPICS_FLAT.find(t => t.id === raw)?.id` — use URL param directly (trust the string; API will validate on use)
4. Line 1705: `TOPICS.find(tp => tp.id === topic)?.label` — find by `code`, use `title`
5. Lines 2441-2473: settings panel iterates `TOPICS` — iterate flat topics from API, use `topic.code`, `topic.title`, `topic.description`

- [ ] **Step 1: Remove the `TOPICS_FLAT` import (line 53)**

Find:
```typescript
import { TOPICS_FLAT, type TopicId as TopicIdConst } from '../constants/topics';
```

Replace with:
```typescript
import { type TopicId } from '../constants/topics';
import { fetchTopicCategories, type TopicOut } from '../api/topics';
import { TOPIC_META } from '../constants/topicMeta';
```

- [ ] **Step 2: Remove the local `TOPICS` and `TopicId` aliases (lines 111-112)**

Find:
```typescript
const TOPICS = TOPICS_FLAT;
type TopicId = TopicIdConst;
```

Delete both lines. `TopicId` is now imported directly.

- [ ] **Step 3: Add the topics query near the other `useQuery` calls in the component body**

Find the existing query:
```typescript
  const { data: forTopicData, ...} = useQuery...
```

Add before it (find any existing `useQuery` block in the component and insert before):
```typescript
  const { data: topicCategories = [] } = useQuery({
    queryKey: ['topics-categories'],
    queryFn: fetchTopicCategories,
    staleTime: 5 * 60 * 1000,
  });
  const TOPICS: TopicOut[] = topicCategories.flatMap(cat => cat.topics);
```

- [ ] **Step 4: Fix URL-param topic initialization (line ~198-201)**

Find:
```typescript
  const [topic, setTopic] = useState<TopicId | null>(() => {
      const raw = new URLSearchParams(window.location.search).get('topic');
      return (TOPICS_FLAT.find(t => t.id === raw)?.id ?? null) as TopicId | null;
```

Replace with:
```typescript
  const [topic, setTopic] = useState<TopicId | null>(() => {
      const raw = new URLSearchParams(window.location.search).get('topic');
      return raw ?? null;
```

- [ ] **Step 5: Fix the description bar label (line ~1705)**

Find:
```typescript
            {customTopicLabel ?? TOPICS.find(tp => tp.id === topic)?.label ?? 'Daily Conversation'}
```

Replace with:
```typescript
            {customTopicLabel ?? TOPICS.find(tp => tp.code === topic)?.title ?? 'Daily Conversation'}
```

- [ ] **Step 6: Fix the settings panel topic list (lines ~2441-2473)**

Find:
```typescript
            <div className="space-y-1">
              {TOPICS.map(tp => {
                const tpTitle = t(`topic.${tp.id}.title`) || tp.label;
                const tpDesc  = t(`topic.${tp.id}.desc`)  || tp.desc;
                return (
                  <button
                    key={tp.id}
                    onClick={() => {
                      setTopic(tp.id);
                      setCustomTopicLabel(null);
                      setSubOption(null);
                      setShowSettings(false);
                      try {
                        const url = new URL(window.location.href);
                        url.searchParams.set('topic', tp.id);
                        window.history.replaceState({}, '', url.toString());
                      } catch {}
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                      topic === tp.id
                        ? 'bg-blue-100 border border-blue-300 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 border border-transparent'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-medium text-gray-800">{tpTitle}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{tpDesc}</div>
                    </div>
                    {topic === tp.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
```

Replace with:
```typescript
            <div className="space-y-1">
              {TOPICS.map(tp => {
                const tpTitle = t(`topic.${tp.code}.title`) || tp.title;
                const tpDesc  = t(`topic.${tp.code}.desc`)  || tp.description || '';
                const icon    = TOPIC_META[tp.code]?.icon ?? '💬';
                return (
                  <button
                    key={tp.code}
                    onClick={() => {
                      setTopic(tp.code);
                      setCustomTopicLabel(null);
                      setSubOption(null);
                      setShowSettings(false);
                      try {
                        const url = new URL(window.location.href);
                        url.searchParams.set('topic', tp.code);
                        window.history.replaceState({}, '', url.toString());
                      } catch {}
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                      topic === tp.code
                        ? 'bg-blue-100 border border-blue-300 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0">{icon}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-800">{tpTitle}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{tpDesc}</div>
                      </div>
                    </div>
                    {topic === tp.code && (
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
```

- [ ] **Step 7: Build the frontend to verify no TypeScript errors**

```bash
cd frontend
npm run build
```

Expected: build succeeds with no TypeScript errors. If there are errors referencing `tp.id`, `tp.label`, or `tp.desc` in any other location in `VoiceAgent.tsx`, apply the same pattern: `tp.id` → `tp.code`, `tp.label` → `tp.title`, `tp.desc` → `tp.description`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/VoiceAgent.tsx
git commit -m "feat: VoiceAgent fetches topics from API instead of hardcoded constants"
```

---

## Task 9: Update `DashboardPage.jsx`

**Files:**
- Modify: `frontend/src/pages/DashboardPage.jsx`

`DashboardPage.jsx` passes `TOPIC_CATEGORIES` to `CategoryTabsRow`. The component accesses `cat.name`, `cat.accent`, `t.id`, `topic.icon`, and `topic.level`. After migration:
- `cat.name` → `cat.title` (display) and `cat.code` (i18n keys and React keys)
- `cat.accent` → `CATEGORY_META[cat.code].accent`
- `t.id` → `t.code`
- `topic.icon` → `TOPIC_META[topic.code].icon`
- `topic.level` → capitalize `topic.difficulty_level` for the i18n key (e.g., `'beginner'` → `'Beginner'`)

- [ ] **Step 1: Add the topics query and imports**

Find the existing imports block at the top of `DashboardPage.jsx`:
```javascript
import { TOPIC_CATEGORIES } from '../constants/topics';
```

Replace with:
```javascript
import { fetchTopicCategories } from '../api/topics';
import { CATEGORY_META, TOPIC_META } from '../constants/topicMeta';
```

- [ ] **Step 2: Add the `useQuery` for categories in the `DashboardPage` component body**

In the `DashboardPage` function, find the existing `useQuery` calls (e.g., `fetchMe`, `fetchConversations`). Add:
```javascript
  const { data: topicCategories = [] } = useQuery({
    queryKey: ['topics-categories'],
    queryFn: fetchTopicCategories,
    staleTime: 5 * 60 * 1000,
  });
```

- [ ] **Step 3: Pass API data to `CategoryTabsRow`**

Find:
```jsx
          <CategoryTabsRow categories={TOPIC_CATEGORIES} onStart={startSession} />
```

Replace with:
```jsx
          <CategoryTabsRow categories={topicCategories} onStart={startSession} />
```

- [ ] **Step 4: Update `CategoryTabsRow` to use `cat.code` and `cat.title`**

Find inside `CategoryTabsRow`:
```jsx
          {categories.map((cat, i) => (
            <button
              key={cat.name}
              onClick={() => setActiveIdx(i)}
              className={`whitespace-nowrap text-sm font-semibold px-4 py-2 rounded-full transition-colors ${
                activeIdx === i
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t(`category.${cat.name}.name`)}
            </button>
          ))}
```

Replace with:
```jsx
          {categories.map((cat, i) => (
            <button
              key={cat.code}
              onClick={() => setActiveIdx(i)}
              className={`whitespace-nowrap text-sm font-semibold px-4 py-2 rounded-full transition-colors ${
                activeIdx === i
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t(`category.${cat.code}.name`) || cat.title}
            </button>
          ))}
```

Also find:
```jsx
      <p className="text-sm text-gray-500 mb-3 px-1">{t(`category.${active.name}.desc`)}</p>
```

Replace with:
```jsx
      <p className="text-sm text-gray-500 mb-3 px-1">{t(`category.${active.code}.desc`) || ''}</p>
```

Also find the `active.topics.map` call:
```jsx
        {active.topics.map(t => (
          <TopicCard key={t.id} topic={t} accent={active.accent} onStart={() => onStart(t.id)} />
        ))}
```

Replace with:
```jsx
        {active.topics.map(tp => (
          <TopicCard
            key={tp.code}
            topic={tp}
            accent={CATEGORY_META[active.code]?.accent ?? 'blue'}
            onStart={() => onStart(tp.code)}
          />
        ))}
```

Note: `CATEGORY_META` is imported at module scope; it is accessible inside `CategoryTabsRow` because it is a module-level constant.

- [ ] **Step 5: Update `TopicCard` to use API field names**

Find the `TopicCard` function:
```jsx
function TopicCard({ topic, accent, onStart }) {
  const t = useT();
  const styles = ACCENT_STYLES[accent] || ACCENT_STYLES.blue;
  return (
    <button
      onClick={onStart}
      className={`shrink-0 w-65 snap-start text-left bg-linear-to-br ${styles.card} rounded-2xl border-2 p-5 transition-all hover:shadow-md hover:-translate-y-0.5 group`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl leading-none">{topic.icon}</span>
        <span className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm font-semibold">
          {t('common.start')} →
        </span>
      </div>
      <div className="text-base font-bold text-gray-900 mb-1.5">
        {t(`topic.${topic.id}.title`)}
      </div>
      <div className="text-sm text-gray-600 leading-relaxed mb-3 line-clamp-2 min-h-10">
        {t(`topic.${topic.id}.desc`)}
      </div>
      <span
        className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${styles.chip}`}
      >
        {t(`level.${topic.level}`)}
      </span>
    </button>
```

Replace with:
```jsx
function TopicCard({ topic, accent, onStart }) {
  const t = useT();
  const styles = ACCENT_STYLES[accent] || ACCENT_STYLES.blue;
  const icon = TOPIC_META[topic.code]?.icon ?? '💬';
  const levelKey = topic.difficulty_level
    ? topic.difficulty_level.charAt(0).toUpperCase() + topic.difficulty_level.slice(1)
    : '';
  return (
    <button
      onClick={onStart}
      className={`shrink-0 w-65 snap-start text-left bg-linear-to-br ${styles.card} rounded-2xl border-2 p-5 transition-all hover:shadow-md hover:-translate-y-0.5 group`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl leading-none">{icon}</span>
        <span className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm font-semibold">
          {t('common.start')} →
        </span>
      </div>
      <div className="text-base font-bold text-gray-900 mb-1.5">
        {t(`topic.${topic.code}.title`) || topic.title}
      </div>
      <div className="text-sm text-gray-600 leading-relaxed mb-3 line-clamp-2 min-h-10">
        {t(`topic.${topic.code}.desc`) || topic.description || ''}
      </div>
      <span
        className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${styles.chip}`}
      >
        {t(`level.${levelKey}`) || levelKey}
      </span>
    </button>
```

- [ ] **Step 6: Build to check for errors**

```bash
cd frontend
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/DashboardPage.jsx
git commit -m "feat: DashboardPage fetches topics from API instead of hardcoded constants"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run the full backend test suite one more time**

```bash
cd D:/work/projects/English-Speaking-Agent
python -m pytest tests/ -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 2: Run the frontend build**

```bash
cd frontend
npm run build
```

Expected: succeeds with no errors.

- [ ] **Step 3: Smoke-test in the browser (manual)**

1. Start the backend: `uvicorn app.main:app --reload`
2. Start the frontend: `npm run dev`
3. Open the app, verify the sidebar shows topics loaded from the API
4. Click a topic, verify the topic history panel loads
5. Open the settings panel in the voice agent, verify all topics are listed

- [ ] **Step 4: Final commit if any minor fixes were needed**

```bash
git add -p
git commit -m "fix: address any remaining topics API integration issues"
```
