# DB Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully rewrite `db_schema/schema.sql` and `db_schema/seed.sql` to fix all anti-patterns found in the DBA audit and expand speaking topics to 10 categories × 64 sub-topics.

**Architecture:** Drop both files and rewrite from scratch. schema.sql gets a `set_updated_at()` trigger function, a new `categories` table, and CHECK constraints on all enum-like TEXT columns. seed.sql seeds 10 categories and 64 topics with stable UUIDs, then updates all reference data to use new IDs. No backend API code changes are needed — conversations.py and chat.py are already compatible.

**Tech Stack:** PostgreSQL 14+, psql CLI, uuid-ossp extension, citext extension

---

## File Map

| Action | File |
|--------|------|
| Rewrite | `db_schema/schema.sql` |
| Rewrite | `db_schema/seed.sql` |
| Read-only verify | `app/api/conversations.py` |
| Read-only verify | `app/api/chat.py` |

---

## Task 1: Rewrite schema.sql

**Files:**
- Modify: `db_schema/schema.sql` (full rewrite)

- [ ] **Step 1: Verify current schema applies (baseline)**

```bash
psql $DATABASE_URL -c "\dt"
```

Expected: lists existing tables (users, auth_sessions, topics, conversations, …)

- [ ] **Step 2: Write the constraint verification tests (run these BEFORE the rewrite to confirm they currently have NO constraints)**

```sql
-- Wrap in a transaction so nothing persists:
BEGIN;

INSERT INTO users (email, password_hash, display_name, english_level)
  VALUES ('test@x.com', 'hash', 'Test', 'INVALID_LEVEL');
-- Expected: INSERT 0 1 (no CHECK on english_level yet)

INSERT INTO conversations (user_id, status)
  SELECT id, 'BOGUS_STATUS' FROM users WHERE email = 'test@x.com';
-- Expected: INSERT 0 1 (no CHECK on status yet)

ROLLBACK;
-- Expected: ROLLBACK (both inserts discarded)
```

Run: `psql $DATABASE_URL` then paste the SQL above.

- [ ] **Step 3: Rewrite `db_schema/schema.sql` with the full corrected schema**

Replace the entire file with:

