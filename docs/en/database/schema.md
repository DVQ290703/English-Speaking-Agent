# Schema Reference

Full column-level reference for all 22 tables in `db_schema/schema.sql`.

---

## users

Core user accounts. Supports both email/password and OAuth-only users (password_hash may be NULL). Email is CITEXT for case-insensitive matching. Facebook phone-only accounts may have a NULL email.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| email | CITEXT | YES | — | Unique email address; NULL for phone-only OAuth accounts |
| password_hash | TEXT | YES | — | Bcrypt hash; NULL for OAuth-only users |
| display_name | VARCHAR(100) | YES | — | Public display name |
| avatar_url | TEXT | YES | — | Profile picture URL |
| english_level | TEXT | YES | — | Self-reported CEFR level |
| is_active | BOOLEAN | NO | TRUE | Soft-delete flag |
| email_verified | BOOLEAN | NO | FALSE | Whether email has been confirmed |
| email_verified_at | TIMESTAMPTZ | YES | — | Timestamp of email verification |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |
| updated_at | TIMESTAMPTZ | NO | NOW() | Last modification time |

**Constraints:** `UNIQUE (email)`, `CHECK (english_level IN ('A1','A2','B1','B2','C1','C2'))`
**Triggers:** `trg_users_updated_at` — sets `updated_at = NOW()` before every UPDATE

---

## password_reset_tokens

Short-lived tokens issued during password-reset flows. Only the hash is stored; the raw token is sent to the user's email.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| user_id | UUID | NO | — | FK → users(id) ON DELETE CASCADE |
| token_hash | TEXT | NO | — | SHA-256 hash of the raw reset token |
| expires_at | TIMESTAMPTZ | NO | — | Token expiry time |
| used_at | TIMESTAMPTZ | YES | — | Set when token is consumed |
| revoked_at | TIMESTAMPTZ | YES | — | Set if token is invalidated early |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |

**Indexes:** `idx_password_reset_tokens_user_id`, `idx_password_reset_tokens_expires_at`
**Constraints:** `UNIQUE (token_hash)`

---

## auth_sessions

Persistent refresh-token sessions, scoped to one user+device pair. Rotating refresh tokens update `refresh_token_hash` in place.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| user_id | UUID | NO | — | FK → users(id) ON DELETE CASCADE |
| device_id | TEXT | NO | — | Client-generated device identifier |
| device_name | TEXT | YES | — | Human-readable device label |
| refresh_token_hash | TEXT | NO | — | Hash of the current refresh token |
| ip_address | INET | YES | — | Client IP at session creation |
| user_agent | TEXT | YES | — | Browser/app user-agent string |
| expires_at | TIMESTAMPTZ | NO | — | Session hard expiry |
| revoked_at | TIMESTAMPTZ | YES | — | Set on logout or forced revocation |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |
| last_seen_at | TIMESTAMPTZ | NO | NOW() | Updated on each token refresh |

**Indexes:** `idx_auth_sessions_user_id`, `idx_auth_sessions_expires_at`, `idx_auth_sessions_token_hash`
**Constraints:** `UNIQUE (user_id, device_id)` — alias `uq_auth_sessions_user_device`

---

## oauth_accounts

Linked OAuth provider identities for a user. One user may have multiple rows (one per provider).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| user_id | UUID | NO | — | FK → users(id) ON DELETE CASCADE |
| provider | TEXT | NO | — | OAuth provider name |
| provider_user_id | TEXT | NO | — | Provider's opaque user ID |
| provider_email | CITEXT | YES | — | Email reported by provider |
| provider_email_verified | BOOLEAN | NO | FALSE | Whether provider verified the email |
| provider_display_name | TEXT | YES | — | Name reported by provider |
| provider_avatar_url | TEXT | YES | — | Avatar URL reported by provider |
| provider_tenant_id | TEXT | YES | — | Microsoft Entra tenant ID (if applicable) |
| granted_scopes | TEXT | YES | — | Space-separated OAuth scopes granted |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |
| updated_at | TIMESTAMPTZ | NO | NOW() | Last modification time |

**Indexes:** `idx_oauth_accounts_user_id`, `idx_oauth_accounts_provider_email`
**Constraints:** `UNIQUE (provider, provider_user_id)` — alias `uq_oauth_accounts_provider_user`; `CHECK (provider IN ('google', 'microsoft', 'facebook'))`
**Triggers:** `trg_oauth_accounts_updated_at` — sets `updated_at = NOW()` before every UPDATE

---

## categories

