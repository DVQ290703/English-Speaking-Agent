# Database Reference

**Engine:** PostgreSQL 16
**Extensions:** `uuid-ossp` (UUID generation via `uuid_generate_v4()`), `citext` (case-insensitive text for email columns)

---

## Conventions

| Convention | Detail |
|------------|--------|
| Primary keys | UUID everywhere (`uuid_generate_v4()`) |
| Timestamps | `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` on every table |
| Auto-updated timestamps | `updated_at` on mutable tables, managed by `set_updated_at()` trigger |
| Soft deletes | `is_active BOOLEAN` (users, categories, topics, flashcard tables) or `deleted_at TIMESTAMPTZ` (conversations) |
| Case-insensitive email | `CITEXT` type — `WHERE email = 'ALICE@EXAMPLE.COM'` matches `alice@example.com` |

---

## Schema Files

| File | Purpose |
|------|---------|
| `db_schema/schema.sql` | Full DDL — all tables, indexes, triggers. Run once to initialize. |
| `db_schema/seed.sql` | Sample categories and topics for local development. |

**Apply schema:**
```bash
psql -U <user> -d <database> -f db_schema/schema.sql
psql -U <user> -d <database> -f db_schema/seed.sql
```

Or via Docker Compose — both files are mounted to `/docker-entrypoint-initdb.d/` and run automatically on first start.

---

## Tables

See [`schema.md`](./schema.md) for full column-level reference.

**22 active tables** across 10 functional groups:

### 1 — Users & Auth
| Table | Description |
|-------|-------------|
| `users` | Core user accounts (email/password and OAuth) |
| `password_reset_tokens` | Short-lived tokens for password recovery |
| `auth_sessions` | Refresh-token sessions, one per user+device |
| `oauth_accounts` | Linked OAuth provider identities (Google, Microsoft, Facebook) |

### 2 — Categories & Topics
| Table | Description |
|-------|-------------|
| `categories` | Top-level topic groupings (e.g. IELTS Part 1) |
| `topics` | Individual conversation topics within a category |
| `user_topic_preferences` | Per-user proficiency scores and practice counts per topic |

### 3 — Conversations / Turns / Messages
| Table | Description |
|-------|-------------|
| `conversations` | A single coaching session (active, completed, or abandoned) |
| `turns` | One exchange (user speaks + assistant replies) within a conversation |
| `messages` | Individual messages belonging to a turn |

### 4 — Audio Assets
| Table | Description |
|-------|-------------|
| `audio_assets` | Uploaded user audio and generated TTS audio, with storage metadata |

### 5 — Pronunciation Assessment
| Table | Description |
|-------|-------------|
| `pronunciation_assessments` | Azure Cognitive Services assessment scores for a message |
| `pronunciation_word_details` | Per-word accuracy and prosody breakdown |
| `pronunciation_syllable_details` | Per-syllable accuracy within a word |
| `pronunciation_phoneme_details` | Per-phoneme accuracy within a word |

### 6 — Agent Feedback
| Table | Description |
|-------|-------------|
| `agent_feedback` | AI-generated coaching feedback for each turn |

### 7 — Daily Progress
| Table | Description |
|-------|-------------|
| `daily_progress` | Aggregated daily stats per user (turns, minutes, average scores) |

### 9 — Grammar Feedback
| Table | Description |
|-------|-------------|
| `grammar_feedback` | Detailed grammar error analysis for a user message |

### 10 — Flashcards
| Table | Description |
|-------|-------------|
| `flashcard_decks` | User-owned flashcard collections |
| `flashcards` | Individual flashcard front/back pairs with tags |
| `flashcard_media` | Image or audio attachments for flashcard sides |
| `flashcard_reviews` | SM-2 spaced-repetition review state per card per user |

---

## Audit Logs (Optional)

The `audit_logs` table is defined in `schema.sql` but **commented out**. To enable:

1. Uncomment the `CREATE TABLE audit_logs` block in `db_schema/schema.sql`
2. Set `AUDIT_DB_ENABLED=true` in the backend environment

When enabled, every request through the guardrail middleware logs: `user_id`, `conversation_id`, input/output hashes, guardrail decisions, and latency.
