-- db_schema/flashcard_schema.sql
-- Apply after schema.sql (requires set_updated_at() trigger to exist)

-- ========================
-- FLASHCARD DECKS
-- ========================

CREATE TABLE IF NOT EXISTS flashcard_decks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user_id ON flashcard_decks(user_id);

CREATE TRIGGER trg_flashcard_decks_updated_at
    BEFORE UPDATE ON flashcard_decks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========================
-- FLASHCARDS
-- ========================

CREATE TABLE IF NOT EXISTS flashcards (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deck_id     UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    front_text  TEXT NOT NULL,
    back_text   TEXT NOT NULL,
    tags        TEXT[] NOT NULL DEFAULT '{}',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_deck_id ON flashcards(deck_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_user_id ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_tags    ON flashcards USING GIN(tags);

CREATE TRIGGER trg_flashcards_updated_at
    BEFORE UPDATE ON flashcards
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========================
-- FLASHCARD MEDIA
-- ========================

CREATE TABLE IF NOT EXISTS flashcard_media (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id           UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    side              TEXT NOT NULL CHECK (side IN ('front', 'back')),
    media_type        TEXT NOT NULL CHECK (media_type IN ('image', 'audio')),
    storage_provider  TEXT NOT NULL CHECK (storage_provider IN ('local','s3','azure_blob','gcs','minio')),
    storage_key       TEXT NOT NULL,
    public_url        TEXT,
    mime_type         TEXT,
    size_bytes        BIGINT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_media_card_id ON flashcard_media(card_id);

-- ========================
-- FLASHCARD REVIEWS  (SM-2 scheduling state)
-- ========================

CREATE TABLE IF NOT EXISTS flashcard_reviews (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id          UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    due_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    interval_days    INT NOT NULL DEFAULT 1,
    ease_factor      NUMERIC(4,2) NOT NULL DEFAULT 2.5,
    repetitions      INT NOT NULL DEFAULT 0,
    last_rating      TEXT CHECK (last_rating IN ('again','hard','good','easy')),
    last_reviewed_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_flashcard_reviews_card_user UNIQUE (card_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_user_due
    ON flashcard_reviews(user_id, due_date);

CREATE TRIGGER trg_flashcard_reviews_updated_at
    BEFORE UPDATE ON flashcard_reviews
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
