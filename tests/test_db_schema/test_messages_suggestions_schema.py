from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_messages_table_defines_suggestions_jsonb_column():
    schema = (ROOT / "db_schema" / "schema.sql").read_text(encoding="utf-8")
    start = schema.index("CREATE TABLE IF NOT EXISTS messages")
    end = schema.index("CREATE INDEX IF NOT EXISTS idx_messages_conversation_created")
    messages_block = schema[start:end]

    assert "suggestions" in messages_block
    assert "JSONB" in messages_block
    assert "DEFAULT '[]'" in messages_block


def test_seed_adds_suggestions_column_idempotently():
    seed = (ROOT / "db_schema" / "seed.sql").read_text(encoding="utf-8")

    assert "ALTER TABLE messages ADD COLUMN IF NOT EXISTS suggestions JSONB NOT NULL DEFAULT '[]'::jsonb;" in " ".join(seed.split())
