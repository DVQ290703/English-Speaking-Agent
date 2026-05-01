# DB Reconstruction & Category Selection Design

**Date:** 2026-05-02  
**Branch:** TheAnh_fetch_his  
**Scope:** Full schema.sql and seed.sql reconstruction + 10-category speaking topic expansion

---

## 1. Goals

1. Fix all anti-patterns identified in the senior DBA audit of the existing schema
2. Add a `categories` table to support structured per-category history queries
3. Expand speaking topics from 5 flat entries to 10 categories × 5–7 sub-topics (64 total)
4. Keep categories hardcoded in the frontend — DB mirrors structure for backend query support only

---

## 2. Categories & Sub-Topics (Frontend Content)

Categories stay in the frontend `TOPIC_CATEGORIES` constant. The DB seeds match exactly.

| # | Code | Title | Sub-topics (5–7 each) |
|---|------|-------|----------------------|
| 1 | `ielts` | IELTS Speaking | Part 1 Personal Questions, Part 2 Long Turn, Part 3 Abstract Discussion, Describe a Person, Describe a Place, Describe an Event, Describe an Object |
| 2 | `business` | Business & Career | Job Interview, Office Meeting & Collaboration, Presentations & Public Speaking, Negotiation & Persuasion, Professional Networking, Performance Review, Leadership & Management |
| 3 | `daily` | Daily Life | Greetings & Small Talk, Shopping & Customer Service, Healthcare & Medical, Family & Relationships, Hobbies & Free Time, Housing & Neighborhood, Food & Cooking at Home |
| 4 | `travel` | Travel & Culture | Travel Planning & Booking, Restaurants & Dining Out, Hotel & Accommodation, Airport & Transportation, Sightseeing & Tourism, Cultural Differences & Customs, Lost & Emergency Situations |
| 5 | `academic` | Academic & Education | Classroom Discussion, Research & Thesis Defense, Study Abroad Experience, Academic Presentations, Campus Life & Student Issues, Online Learning & EdTech |
| 6 | `health` | Health & Wellness | Doctor & Hospital Visit, Mental Health & Wellbeing, Diet & Nutrition Advice, Exercise & Fitness, Stress & Work-Life Balance, Public Health & Epidemics |
| 7 | `technology` | Technology & Innovation | Social Media & Internet Culture, Artificial Intelligence & Future, Gadgets & Devices, Cybersecurity & Privacy, E-commerce & Digital Life, Gaming & Virtual Reality |
| 8 | `social` | Social Life & Relationships | Friendship & Social Circles, Dating & Romance, Conflict Resolution, Peer Pressure & Boundaries, Cross-Cultural Friendships, Community & Volunteering |
| 9 | `environment` | Environment & Society | Climate Change & Environment, Sustainable Living, Social Issues & Inequality, Immigration & Identity, Urban vs Rural Life, Politics & Current Events |
| 10 | `entertainment` | Entertainment & Media | Movies & TV Shows, Music & Concerts, Books & Literature, Sports & Competition, Celebrities & Pop Culture, News & Current Events |

Sub-topic codes use pattern `{category}_{slug}` (e.g., `ielts_part1`, `health_doctor`).

---

## 3. Schema Changes

### 3.1 New: `categories` table

```sql
CREATE TABLE categories (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        TEXT UNIQUE NOT NULL,
    title       TEXT NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

No icon or color_accent — those are frontend-only concerns.

### 3.2 New: `set_updated_at()` trigger function

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
```

Applied to: `users`, `topics`, `conversations`, `daily_progress`.

### 3.3 Modified: `users`

- `display_name VARCHAR(100)` — nullable (was `TEXT NOT NULL`, contradicts `RegisterRequest` where it is optional)
- `english_level TEXT` — add `CHECK (english_level IN ('A1','A2','B1','B2','C1','C2'))`
- `updated_at` — wire to `set_updated_at()` trigger

### 3.4 Modified: `auth_sessions`

- Add `UNIQUE (user_id, device_id)` — enforce one session per device
- Add `CREATE INDEX ON auth_sessions(refresh_token_hash)` — token lookup is a hot path

