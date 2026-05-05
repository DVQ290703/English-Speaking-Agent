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
    CONSTRAINT uq_auth_sessions_user_device UNIQUE (user_id, device_id)
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
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS topics (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id         UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
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
    topic_id            UUID REFERENCES topics(id) ON DELETE SET NULL,
    title               TEXT,
    status              TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','completed','abandoned')),
    cleared_at          TIMESTAMPTZ,
    deleted_at          TIMESTAMPTZ,
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
CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at
    ON conversations(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS turns (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    turn_number         INT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_turns_conv_turn UNIQUE (conversation_id, turn_number)
);

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
    CONSTRAINT uq_audio_assets_message_type UNIQUE (message_id, audio_type)
);

CREATE INDEX IF NOT EXISTS idx_audio_assets_message_id ON audio_assets(message_id);

-- =========================
-- 5) PRONUNCIATION ASSESSMENT
-- =========================

CREATE TABLE IF NOT EXISTS pronunciation_assessments (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id              UUID REFERENCES messages(id) ON DELETE CASCADE,
    user_id                 UUID REFERENCES users(id) ON DELETE CASCADE,
    reference_text          TEXT,
    recognized_text         TEXT,
    recognition_status      TEXT,                              -- e.g. "Success", "NoMatch"
    overall_score           NUMERIC(5,2) CHECK (overall_score      BETWEEN 0 AND 100),
    accuracy_score          NUMERIC(5,2) CHECK (accuracy_score     BETWEEN 0 AND 100),
    fluency_score           NUMERIC(5,2) CHECK (fluency_score      BETWEEN 0 AND 100),
    completeness_score      NUMERIC(5,2) CHECK (completeness_score BETWEEN 0 AND 100),
    prosody_score           NUMERIC(5,2) CHECK (prosody_score      BETWEEN 0 AND 100),
    nbest_confidence        NUMERIC(6,4),                      -- top NBest confidence score
    snr                     NUMERIC(8,3),                      -- signal-to-noise ratio
    offset_ticks            BIGINT,                            -- utterance start (100ns ticks)
    duration_ticks          BIGINT,                            -- utterance duration (100ns ticks)
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
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id               UUID NOT NULL REFERENCES pronunciation_assessments(id) ON DELETE CASCADE,
    word_index                  INT NOT NULL,
    word                        TEXT NOT NULL,
    accuracy_score              NUMERIC(5,2),
    error_type                  TEXT CHECK (error_type IN (
                                    'None','Omission','Insertion','Mispronunciation',
                                    'UnexpectedBreak','MissingBreak','Monotone')),
    offset_ticks                BIGINT,                        -- word start (100ns ticks)
    duration_ticks              BIGINT,                        -- word duration (100ns ticks)
    -- Prosody: break
    break_error_types           TEXT[],                        -- e.g. ["None"] or ["UnexpectedBreak"]
    unexpected_break_confidence NUMERIC(6,4),
    missing_break_confidence    NUMERIC(6,4),
    break_length_ticks          BIGINT,
    -- Prosody: intonation
    intonation_error_types      TEXT[],                        -- e.g. ["Monotone"]
    monotone_confidence         NUMERIC(6,4),
    CONSTRAINT uq_pron_word_position UNIQUE (assessment_id, word_index)
);

CREATE INDEX IF NOT EXISTS idx_pron_word_assessment ON pronunciation_word_details(assessment_id);

CREATE TABLE IF NOT EXISTS pronunciation_syllable_details (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word_detail_id  UUID NOT NULL REFERENCES pronunciation_word_details(id) ON DELETE CASCADE,
    syllable_index  INT NOT NULL,
    syllable        TEXT NOT NULL,                             -- phonetic form, e.g. "tax"
    grapheme        TEXT,                                      -- written form, e.g. "to"
    accuracy_score  NUMERIC(5,2),
    offset_ticks    BIGINT,
    duration_ticks  BIGINT,
    CONSTRAINT uq_pron_syllable_position UNIQUE (word_detail_id, syllable_index)
);

CREATE INDEX IF NOT EXISTS idx_pron_syllable_word ON pronunciation_syllable_details(word_detail_id);

CREATE TABLE IF NOT EXISTS pronunciation_phoneme_details (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word_detail_id  UUID NOT NULL REFERENCES pronunciation_word_details(id) ON DELETE CASCADE,
    phoneme_index   INT NOT NULL,
    phoneme         TEXT NOT NULL,
    accuracy_score  NUMERIC(5,2),
    offset_ticks    BIGINT,
    duration_ticks  BIGINT,
    CONSTRAINT uq_pron_phoneme_position UNIQUE (word_detail_id, phoneme_index)
);

CREATE INDEX IF NOT EXISTS idx_pron_phoneme_word ON pronunciation_phoneme_details(word_detail_id);

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
    CONSTRAINT uq_agent_feedback_turn UNIQUE (turn_id)
);

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
    CONSTRAINT uq_daily_progress_user_date UNIQUE (user_id, date)
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

-- =========================
-- 9) GRAMMAR FEEDBACK
-- =========================

CREATE TABLE IF NOT EXISTS grammar_feedback (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id         UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_input         TEXT        NOT NULL,
    errors             JSONB       NOT NULL DEFAULT '[]',
    corrected_sentence TEXT,
    overall_score      INTEGER,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grammar_feedback_message_id_idx
    ON grammar_feedback(message_id);
