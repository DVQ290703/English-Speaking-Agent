-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- =========================
-- 1) USERS & AUTH
-- =========================

CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               CITEXT UNIQUE NOT NULL,
    password_hash       TEXT NOT NULL,
    display_name        TEXT NOT NULL,
    avatar_url          TEXT,
    english_level       TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

-- =========================
-- 2) TOPICS
-- =========================

CREATE TABLE IF NOT EXISTS topics (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code                TEXT UNIQUE NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    difficulty_level    TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_topic_preferences (
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_id            UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    proficiency_score   NUMERIC(5,2),
    last_practiced_at   TIMESTAMPTZ,
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
    status              TEXT NOT NULL DEFAULT 'active',
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at            TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_started ON conversations(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_topic ON conversations(topic_id);

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
    language_code       TEXT,
    token_count         INT,
    model_name          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_turn_id ON messages(turn_id);

-- =========================
-- 4) AUDIO ASSETS
-- =========================

CREATE TABLE IF NOT EXISTS audio_assets (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id          UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    audio_type          TEXT NOT NULL CHECK (audio_type IN ('user_input', 'assistant_tts')),
    storage_provider    TEXT NOT NULL,
    storage_key         TEXT NOT NULL,
    public_url          TEXT,
    mime_type           TEXT,
    duration_ms         INT,
    sample_rate_hz      INT,
    size_bytes          BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_pron_assessment_message ON pronunciation_assessments(message_id);
CREATE INDEX IF NOT EXISTS idx_pron_assessments_created ON pronunciation_assessments(created_at);

CREATE TABLE IF NOT EXISTS pronunciation_word_details (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id           UUID NOT NULL REFERENCES pronunciation_assessments(id) ON DELETE CASCADE,
    word                    TEXT NOT NULL,
    accuracy_score          NUMERIC(5,2),
    error_type              TEXT,
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
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    avg_overall_score       NUMERIC(5,2),
    avg_fluency_score       NUMERIC(5,2),
    avg_accuracy_score      NUMERIC(5,2),
    UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_progress_user_date ON daily_progress(user_id, date DESC);

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
-- CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
-- CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