Top-level groupings for conversation topics (e.g. "IELTS Part 1 – Personal Topics").

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| code | TEXT | NO | — | Short machine-readable key (unique) |
| title | TEXT | NO | — | Human-readable category name |
| sort_order | INT | NO | 0 | Display ordering hint |
| is_active | BOOLEAN | NO | TRUE | Soft-delete / visibility flag |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |
| updated_at | TIMESTAMPTZ | NO | NOW() | Last modification time |

**Constraints:** `UNIQUE (code)`
**Triggers:** `trg_categories_updated_at` — sets `updated_at = NOW()` before every UPDATE

---

## topics

Individual conversation topics that belong to a category.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| category_id | UUID | NO | — | FK → categories(id) ON DELETE RESTRICT |
| code | TEXT | NO | — | Short machine-readable key (unique) |
| title | TEXT | NO | — | Human-readable topic name |
| description | TEXT | YES | — | Longer description shown to users |
| difficulty_level | TEXT | YES | — | Difficulty tag |
| sort_order | INT | NO | 0 | Display ordering hint |
| is_active | BOOLEAN | NO | TRUE | Soft-delete / visibility flag |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |
| updated_at | TIMESTAMPTZ | NO | NOW() | Last modification time |

**Indexes:** `idx_topics_category_id`
**Constraints:** `UNIQUE (code)`, `CHECK (difficulty_level IN ('beginner','intermediate','advanced'))`
**Triggers:** `trg_topics_updated_at` — sets `updated_at = NOW()` before every UPDATE

---

## user_topic_preferences

Tracks how often a user has practiced each topic and their proficiency score. Composite primary key — one row per user+topic pair.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| user_id | UUID | NO | — | PK part 1, FK → users(id) ON DELETE CASCADE |
| topic_id | UUID | NO | — | PK part 2, FK → topics(id) ON DELETE CASCADE |
| proficiency_score | NUMERIC(5,2) | YES | — | 0–100 skill estimate for this topic |
| practice_count | INT | NO | 0 | Total number of practice sessions |
| last_practiced_at | TIMESTAMPTZ | YES | — | Timestamp of most recent practice |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |

**Constraints:** `PRIMARY KEY (user_id, topic_id)`, `CHECK (proficiency_score BETWEEN 0 AND 100)`

---

## conversations

A single coaching session. Supports soft-delete via `deleted_at` and message-clearing via `cleared_at`.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| user_id | UUID | NO | — | FK → users(id) ON DELETE CASCADE |
| topic_id | UUID | YES | — | FK → topics(id) ON DELETE SET NULL |
| title | TEXT | YES | — | Optional user-supplied or generated title |
| status | TEXT | NO | 'active' | Lifecycle state |
| cleared_at | TIMESTAMPTZ | YES | — | Set when user clears message history |
| deleted_at | TIMESTAMPTZ | YES | — | Set for soft-delete |
| started_at | TIMESTAMPTZ | NO | NOW() | When conversation began |
| ended_at | TIMESTAMPTZ | YES | — | When conversation ended |
| updated_at | TIMESTAMPTZ | NO | NOW() | Last modification time |

**Indexes:** `idx_conversations_user_started (user_id, started_at DESC)`, `idx_conversations_topic`, `idx_conversations_cleared_at (partial: WHERE cleared_at IS NOT NULL)`, `idx_conversations_deleted_at (partial: WHERE deleted_at IS NOT NULL)`
**Constraints:** `CHECK (status IN ('active','completed','abandoned'))`
**Triggers:** `trg_conversations_updated_at` — sets `updated_at = NOW()` before every UPDATE

---

## turns

One exchange unit (user utterance + assistant reply) within a conversation. Turn numbers are sequential and unique per conversation.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| conversation_id | UUID | NO | — | FK → conversations(id) ON DELETE CASCADE |
| turn_number | INT | NO | — | 1-based sequential turn index |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |

**Constraints:** `UNIQUE (conversation_id, turn_number)` — alias `uq_turns_conv_turn`

---

## messages

Individual messages (user, assistant, or system) within a turn.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| conversation_id | UUID | NO | — | FK → conversations(id) ON DELETE CASCADE |
| turn_id | UUID | YES | — | FK → turns(id) ON DELETE CASCADE |
| role | TEXT | NO | — | Speaker role |
| input_mode | TEXT | YES | — | How user input was provided |
| text_content | TEXT | YES | — | Final display text |
| raw_content | TEXT | YES | — | Unprocessed content (e.g. transcript before cleanup) |
| suggestions | JSONB | NO | '[]' | Inline quick-reply or correction suggestions |
| language_code | TEXT | YES | — | BCP-47 language tag (e.g. `en-US`) |
| token_count | INT | YES | — | LLM token count for billing |
| model_name | TEXT | YES | — | LLM model that generated this message |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |

**Indexes:** `idx_messages_conversation_created (conversation_id, created_at)`, `idx_messages_turn_id`
**Constraints:** `CHECK (role IN ('user', 'assistant', 'system'))`, `CHECK (input_mode IN ('text', 'audio'))`, `CHECK (language_code ~ '^[a-z]{2}(-[A-Z]{2})?$')`

---

## audio_assets

Storage metadata for audio files — either user-uploaded recordings or assistant TTS output. One row per message per audio type.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| message_id | UUID | NO | — | FK → messages(id) ON DELETE CASCADE |
| audio_type | TEXT | NO | — | Whether this is user input or TTS output |
| storage_provider | TEXT | NO | — | Backend storage system |
| storage_key | TEXT | NO | — | Path/key within the storage provider |
| public_url | TEXT | YES | — | Pre-signed or CDN URL for playback |
| mime_type | TEXT | YES | — | MIME type (e.g. `audio/webm`) |
| duration_ms | INT | YES | — | Audio duration in milliseconds |
| sample_rate_hz | INT | YES | — | Audio sample rate in Hz |
| size_bytes | BIGINT | YES | — | File size in bytes |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |

**Indexes:** `idx_audio_assets_message_id`
**Constraints:** `UNIQUE (message_id, audio_type)` — alias `uq_audio_assets_message_type`; `CHECK (audio_type IN ('user_input', 'assistant_tts'))`, `CHECK (storage_provider IN ('local','s3','azure_blob','gcs','minio'))`

---

## pronunciation_assessments

Top-level pronunciation scoring from Azure Cognitive Services for a user audio message. One assessment per message.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| message_id | UUID | YES | — | FK → messages(id) ON DELETE CASCADE |
| user_id | UUID | YES | — | FK → users(id) ON DELETE CASCADE |
| reference_text | TEXT | YES | — | Expected text the user was meant to say |
| recognized_text | TEXT | YES | — | What Azure actually recognized |
| recognition_status | TEXT | YES | — | Azure recognition status (e.g. `Success`, `NoMatch`) |
| overall_score | NUMERIC(5,2) | YES | — | Composite pronunciation score 0–100 |
| accuracy_score | NUMERIC(5,2) | YES | — | Phoneme accuracy score 0–100 |
| fluency_score | NUMERIC(5,2) | YES | — | Fluency score 0–100 |
| completeness_score | NUMERIC(5,2) | YES | — | Completeness score 0–100 |
| prosody_score | NUMERIC(5,2) | YES | — | Prosody score 0–100 |
| nbest_confidence | NUMERIC(6,4) | YES | — | Top NBest confidence value |
| snr | NUMERIC(8,3) | YES | — | Signal-to-noise ratio |
| offset_ticks | BIGINT | YES | — | Utterance start time in 100 ns ticks |
| duration_ticks | BIGINT | YES | — | Utterance duration in 100 ns ticks |
| error_rate | NUMERIC(6,3) | YES | — | Word error rate |
| azure_request_id | TEXT | YES | — | Azure correlation / request ID |
| raw_result_json | JSONB | NO | '{}' | Full Azure JSON response for replay/debugging |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |

**Indexes:** `uq_pron_assessment_message (UNIQUE on message_id)`, `idx_pron_assessments_created`
**Constraints:** All score columns: `CHECK (score BETWEEN 0 AND 100)`

---

## pronunciation_word_details

Per-word breakdown of accuracy and prosody within a pronunciation assessment.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| assessment_id | UUID | NO | — | FK → pronunciation_assessments(id) ON DELETE CASCADE |
| word_index | INT | NO | — | 0-based position of the word in the utterance |
| word | TEXT | NO | — | The word text |
| accuracy_score | NUMERIC(5,2) | YES | — | Per-word accuracy score 0–100 |
| error_type | TEXT | YES | — | Pronunciation error classification |
| offset_ticks | BIGINT | YES | — | Word start time in 100 ns ticks |
| duration_ticks | BIGINT | YES | — | Word duration in 100 ns ticks |
| break_error_types | TEXT[] | YES | — | Array of break error types (e.g. `["UnexpectedBreak"]`) |
| unexpected_break_confidence | NUMERIC(6,4) | YES | — | Confidence that an unexpected break occurred |
| missing_break_confidence | NUMERIC(6,4) | YES | — | Confidence that a break was missing |
| break_length_ticks | BIGINT | YES | — | Duration of the break in 100 ns ticks |
| intonation_error_types | TEXT[] | YES | — | Array of intonation error types (e.g. `["Monotone"]`) |
| monotone_confidence | NUMERIC(6,4) | YES | — | Confidence that speech was monotone |