```sql
-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- =========================
-- TRIGGER FUNCTION
-- =========================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- =========================
-- 1) USERS & AUTH
-- =========================

CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               CITEXT UNIQUE NOT NULL,
    password_hash       TEXT NOT NULL,
    display_name        VARCHAR(100),
    avatar_url          TEXT,
    english_level       TEXT CHECK (english_level IN ('A1','A2','B1','B2','C1','C2')),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS auth_sessions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id           TEXT NOT NULL,
    device_name         TEXT,
    refresh_token_hash  TEXT NOT NULL,
    ip_address          INET,
    user_agent          TEXT,
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id    ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(refresh_token_hash);

-- =========================
-- 2) CATEGORIES & TOPICS
-- =========================

CREATE TABLE IF NOT EXISTS categories (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        TEXT UNIQUE NOT NULL,
    title       TEXT NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topics (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id         UUID NOT NULL REFERENCES categories(id),
    code                TEXT UNIQUE NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    difficulty_level    TEXT CHECK (difficulty_level IN ('beginner','intermediate','advanced')),
    sort_order          INT NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topics_category_id ON topics(category_id);

CREATE TRIGGER trg_topics_updated_at
    BEFORE UPDATE ON topics
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS user_topic_preferences (
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_id            UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    proficiency_score   NUMERIC(5,2) CHECK (proficiency_score BETWEEN 0 AND 100),
    practice_count      INT NOT NULL DEFAULT 0,
    last_practiced_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, topic_id)
);

-- =========================
-- 3) CONVERSATIONS / TURNS / MESSAGES
-- =========================

CREATE TABLE IF NOT EXISTS conversations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_id            UUID REFERENCES topics(id),
    title               TEXT,
    status              TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','completed','abandoned')),
    cleared_at          TIMESTAMPTZ,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at            TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_conversations_user_started
    ON conversations(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_topic
    ON conversations(topic_id);
CREATE INDEX IF NOT EXISTS idx_conversations_cleared_at
    ON conversations(cleared_at) WHERE cleared_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS turns (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    turn_number         INT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (conversation_id, turn_number)
);

CREATE INDEX IF NOT EXISTS idx_turns_conversation ON turns(conversation_id, turn_number);

CREATE TABLE IF NOT EXISTS messages (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    turn_id             UUID REFERENCES turns(id) ON DELETE CASCADE,
    role                TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    input_mode          TEXT CHECK (input_mode IN ('text', 'audio')),
    text_content        TEXT,
    language_code       TEXT CHECK (language_code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
    token_count         INT,
    model_name          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_turn_id ON messages(turn_id);

-- =========================
-- 4) AUDIO ASSETS
-- =========================

CREATE TABLE IF NOT EXISTS audio_assets (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id          UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    audio_type          TEXT NOT NULL CHECK (audio_type IN ('user_input', 'assistant_tts')),
    storage_provider    TEXT NOT NULL
                            CHECK (storage_provider IN ('local','s3','azure_blob','gcs','minio')),
    storage_key         TEXT NOT NULL,
    public_url          TEXT,
    mime_type           TEXT,
    duration_ms         INT,
    sample_rate_hz      INT,
    size_bytes          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (message_id, audio_type)
);

CREATE INDEX IF NOT EXISTS idx_audio_assets_message_id ON audio_assets(message_id);

-- =========================
-- 5) PRONUNCIATION ASSESSMENT
-- =========================

CREATE TABLE IF NOT EXISTS pronunciation_assessments (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id              UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    reference_text          TEXT,
    recognized_text         TEXT,
    overall_score           NUMERIC(5,2),
    accuracy_score          NUMERIC(5,2),
    fluency_score           NUMERIC(5,2),
    completeness_score      NUMERIC(5,2),
    prosody_score           NUMERIC(5,2),
    error_rate              NUMERIC(6,3),
    azure_request_id        TEXT,
    raw_result_json         JSONB NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pron_assessment_message
    ON pronunciation_assessments(message_id);
CREATE INDEX IF NOT EXISTS idx_pron_assessments_created
    ON pronunciation_assessments(created_at);

CREATE TABLE IF NOT EXISTS pronunciation_word_details (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id           UUID NOT NULL REFERENCES pronunciation_assessments(id) ON DELETE CASCADE,
    word_index              INT NOT NULL,
    word                    TEXT NOT NULL,
    accuracy_score          NUMERIC(5,2),
    error_type              TEXT CHECK (error_type IN (
                                'None','Omission','Insertion','Mispronunciation',
                                'UnexpectedBreak','MissingBreak','Monotone')),
    start_ms                INT,
    duration_ms             INT
);

CREATE INDEX IF NOT EXISTS idx_pron_word_assessment ON pronunciation_word_details(assessment_id);

-- =========================
-- 6) AGENT FEEDBACK
-- =========================

CREATE TABLE IF NOT EXISTS agent_feedback (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    turn_id                 UUID NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
    summary                 TEXT,
    grammar_feedback        TEXT,
    pronunciation_feedback  TEXT,
    vocabulary_feedback     TEXT,
    next_tip                TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (turn_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_feedback_turn_id ON agent_feedback(turn_id);

-- =========================
-- 7) DAILY PROGRESS
-- =========================

CREATE TABLE IF NOT EXISTS daily_progress (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date                    DATE NOT NULL,
    total_turns             INT NOT NULL DEFAULT 0,
    minutes_spoken          INT NOT NULL DEFAULT 0,
    avg_overall_score       NUMERIC(5,2) CHECK (avg_overall_score  BETWEEN 0 AND 100),
    avg_fluency_score       NUMERIC(5,2) CHECK (avg_fluency_score   BETWEEN 0 AND 100),
    avg_accuracy_score      NUMERIC(5,2) CHECK (avg_accuracy_score  BETWEEN 0 AND 100),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, date)
);

CREATE TRIGGER trg_daily_progress_updated_at
    BEFORE UPDATE ON daily_progress
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_daily_progress_user_date
    ON daily_progress(user_id, date DESC);

-- =========================
-- 8) GUARDRAILS — AUDIT LOGS (DISABLED — set AUDIT_DB_ENABLED=true to activate)
-- =========================

-- CREATE TABLE IF NOT EXISTS audit_logs (
--     id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     user_id              UUID,
--     conversation_id      UUID,
--     user_input_hash      TEXT NOT NULL,
--     response_text_hash   TEXT NOT NULL,
--     flags                JSONB NOT NULL DEFAULT '[]',
--     guardrail_decisions  JSONB NOT NULL DEFAULT '{}',
--     latency_ms           INTEGER,
--     created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
-- CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs(user_id);
-- CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
```

- [ ] **Step 4: Apply the new schema to a clean database**

```bash
# Drop and recreate test DB (adjust DB name to your local setup)
psql postgres -c "DROP DATABASE IF EXISTS english_agent_test;"
psql postgres -c "CREATE DATABASE english_agent_test;"
psql english_agent_test -f db_schema/schema.sql
```

Expected output: no errors. Final line should be `CREATE INDEX`.

- [ ] **Step 5: Verify CHECK constraints reject invalid values**

```sql
-- Connect: psql english_agent_test

-- 1. english_level rejects invalid CEFR
INSERT INTO users (email, password_hash, english_level)
  VALUES ('bad@x.com', 'h', 'INVALID');
-- Expected: ERROR: new row violates check constraint "users_english_level_check"

-- 2. conversations.status rejects unknown status
INSERT INTO users (email, password_hash) VALUES ('u@x.com', 'h') RETURNING id \gset
INSERT INTO conversations (user_id, status) VALUES (:'id', 'BOGUS');
-- Expected: ERROR: new row violates check constraint "conversations_status_check"

-- 3. audio_assets rejects unknown storage_provider
-- (need a message first — just verify the constraint exists)
SELECT conname FROM pg_constraint
  WHERE conrelid = 'audio_assets'::regclass AND contype = 'c';
-- Expected: rows including "audio_assets_storage_provider_check"

-- 4. agent_feedback UNIQUE on turn_id
SELECT indexname FROM pg_indexes
  WHERE tablename = 'agent_feedback' AND indexdef LIKE '%UNIQUE%';
-- Expected: a row with unique index on turn_id

-- 5. updated_at trigger fires on users UPDATE
INSERT INTO users (email, password_hash) VALUES ('trig@x.com', 'h') RETURNING id \gset
SELECT updated_at AS before FROM users WHERE id = :'id';
UPDATE users SET display_name = 'Test' WHERE id = :'id';
SELECT updated_at AS after FROM users WHERE id = :'id';
-- Expected: after > before
```

