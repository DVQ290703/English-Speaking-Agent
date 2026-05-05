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