**Indexes:** `idx_pron_word_assessment`
**Constraints:** `UNIQUE (assessment_id, word_index)` — alias `uq_pron_word_position`; `CHECK (error_type IN ('None','Omission','Insertion','Mispronunciation','UnexpectedBreak','MissingBreak','Monotone'))`

---

## pronunciation_syllable_details

Per-syllable accuracy within a word from a pronunciation assessment.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| word_detail_id | UUID | NO | — | FK → pronunciation_word_details(id) ON DELETE CASCADE |
| syllable_index | INT | NO | — | 0-based position within the word |
| syllable | TEXT | NO | — | Phonetic form (e.g. `"tax"`) |
| grapheme | TEXT | YES | — | Written form (e.g. `"to"`) |
| accuracy_score | NUMERIC(5,2) | YES | — | Syllable accuracy score 0–100 |
| offset_ticks | BIGINT | YES | — | Syllable start time in 100 ns ticks |
| duration_ticks | BIGINT | YES | — | Syllable duration in 100 ns ticks |

**Indexes:** `idx_pron_syllable_word`
**Constraints:** `UNIQUE (word_detail_id, syllable_index)` — alias `uq_pron_syllable_position`

---

## pronunciation_phoneme_details

Per-phoneme accuracy within a word from a pronunciation assessment.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| word_detail_id | UUID | NO | — | FK → pronunciation_word_details(id) ON DELETE CASCADE |
| phoneme_index | INT | NO | — | 0-based position within the word |
| phoneme | TEXT | NO | — | IPA or ARPABET phoneme symbol |
| accuracy_score | NUMERIC(5,2) | YES | — | Phoneme accuracy score 0–100 |
| offset_ticks | BIGINT | YES | — | Phoneme start time in 100 ns ticks |
| duration_ticks | BIGINT | YES | — | Phoneme duration in 100 ns ticks |

**Indexes:** `idx_pron_phoneme_word`
**Constraints:** `UNIQUE (word_detail_id, phoneme_index)` — alias `uq_pron_phoneme_position`

---

## agent_feedback

AI-generated coaching feedback produced once per turn, summarizing grammar, pronunciation, and vocabulary observations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| turn_id | UUID | NO | — | FK → turns(id) ON DELETE CASCADE |
| summary | TEXT | YES | — | Overall feedback summary |
| grammar_feedback | TEXT | YES | — | Grammar-specific coaching notes |
| pronunciation_feedback | TEXT | YES | — | Pronunciation-specific coaching notes |
| vocabulary_feedback | TEXT | YES | — | Vocabulary-specific coaching notes |
| next_tip | TEXT | YES | — | Single actionable tip for the next turn |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |

**Constraints:** `UNIQUE (turn_id)` — alias `uq_agent_feedback_turn` (one feedback record per turn)

---

## daily_progress

Aggregated daily activity summary per user. Upserted by the backend after each session.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| user_id | UUID | NO | — | FK → users(id) ON DELETE CASCADE |
| date | DATE | NO | — | Calendar date (user local date recommended) |
| total_turns | INT | NO | 0 | Number of turns completed that day |
| minutes_spoken | INT | NO | 0 | Total minutes of speaking practice |
| avg_overall_score | NUMERIC(5,2) | YES | — | Average pronunciation overall score 0–100 |
| avg_fluency_score | NUMERIC(5,2) | YES | — | Average fluency score 0–100 |
| avg_accuracy_score | NUMERIC(5,2) | YES | — | Average accuracy score 0–100 |
| updated_at | TIMESTAMPTZ | NO | NOW() | Last modification time |

**Indexes:** `idx_daily_progress_user_date (user_id, date DESC)`
**Constraints:** `UNIQUE (user_id, date)` — alias `uq_daily_progress_user_date`; all avg score columns: `CHECK (score BETWEEN 0 AND 100)`
**Triggers:** `trg_daily_progress_updated_at` — sets `updated_at = NOW()` before every UPDATE

---

## grammar_feedback