Run: `psql english_agent_test` then paste the SQL above.

- [ ] **Step 6: Commit schema**

```bash
git add db_schema/schema.sql
git commit -m "feat(db): reconstruct schema — add categories, triggers, CHECK constraints, fix anti-patterns"
```

---

## Task 2: Rewrite seed.sql

**Files:**
- Modify: `db_schema/seed.sql` (full rewrite)

- [ ] **Step 1: Rewrite `db_schema/seed.sql` with the full new seed data**

Replace the entire file with:

```sql
-- =========================
-- SEED DATA
-- =========================

-- =========================
-- Categories (10)
-- =========================

INSERT INTO categories (id, code, title, sort_order) VALUES
  ('ca000000-0000-0000-0000-000000000001', 'ielts',         'IELTS Speaking',              1),
  ('ca000000-0000-0000-0000-000000000002', 'business',      'Business & Career',           2),
  ('ca000000-0000-0000-0000-000000000003', 'daily',         'Daily Life',                  3),
  ('ca000000-0000-0000-0000-000000000004', 'travel',        'Travel & Culture',            4),
  ('ca000000-0000-0000-0000-000000000005', 'academic',      'Academic & Education',        5),
  ('ca000000-0000-0000-0000-000000000006', 'health',        'Health & Wellness',           6),
  ('ca000000-0000-0000-0000-000000000007', 'technology',    'Technology & Innovation',     7),
  ('ca000000-0000-0000-0000-000000000008', 'social',        'Social Life & Relationships', 8),
  ('ca000000-0000-0000-0000-000000000009', 'environment',   'Environment & Society',       9),
  ('ca000000-0000-0000-0000-000000000010', 'entertainment', 'Entertainment & Media',      10)
ON CONFLICT (code) DO UPDATE SET
  title      = EXCLUDED.title,
  sort_order = EXCLUDED.sort_order;

-- =========================
-- Topics (64)
-- =========================

INSERT INTO topics (id, category_id, code, title, description, difficulty_level, sort_order) VALUES

  -- IELTS Speaking (7)
  ('t0000000-0000-0000-0000-000000000001','ca000000-0000-0000-0000-000000000001',
   'ielts_part1','Part 1: Personal Questions',
   'Answer questions about yourself, your life, and familiar topics',
   'beginner', 1),
  ('t0000000-0000-0000-0000-000000000002','ca000000-0000-0000-0000-000000000001',
   'ielts_part2','Part 2: Long Turn / Cue Card',
   'Speak for 1–2 minutes on a given topic using a cue card',
   'intermediate', 2),
  ('t0000000-0000-0000-0000-000000000003','ca000000-0000-0000-0000-000000000001',
   'ielts_part3','Part 3: Abstract Discussion',
   'Discuss abstract ideas and issues related to the Part 2 topic',
   'advanced', 3),
  ('t0000000-0000-0000-0000-000000000004','ca000000-0000-0000-0000-000000000001',
   'ielts_describe_person','Describe a Person',
   'Describe someone important or interesting in your life',
   'intermediate', 4),
  ('t0000000-0000-0000-0000-000000000005','ca000000-0000-0000-0000-000000000001',
   'ielts_describe_place','Describe a Place',
   'Describe a location you have visited or would like to visit',
   'intermediate', 5),
  ('t0000000-0000-0000-0000-000000000006','ca000000-0000-0000-0000-000000000001',
   'ielts_describe_event','Describe an Event',
   'Describe a memorable event or celebration',
   'intermediate', 6),
  ('t0000000-0000-0000-0000-000000000007','ca000000-0000-0000-0000-000000000001',
   'ielts_describe_object','Describe an Object',
   'Describe an object that is important or meaningful to you',
   'intermediate', 7),

  -- Business & Career (7)
  ('t0000000-0000-0000-0000-000000000008','ca000000-0000-0000-0000-000000000002',
   'business_job_interview','Job Interview',
   'Practice common interview questions and professional self-presentation',
   'intermediate', 1),
  ('t0000000-0000-0000-0000-000000000009','ca000000-0000-0000-0000-000000000002',
   'business_meeting','Office Meeting & Collaboration',
   'Participate in meetings, give updates, and discuss projects',
   'intermediate', 2),
  ('t0000000-0000-0000-0000-000000000010','ca000000-0000-0000-0000-000000000002',
   'business_presentation','Presentations & Public Speaking',
   'Deliver structured presentations and handle Q&A',
   'intermediate', 3),
  ('t0000000-0000-0000-0000-000000000011','ca000000-0000-0000-0000-000000000002',
   'business_negotiation','Negotiation & Persuasion',
   'Negotiate deals, manage disagreements, and persuade stakeholders',
   'advanced', 4),
  ('t0000000-0000-0000-0000-000000000012','ca000000-0000-0000-0000-000000000002',
   'business_networking','Professional Networking',
   'Introduce yourself, build rapport, and exchange information professionally',
   'intermediate', 5),
  ('t0000000-0000-0000-0000-000000000013','ca000000-0000-0000-0000-000000000002',
   'business_performance_review','Performance Review',
   'Discuss goals, achievements, and areas for improvement with a manager',
   'advanced', 6),
  ('t0000000-0000-0000-0000-000000000014','ca000000-0000-0000-0000-000000000002',
   'business_leadership','Leadership & Management',
   'Discuss leadership styles, team management, and strategic decisions',
   'advanced', 7),

  -- Daily Life (7)
  ('t0000000-0000-0000-0000-000000000015','ca000000-0000-0000-0000-000000000003',
   'daily_greetings','Greetings & Small Talk',
   'Start conversations, introduce yourself, and chat about everyday topics',
   'beginner', 1),
  ('t0000000-0000-0000-0000-000000000016','ca000000-0000-0000-0000-000000000003',
   'daily_shopping','Shopping & Customer Service',
   'Ask for help, compare products, and handle purchases',
   'beginner', 2),
  ('t0000000-0000-0000-0000-000000000017','ca000000-0000-0000-0000-000000000003',
   'daily_healthcare','Healthcare & Medical',
   'Describe symptoms, follow medical advice, and communicate with healthcare staff',
   'intermediate', 3),
  ('t0000000-0000-0000-0000-000000000018','ca000000-0000-0000-0000-000000000003',
   'daily_family','Family & Relationships',
   'Talk about family members, relationships, and personal life',
   'beginner', 4),
  ('t0000000-0000-0000-0000-000000000019','ca000000-0000-0000-0000-000000000003',
   'daily_hobbies','Hobbies & Free Time',
   'Describe interests, pastimes, and leisure activities',
   'beginner', 5),
  ('t0000000-0000-0000-0000-000000000020','ca000000-0000-0000-0000-000000000003',
   'daily_housing','Housing & Neighborhood',
   'Describe your home, discuss renting/buying, and talk about your area',
   'beginner', 6),
  ('t0000000-0000-0000-0000-000000000021','ca000000-0000-0000-0000-000000000003',
   'daily_cooking','Food & Cooking at Home',
   'Discuss recipes, cooking methods, and food preferences',
   'beginner', 7),

  -- Travel & Culture (7)
  ('t0000000-0000-0000-0000-000000000022','ca000000-0000-0000-0000-000000000004',
   'travel_planning','Travel Planning & Booking',
   'Plan trips, book tickets and accommodation, and compare travel options',
   'intermediate', 1),
  ('t0000000-0000-0000-0000-000000000023','ca000000-0000-0000-0000-000000000004',
   'travel_restaurant','Restaurants & Dining Out',
   'Order food, ask about the menu, and interact with restaurant staff',
   'beginner', 2),
  ('t0000000-0000-0000-0000-000000000024','ca000000-0000-0000-0000-000000000004',
   'travel_hotel','Hotel & Accommodation',
   'Check in, make requests, handle complaints, and check out',
   'intermediate', 3),
  ('t0000000-0000-0000-0000-000000000025','ca000000-0000-0000-0000-000000000004',
   'travel_airport','Airport & Transportation',
   'Navigate airports, buy tickets, and use public transport',
   'beginner', 4),
  ('t0000000-0000-0000-0000-000000000026','ca000000-0000-0000-0000-000000000004',
   'travel_sightseeing','Sightseeing & Tourism',
   'Ask for directions, learn about attractions, and discuss experiences',
   'beginner', 5),
  ('t0000000-0000-0000-0000-000000000027','ca000000-0000-0000-0000-000000000004',
   'travel_culture','Cultural Differences & Customs',
   'Discuss traditions, etiquette, and cross-cultural observations',
   'intermediate', 6),
  ('t0000000-0000-0000-0000-000000000028','ca000000-0000-0000-0000-000000000004',
   'travel_emergency','Lost & Emergency Situations',
   'Ask for help when lost, report problems, and handle unexpected situations',
   'intermediate', 7),

  -- Academic & Education (6)
  ('t0000000-0000-0000-0000-000000000029','ca000000-0000-0000-0000-000000000005',
   'academic_classroom','Classroom Discussion',
   'Participate in seminars, ask questions, and debate academic ideas',
   'intermediate', 1),
  ('t0000000-0000-0000-0000-000000000030','ca000000-0000-0000-0000-000000000005',
   'academic_research','Research & Thesis Defense',
   'Present research findings and respond to critical questions',
   'advanced', 2),
  ('t0000000-0000-0000-0000-000000000031','ca000000-0000-0000-0000-000000000005',
   'academic_study_abroad','Study Abroad Experience',
   'Talk about studying in another country and adapting to a new environment',
   'intermediate', 3),
  ('t0000000-0000-0000-0000-000000000032','ca000000-0000-0000-0000-000000000005',
   'academic_presentations','Academic Presentations',
   'Deliver structured academic talks with clear introduction and conclusion',
   'advanced', 4),
  ('t0000000-0000-0000-0000-000000000033','ca000000-0000-0000-0000-000000000005',
   'academic_campus','Campus Life & Student Issues',
   'Discuss university life, accommodation, and student challenges',
   'intermediate', 5),
  ('t0000000-0000-0000-0000-000000000034','ca000000-0000-0000-0000-000000000005',
   'academic_online','Online Learning & EdTech',
   'Discuss e-learning platforms, remote study, and digital education trends',
   'beginner', 6),

  -- Health & Wellness (6)
  ('t0000000-0000-0000-0000-000000000035','ca000000-0000-0000-0000-000000000006',
   'health_doctor','Doctor & Hospital Visit',
   'Describe symptoms, understand diagnoses, and follow medical instructions',
   'intermediate', 1),
  ('t0000000-0000-0000-0000-000000000036','ca000000-0000-0000-0000-000000000006',
   'health_mental','Mental Health & Wellbeing',
   'Discuss stress, anxiety, and strategies for emotional wellbeing',
   'intermediate', 2),
  ('t0000000-0000-0000-0000-000000000037','ca000000-0000-0000-0000-000000000006',
   'health_diet','Diet & Nutrition Advice',
   'Talk about healthy eating, dietary choices, and food habits',
   'beginner', 3),
  ('t0000000-0000-0000-0000-000000000038','ca000000-0000-0000-0000-000000000006',
   'health_exercise','Exercise & Fitness',
   'Describe workout routines, fitness goals, and sports activities',
   'beginner', 4),
  ('t0000000-0000-0000-0000-000000000039','ca000000-0000-0000-0000-000000000006',
   'health_stress','Stress & Work-Life Balance',
   'Discuss burnout, time management, and maintaining balance',
   'intermediate', 5),
  ('t0000000-0000-0000-0000-000000000040','ca000000-0000-0000-0000-000000000006',
   'health_public','Public Health & Epidemics',
   'Discuss health policies, disease prevention, and global health issues',
   'advanced', 6),

  -- Technology & Innovation (6)
  ('t0000000-0000-0000-0000-000000000041','ca000000-0000-0000-0000-000000000007',
   'tech_social_media','Social Media & Internet Culture',
   'Discuss platforms, online behaviour, and digital communication',
   'beginner', 1),
  ('t0000000-0000-0000-0000-000000000042','ca000000-0000-0000-0000-000000000007',
   'tech_ai','Artificial Intelligence & Future',
   'Discuss AI trends, automation, and the future of work',
   'advanced', 2),
  ('t0000000-0000-0000-0000-000000000043','ca000000-0000-0000-0000-000000000007',
   'tech_gadgets','Gadgets & Devices',
   'Compare products, describe features, and discuss consumer tech',
   'beginner', 3),
  ('t0000000-0000-0000-0000-000000000044','ca000000-0000-0000-0000-000000000007',
   'tech_cybersecurity','Cybersecurity & Privacy',
   'Discuss online safety, data privacy, and digital threats',
   'advanced', 4),
  ('t0000000-0000-0000-0000-000000000045','ca000000-0000-0000-0000-000000000007',
   'tech_ecommerce','E-commerce & Digital Life',
   'Discuss online shopping, digital payments, and platform economies',
   'intermediate', 5),
  ('t0000000-0000-0000-0000-000000000046','ca000000-0000-0000-0000-000000000007',
   'tech_gaming','Gaming & Virtual Reality',
   'Talk about video games, esports, and immersive digital experiences',
   'intermediate', 6),

  -- Social Life & Relationships (6)
  ('t0000000-0000-0000-0000-000000000047','ca000000-0000-0000-0000-000000000008',
   'social_friendship','Friendship & Social Circles',
   'Talk about making friends, social groups, and maintaining relationships',
   'beginner', 1),
  ('t0000000-0000-0000-0000-000000000048','ca000000-0000-0000-0000-000000000008',
   'social_dating','Dating & Romance',
   'Discuss relationships, dating culture, and personal expectations',
   'intermediate', 2),
  ('t0000000-0000-0000-0000-000000000049','ca000000-0000-0000-0000-000000000008',
   'social_conflict','Conflict Resolution',
   'Navigate disagreements, apologise effectively, and find compromise',
   'intermediate', 3),
  ('t0000000-0000-0000-0000-000000000050','ca000000-0000-0000-0000-000000000008',
   'social_peer_pressure','Peer Pressure & Boundaries',
   'Discuss setting limits, saying no, and assertive communication',
   'intermediate', 4),
  ('t0000000-0000-0000-0000-000000000051','ca000000-0000-0000-0000-000000000008',
   'social_cross_cultural','Cross-Cultural Friendships',
   'Talk about navigating cultural differences in personal relationships',
   'intermediate', 5),
  ('t0000000-0000-0000-0000-000000000052','ca000000-0000-0000-0000-000000000008',
   'social_community','Community & Volunteering',
   'Discuss local community involvement and charitable activities',
   'beginner', 6),

  -- Environment & Society (6)
  ('t0000000-0000-0000-0000-000000000053','ca000000-0000-0000-0000-000000000009',
   'env_climate','Climate Change & Environment',
   'Discuss environmental issues, climate science, and global impact',
   'advanced', 1),
  ('t0000000-0000-0000-0000-000000000054','ca000000-0000-0000-0000-000000000009',
   'env_sustainable','Sustainable Living',
   'Talk about eco-friendly habits, recycling, and green choices',
   'intermediate', 2),
  ('t0000000-0000-0000-0000-000000000055','ca000000-0000-0000-0000-000000000009',
   'env_social_issues','Social Issues & Inequality',
   'Discuss poverty, discrimination, and systemic social challenges',
   'advanced', 3),
  ('t0000000-0000-0000-0000-000000000056','ca000000-0000-0000-0000-000000000009',
   'env_immigration','Immigration & Identity',
   'Talk about migration, cultural identity, and belonging',
   'advanced', 4),
  ('t0000000-0000-0000-0000-000000000057','ca000000-0000-0000-0000-000000000009',
   'env_urban_rural','Urban vs Rural Life',
   'Compare city and countryside living, pros and cons',
   'intermediate', 5),
  ('t0000000-0000-0000-0000-000000000058','ca000000-0000-0000-0000-000000000009',
   'env_politics','Politics & Current Events',
   'Discuss news, political systems, and civic responsibility',
   'advanced', 6),

  -- Entertainment & Media (6)
  ('t0000000-0000-0000-0000-000000000059','ca000000-0000-0000-0000-000000000010',
   'ent_movies','Movies & TV Shows',
   'Review films and series, discuss genres and recommendations',
   'beginner', 1),
  ('t0000000-0000-0000-0000-000000000060','ca000000-0000-0000-0000-000000000010',
   'ent_music','Music & Concerts',
   'Talk about music genres, artists, and live performances',
   'beginner', 2),
  ('t0000000-0000-0000-0000-000000000061','ca000000-0000-0000-0000-000000000010',
   'ent_books','Books & Literature',
   'Discuss books, authors, and reading habits',
   'intermediate', 3),
  ('t0000000-0000-0000-0000-000000000062','ca000000-0000-0000-0000-000000000010',
   'ent_sports','Sports & Competition',
   'Discuss teams, sporting events, and athletic achievement',
   'beginner', 4),
  ('t0000000-0000-0000-0000-000000000063','ca000000-0000-0000-0000-000000000010',
   'ent_celebrities','Celebrities & Pop Culture',
   'Discuss famous people, trends, and popular culture',
   'beginner', 5),
  ('t0000000-0000-0000-0000-000000000064','ca000000-0000-0000-0000-000000000010',
   'ent_news','News & Current Events',
   'Summarise news stories and discuss their significance',
   'intermediate', 6)

ON CONFLICT (code) DO UPDATE SET
  title            = EXCLUDED.title,
  description      = EXCLUDED.description,
  difficulty_level = EXCLUDED.difficulty_level,
  sort_order       = EXCLUDED.sort_order,
  category_id      = EXCLUDED.category_id;

-- =========================
-- Users (password_hash = bcrypt of "Password123!")
-- =========================

INSERT INTO users (id, email, password_hash, display_name, english_level) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'alice@example.com',
   '$2b$12$olq2Re/lfTVN2w4pr.ZZp.b4TcVjeKKKJy2.kKTUrdJBdOK27g0.q', 'Alice Nguyen', 'B1'),
  ('a1000000-0000-0000-0000-000000000002', 'bob@example.com',
   '$2b$12$olq2Re/lfTVN2w4pr.ZZp.b4TcVjeKKKJy2.kKTUrdJBdOK27g0.q', 'Bob Tran', 'A2'),
  ('a1000000-0000-0000-0000-000000000003', 'charlie@example.com',
   '$2b$12$olq2Re/lfTVN2w4pr.ZZp.b4TcVjeKKKJy2.kKTUrdJBdOK27g0.q', 'Charlie Le', 'B2')
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  display_name  = EXCLUDED.display_name,
  english_level = EXCLUDED.english_level,
  updated_at    = NOW();

-- =========================
-- User topic preferences
-- =========================

INSERT INTO user_topic_preferences (user_id, topic_id, proficiency_score, last_practiced_at) VALUES
  ('a1000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000015', 72.5, NOW() - INTERVAL '1 day'),
  ('a1000000-0000-0000-0000-000000000001', 't0000000-0000-0000-0000-000000000008', 58.0, NOW() - INTERVAL '3 days'),
  ('a1000000-0000-0000-0000-000000000002', 't0000000-0000-0000-0000-000000000015', 45.0, NOW() - INTERVAL '2 days'),
  ('a1000000-0000-0000-0000-000000000002', 't0000000-0000-0000-0000-000000000022', 60.0, NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- =========================
-- Conversations (updated topic_id references)
-- =========================

INSERT INTO conversations (id, user_id, topic_id, title, status, started_at, ended_at) VALUES
  ('c1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   't0000000-0000-0000-0000-000000000015',
   'Session 1 - Greetings Practice', 'completed',
   NOW() - INTERVAL '2 days',
   NOW() - INTERVAL '2 days' + INTERVAL '20 minutes'),
  ('c1000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001',
   't0000000-0000-0000-0000-000000000008',
   'Session 2 - Interview Prep', 'active',
   NOW() - INTERVAL '1 hour', NULL),
  ('c1000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-000000000002',
   't0000000-0000-0000-0000-000000000025',
   'Session 1 - Travel Phrases', 'completed',
   NOW() - INTERVAL '3 days',
   NOW() - INTERVAL '3 days' + INTERVAL '15 minutes')
ON CONFLICT DO NOTHING;

-- =========================
-- Turns
-- =========================

INSERT INTO turns (id, conversation_id, turn_number) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 1),
  ('d1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 2),
  ('d1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', 1),
  ('d1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000003', 1),
  ('d1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000003', 2)
ON CONFLICT DO NOTHING;

-- =========================
-- Messages
-- =========================

INSERT INTO messages (id, conversation_id, turn_id, role, input_mode, text_content, language_code, token_count, model_name) VALUES
  ('e1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
   'user', 'audio', 'Hello, my name is Alice. Nice to meet you!', 'en-US', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
   'assistant', 'text', 'Great to meet you too, Alice! Your greeting sounded natural. Let''s practice more!',
   'en-US', 22, 'llama-3.3-70b-versatile'),
  ('e1000000-0000-0000-0000-000000000003',
   'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002',
   'user', 'audio', 'Can you tell me about your hobbies?', 'en-US', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000004',
   'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002',
   'assistant', 'text', 'I enjoy reading and hiking. What about you? Try using "I am interested in..." to sound more natural.',
   'en-US', 28, 'llama-3.3-70b-versatile'),
  ('e1000000-0000-0000-0000-000000000005',
   'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000003',
   'user', 'text', 'Tell me about yourself.', 'en-US', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000006',
   'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000003',
   'assistant', 'text', 'Good start! When answering this in an interview, structure it as: present, past, future.',
   'en-US', 35, 'llama-3.3-70b-versatile'),
  ('e1000000-0000-0000-0000-000000000007',
   'c1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000004',
   'user', 'audio', 'Excuse me, where is the nearest hotel?', 'en-US', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000008',
   'c1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000004',
   'assistant', 'text', 'Well done! Your pronunciation was clear. A more formal option: "Could you direct me to the nearest hotel, please?"',
   'en-US', 25, 'llama-3.3-70b-versatile')
ON CONFLICT DO NOTHING;

-- =========================
-- Audio assets
-- =========================

INSERT INTO audio_assets (message_id, audio_type, storage_provider, storage_key, mime_type, duration_ms, size_bytes) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'user_input',    'local', 'audio/conv1/turn1_user.wav',      'audio/wav',  3200, 51200),
  ('e1000000-0000-0000-0000-000000000002', 'assistant_tts', 'local', 'audio/conv1/turn1_assistant.mp3', 'audio/mpeg', 4100, 65600),
  ('e1000000-0000-0000-0000-000000000003', 'user_input',    'local', 'audio/conv1/turn2_user.wav',      'audio/wav',  2800, 44800),
  ('e1000000-0000-0000-0000-000000000007', 'user_input',    'local', 'audio/conv3/turn1_user.wav',      'audio/wav',  3500, 56000)
ON CONFLICT DO NOTHING;

-- =========================
-- Pronunciation assessments
-- =========================

INSERT INTO pronunciation_assessments
  (message_id, reference_text, recognized_text,
   overall_score, accuracy_score, fluency_score, completeness_score, prosody_score,
   error_rate, raw_result_json)
VALUES
  ('e1000000-0000-0000-0000-000000000001',
   'Hello, my name is Alice. Nice to meet you!',
   'Hello, my name is Alice. Nice to meet you!',
   82.5, 85.0, 80.0, 100.0, 78.5, 0.02,
   '{"NBest":[{"PronunciationAssessment":{"AccuracyScore":85.0,"FluencyScore":80.0,"CompletenessScore":100.0,"PronScore":82.5}}]}'::jsonb),
  ('e1000000-0000-0000-0000-000000000003',
   'Can you tell me about your hobbies?',
   'Can you tell me about your hobbies?',
   74.0, 76.5, 72.0, 100.0, 71.0, 0.05,
   '{"NBest":[{"PronunciationAssessment":{"AccuracyScore":76.5,"FluencyScore":72.0,"CompletenessScore":100.0,"PronScore":74.0}}]}'::jsonb),
  ('e1000000-0000-0000-0000-000000000007',
   'Excuse me, where is the nearest hotel?',
   'Excuse me, where is the nearest hotel?',
   88.0, 90.0, 86.5, 100.0, 84.0, 0.01,
   '{"NBest":[{"PronunciationAssessment":{"AccuracyScore":90.0,"FluencyScore":86.5,"CompletenessScore":100.0,"PronScore":88.0}}]}'::jsonb)
ON CONFLICT DO NOTHING;

-- =========================
-- Pronunciation word details (word_index added)
-- =========================

INSERT INTO pronunciation_word_details (assessment_id, word_index, word, accuracy_score, error_type, start_ms, duration_ms)
SELECT a.id, w.word_index, w.word, w.accuracy_score, w.error_type, w.start_ms, w.duration_ms
FROM pronunciation_assessments a,
(VALUES
  (1, 'Hello',  95.0, 'None', 0,    320),
  (2, 'my',     98.0, 'None', 380,  150),
  (3, 'name',   92.0, 'None', 580,  280),
  (4, 'is',     97.0, 'None', 920,  120),
  (5, 'Alice',  88.0, 'None', 1100, 400),
  (6, 'Nice',   85.0, 'None', 1600, 300),
  (7, 'to',     99.0, 'None', 1960, 100),
  (8, 'meet',   90.0, 'None', 2120, 350),
  (9, 'you',    93.0, 'None', 2530, 280)
) AS w(word_index, word, accuracy_score, error_type, start_ms, duration_ms)
WHERE a.message_id = 'e1000000-0000-0000-0000-000000000001';

-- =========================
-- Agent feedback
-- =========================

INSERT INTO agent_feedback (turn_id, summary, grammar_feedback, pronunciation_feedback, vocabulary_feedback, next_tip) VALUES
  ('d1000000-0000-0000-0000-000000000001',
   'Great opening! Your greeting was confident and clear.',
   'Grammar is correct. Try adding "It''s a pleasure to meet you" for variety.',
   'Score: 82.5/100. "Alice" pronunciation was slightly flat — stress the first syllable more.',
   'Good use of "Nice to meet you". Also try: "Pleased to meet you", "How do you do?"',
   'Practice introducing someone else: "This is my colleague, [name]."'),
  ('d1000000-0000-0000-0000-000000000004',
   'Solid question — good job!',
   'Consider "Could you tell me..." for a more polite register.',
   'Score: 74/100. Work on sentence-final intonation — questions should rise at the end.',
   '"Tell me about" is natural. Also try: "I''d love to hear about your hobbies."',
   'Practice 3 follow-up questions using "What", "How", "Why".')
ON CONFLICT DO NOTHING;

-- =========================
-- Daily progress
-- =========================

INSERT INTO daily_progress (user_id, date, total_turns, minutes_spoken, avg_overall_score, avg_fluency_score, avg_accuracy_score) VALUES
  ('a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 7,  3, 8,  68.0, 65.0, 70.0),
  ('a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 6,  5, 12, 71.5, 69.0, 73.5),
  ('a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 5,  4, 10, 70.0, 68.0, 72.0),
  ('a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 4,  6, 15, 74.5, 72.0, 76.5),
  ('a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 3,  8, 18, 76.0, 74.5, 78.0),
  ('a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 2,  4, 9,  78.3, 76.0, 80.0),
  ('a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 1,  7, 16, 80.5, 78.5, 82.0),
  ('a1000000-0000-0000-0000-000000000002', CURRENT_DATE - 3,  3, 7,  55.0, 52.0, 58.0),
  ('a1000000-0000-0000-0000-000000000002', CURRENT_DATE - 2,  4, 9,  60.5, 58.0, 63.0),
  ('a1000000-0000-0000-0000-000000000002', CURRENT_DATE - 1,  5, 11, 63.0, 60.5, 65.5)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Apply seed to the test database**

```bash
psql english_agent_test -f db_schema/seed.sql
```

Expected output: no errors. Last lines should be `INSERT 0 10` (daily_progress rows).

- [ ] **Step 3: Verify seed data is correct**

```sql
-- Connect: psql english_agent_test

