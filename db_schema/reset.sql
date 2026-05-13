-- Drop all tables in reverse dependency order, then re-apply schema.sql
-- Run this script, then run schema.sql

DROP TABLE IF EXISTS grammar_feedback                CASCADE;
DROP TABLE IF EXISTS pronunciation_phoneme_details   CASCADE;
DROP TABLE IF EXISTS pronunciation_syllable_details  CASCADE;
DROP TABLE IF EXISTS pronunciation_word_details      CASCADE;
DROP TABLE IF EXISTS pronunciation_assessments       CASCADE;
DROP TABLE IF EXISTS agent_feedback                  CASCADE;
DROP TABLE IF EXISTS daily_progress                  CASCADE;
DROP TABLE IF EXISTS audio_assets                    CASCADE;
DROP TABLE IF EXISTS messages                        CASCADE;
DROP TABLE IF EXISTS turns                           CASCADE;
DROP TABLE IF EXISTS conversations                   CASCADE;
DROP TABLE IF EXISTS user_topic_preferences          CASCADE;
DROP TABLE IF EXISTS topics                          CASCADE;
DROP TABLE IF EXISTS categories                      CASCADE;
DROP TABLE IF EXISTS password_reset_tokens          CASCADE;
DROP TABLE IF EXISTS auth_sessions                   CASCADE;
DROP TABLE IF EXISTS oauth_accounts                  CASCADE;
DROP TABLE IF EXISTS users                           CASCADE;

DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