Detailed grammar error analysis for a user message, produced by the grammar-checking service.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| message_id | UUID | NO | — | FK → messages(id) ON DELETE CASCADE |
| user_input | TEXT | NO | — | Original user text that was analysed |
| errors | JSONB | NO | '[]' | Array of grammar error objects (see structure below) |
| corrected_sentence | TEXT | YES | — | Full corrected version of the sentence |
| overall_score | INTEGER | YES | — | Grammar quality score |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |

**Indexes:** `grammar_feedback_message_id_idx`

**`errors` JSONB structure:**
```json
[
  {
    "id": 1,
    "type": "tense",
    "original": "go",
    "corrected": "went",
    "start_char": 10,
    "end_char": 12,
    "explanation": "Use past simple"
  }
]
```

---

## flashcard_decks

User-owned named collections of flashcards.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| user_id | UUID | NO | — | FK → users(id) ON DELETE CASCADE |
| name | TEXT | NO | — | Deck name |
| description | TEXT | YES | — | Optional description |
| is_active | BOOLEAN | NO | TRUE | Soft-delete flag |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |
| updated_at | TIMESTAMPTZ | NO | NOW() | Last modification time |

**Indexes:** `idx_flashcard_decks_user_id`
**Triggers:** `trg_flashcard_decks_updated_at` — sets `updated_at = NOW()` before every UPDATE

---

## flashcards

Individual flashcard front/back pairs belonging to a deck and user.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| deck_id | UUID | NO | — | FK → flashcard_decks(id) ON DELETE CASCADE |
| user_id | UUID | NO | — | FK → users(id) ON DELETE CASCADE |
| front_text | TEXT | NO | — | Front-side text content |
| back_text | TEXT | NO | — | Back-side text content |
| tags | TEXT[] | NO | '{}' | Array of string tags for filtering |
| is_active | BOOLEAN | NO | TRUE | Soft-delete flag |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |
| updated_at | TIMESTAMPTZ | NO | NOW() | Last modification time |

**Indexes:** `idx_flashcards_deck_id`, `idx_flashcards_user_id`, `idx_flashcards_tags (GIN on tags array)`
**Triggers:** `trg_flashcards_updated_at` — sets `updated_at = NOW()` before every UPDATE

---

## flashcard_media

Image or audio attachments for a flashcard side, stored in an object storage backend.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| card_id | UUID | NO | — | FK → flashcards(id) ON DELETE CASCADE |
| side | TEXT | NO | — | Which side of the card this media belongs to |
| media_type | TEXT | NO | — | File category |
| storage_provider | TEXT | NO | — | Backend storage system |
| storage_key | TEXT | NO | — | Path/key within the storage provider |
| public_url | TEXT | YES | — | Pre-signed or CDN URL |
| mime_type | TEXT | YES | — | MIME type (e.g. `image/png`) |
| size_bytes | BIGINT | YES | — | File size in bytes |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |

**Indexes:** `idx_flashcard_media_card_id`
**Constraints:** `CHECK (side IN ('front', 'back'))`, `CHECK (media_type IN ('image', 'audio'))`, `CHECK (storage_provider IN ('local','s3','azure_blob','gcs','minio'))`

---

## flashcard_reviews

SM-2 spaced-repetition review state for each flashcard per user. One row per card+user pair, updated in-place after each review.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Primary key |
| card_id | UUID | NO | — | FK → flashcards(id) ON DELETE CASCADE |
| user_id | UUID | NO | — | FK → users(id) ON DELETE CASCADE |
| due_date | DATE | NO | CURRENT_DATE | Next scheduled review date |
| interval_days | INT | NO | 1 | Current SM-2 interval in days |
| ease_factor | NUMERIC(4,2) | NO | 2.5 | SM-2 ease factor (typical range 1.3–2.5) |
| repetitions | INT | NO | 0 | Total successful repetitions |
| last_rating | TEXT | YES | — | Rating given in most recent review |
| last_reviewed_at | TIMESTAMPTZ | YES | — | Timestamp of most recent review |
| created_at | TIMESTAMPTZ | NO | NOW() | Row creation time |
| updated_at | TIMESTAMPTZ | NO | NOW() | Last modification time |

**Indexes:** `idx_flashcard_reviews_user_due (user_id, due_date)`
**Constraints:** `UNIQUE (card_id, user_id)` — alias `uq_flashcard_reviews_card_user`; `CHECK (last_rating IN ('again','hard','good','easy'))`
**Triggers:** `trg_flashcard_reviews_updated_at` — sets `updated_at = NOW()` before every UPDATE