-- 10 categories in order
SELECT sort_order, code, title FROM categories ORDER BY sort_order;
-- Expected: 10 rows, sort_order 1–10, correct codes

-- 64 topics, each with a valid category_id
SELECT c.code AS category, COUNT(t.id) AS topic_count
FROM categories c
JOIN topics t ON t.category_id = c.id
GROUP BY c.code, c.sort_order
ORDER BY c.sort_order;
-- Expected: 10 rows — ielts=7, business=7, daily=7, travel=7,
--   academic=6, health=6, technology=6, social=6, environment=6, entertainment=6

-- Conversations reference valid topic codes
SELECT conv.title, t.code AS topic_code
FROM conversations conv
JOIN topics t ON t.id = conv.topic_id;
-- Expected: 3 rows with topic codes daily_greetings, business_job_interview, travel_airport

-- Category history query (the main query from the spec)
SELECT c.code, COUNT(conv.id) AS sessions
FROM categories c
JOIN topics t ON t.category_id = c.id
JOIN conversations conv ON conv.topic_id = t.id
GROUP BY c.code;
-- Expected: daily=1, business=1, travel=1
```

- [ ] **Step 4: Commit seed**

```bash
git add db_schema/seed.sql
git commit -m "feat(db): reseed 10 categories and 64 topics with stable UUIDs"
```

---

## Task 3: Verify backend compatibility

**Files:**
- Read-only: `app/api/conversations.py`
- Read-only: `app/api/chat.py`

- [ ] **Step 1: Confirm no reference to conversations.created_at**

```bash
grep -n "created_at" app/api/conversations.py app/api/chat.py
```

Expected: matches are `messages.created_at` and `m.created_at` only — no bare `conversations.created_at` or `c.created_at`.

- [ ] **Step 2: Confirm storage_provider 'minio' is covered by the new CHECK**

```bash
grep -n "storage_provider\|'minio'" app/api/chat.py
```

Expected: line 91 shows `'minio'` — this value is included in the schema CHECK (`'local','s3','azure_blob','gcs','minio'`), so no code change is needed.

- [ ] **Step 3: Confirm updated_at manual set is still valid with trigger**

```sql
-- psql english_agent_test
-- The trigger fires on every UPDATE. The explicit SET updated_at = NOW() in chat.py
-- is harmless — the trigger overwrites the same value. Verify trigger is present:
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgname LIKE 'trg_%_updated_at';
-- Expected: 4 rows — users, topics, conversations, daily_progress
```

- [ ] **Step 4: Final commit (no code changes needed)**

```bash
git commit --allow-empty -m "chore(db): confirm backend compatibility with reconstructed schema"
```

---

## Done

Apply the new schema and seed to your real database:

```bash
# WARNING: this drops all existing data
psql $DATABASE_URL -f db_schema/schema.sql
psql $DATABASE_URL -f db_schema/seed.sql
```

If your environment uses Docker Compose, restart the DB container after applying the schema:

```bash
docker compose down db && docker compose up -d db
# then apply schema and seed
```