### 3.5 Modified: `topics`

- Add `category_id UUID NOT NULL REFERENCES categories(id)` — FK to categories
- Add `sort_order INT NOT NULL DEFAULT 0` — deterministic display order within a category
- Add `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — wired to trigger
- `difficulty_level TEXT` — add `CHECK (difficulty_level IN ('beginner','intermediate','advanced'))`
- Add `CREATE INDEX ON topics(category_id)`

### 3.6 Modified: `user_topic_preferences`

- Add `practice_count INT NOT NULL DEFAULT 0`
- Add `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- Add `CHECK (proficiency_score BETWEEN 0 AND 100)`

### 3.7 Modified: `conversations`

- **Drop** `created_at` — redundant with `started_at` (both defaulted to `NOW()`)
- `status TEXT` — add `CHECK (status IN ('active','completed','abandoned'))`
- `updated_at` — wire to `set_updated_at()` trigger
- Remove embedded migration comment (belongs in versioned migration file)

### 3.8 Modified: `messages`

- `language_code TEXT` — add `CHECK (language_code ~ '^[a-z]{2}(-[A-Z]{2})?$')` — enforces BCP-47 format (e.g., `en-US`, `vi`)

### 3.9 Modified: `audio_assets`

- Add `UNIQUE (message_id, audio_type)` — one audio per type per message
- `storage_provider TEXT` — add `CHECK (storage_provider IN ('local','s3','azure_blob','gcs'))`

### 3.10 Modified: `pronunciation_word_details`

- Add `word_index INT NOT NULL` — deterministic word ordering (replaces reliance on `start_ms`)
- `error_type TEXT` — add `CHECK (error_type IN ('None','Omission','Insertion','Mispronunciation','UnexpectedBreak','MissingBreak','Monotone'))`

### 3.11 Modified: `agent_feedback`

- Add `UNIQUE (turn_id)` — one feedback record per turn

### 3.12 Modified: `daily_progress`

- Add `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` + trigger — detects double-writes
- Add `CHECK` constraints: all score columns `BETWEEN 0 AND 100`

---

## 4. seed.sql Changes

- Seed 10 `categories` rows (codes from §2 table, sort_order 1–10)
- Seed 64 `topics` rows — one per sub-topic — each with `category_id` FK and `sort_order`
- Topic `code` format: `{category}_{slug}` (e.g., `ielts_part1`, `health_doctor`)
- Fix existing seed users: `display_name` already provided so no change needed; add `english_level` values that pass the new CHECK
- Remove old flat topic seeds (`daily_conversation`, `travel`, `job_interview`, `business_meeting`, `academic`) — replaced by properly categorized entries
- Update all conversation/preference seeds to reference new topic UUIDs

---

## 5. What Does NOT Change

- `turns` table — unchanged, serves clear purpose grouping user+assistant message pairs
- `pronunciation_assessments` table — unchanged, already well-structured
- `audio_assets` public_url — kept (pragmatic for CDN URLs)
- `agent_feedback` feedback columns — kept as TEXT (human-readable summaries)
- `daily_progress` overall structure — kept as mutable aggregate table (materialized view is out of scope)
- Frontend `TOPIC_CATEGORIES` mapping — updated separately to match new codes and add new categories; no backend API changes required

---

## 6. Backend Impact

- `conversations.topic_id` now points to a specific sub-topic row in `topics`
- Sub-topic history query: `WHERE topic_id = $1`
- Category history query: `JOIN topics ON topic_id = topics.id WHERE topics.category_id = $1`
- No changes to API surface — `topic` parameter (string code) maps to `topics.code` as before
- `conversations.created_at` removal: check `app/api/conversations.py` and `app/api/chat.py` for any reference to `conversations.created_at` and replace with `started_at`

---

## 7. Out of Scope

- Frontend UI implementation of category → sub-topic 2-step selection flow (separate task)
- i18n translation keys for new categories/topics (separate task)
- VoiceAgent.tsx topic list update (separate task)
- Phoneme/syllable level DB storage in pronunciation tables
- Materialized view for daily_progress
