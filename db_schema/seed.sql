-- =========================
-- SEED DATA
-- =========================

-- Users (password_hash = bcrypt of "Password123!")
INSERT INTO users (id, email, password_hash, display_name, english_level) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'alice@example.com',  '$2b$12$KIXtq1NmFPu8fWC8kL1FBuFT4vpC5h5Fg2iUqwEsJI9djxzlrWcMe', 'Alice Nguyen',  'B1'),
  ('a1000000-0000-0000-0000-000000000002', 'bob@example.com',    '$2b$12$KIXtq1NmFPu8fWC8kL1FBuFT4vpC5h5Fg2iUqwEsJI9djxzlrWcMe', 'Bob Tran',      'A2'),
  ('a1000000-0000-0000-0000-000000000003', 'charlie@example.com','$2b$12$KIXtq1NmFPu8fWC8kL1FBuFT4vpC5h5Fg2iUqwEsJI9djxzlrWcMe', 'Charlie Le',    'B2')
ON CONFLICT (email) DO NOTHING;

-- Topics
INSERT INTO topics (id, code, title, description, difficulty_level) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'daily_conversation',  'Daily Conversation',   'Everyday topics: greetings, shopping, weather', 'beginner'),
  ('b1000000-0000-0000-0000-000000000002', 'travel',              'Travel English',        'Airports, hotels, asking for directions',        'beginner'),
  ('b1000000-0000-0000-0000-000000000003', 'job_interview',       'Job Interview',         'Common interview questions and answers',         'intermediate'),
  ('b1000000-0000-0000-0000-000000000004', 'business_meeting',    'Business Meeting',      'Presentations, negotiations, small talk',        'intermediate'),
  ('b1000000-0000-0000-0000-000000000005', 'academic',            'Academic Discussion',   'Lectures, debates, research topics',             'advanced')
ON CONFLICT (code) DO NOTHING;

-- User topic preferences
INSERT INTO user_topic_preferences (user_id, topic_id, proficiency_score, last_practiced_at) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 72.5, NOW() - INTERVAL '1 day'),
  ('a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 58.0, NOW() - INTERVAL '3 days'),
  ('a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 45.0, NOW() - INTERVAL '2 days'),
  ('a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 60.0, NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- Conversations
INSERT INTO conversations (id, user_id, topic_id, title, status, started_at, ended_at) VALUES
  ('c1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001',
   'Session 1 - Greetings Practice',
   'completed',
   NOW() - INTERVAL '2 days',
   NOW() - INTERVAL '2 days' + INTERVAL '20 minutes'),
  ('c1000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000003',
   'Session 2 - Interview Prep',
   'active',
   NOW() - INTERVAL '1 hour',
   NULL),
  ('c1000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-000000000002',
   'b1000000-0000-0000-0000-000000000002',
   'Session 1 - Travel Phrases',
   'completed',
   NOW() - INTERVAL '3 days',
   NOW() - INTERVAL '3 days' + INTERVAL '15 minutes')
ON CONFLICT DO NOTHING;

-- Turns
INSERT INTO turns (id, conversation_id, turn_number) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 1),
  ('d1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 2),
  ('d1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', 1),
  ('d1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000003', 1),
  ('d1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000003', 2)
ON CONFLICT DO NOTHING;

-- Messages
INSERT INTO messages (id, conversation_id, turn_id, role, input_mode, text_content, language_code, token_count, model_name) VALUES
  -- Conversation 1 / Turn 1
  ('e1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
   'user', 'audio', 'Hello, my name is Alice. Nice to meet you!', 'en-US', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
   'assistant', 'text', 'Great to meet you too, Alice! Your greeting sounded natural. Let''s practice more!', 'en-US', 22, 'llama-3.3-70b-versatile'),
  -- Conversation 1 / Turn 2
  ('e1000000-0000-0000-0000-000000000003',
   'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002',
   'user', 'audio', 'Can you tell me about your hobbies?', 'en-US', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000004',
   'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002',
   'assistant', 'text', 'I enjoy reading and hiking. What about you? Try using "I am interested in..." to sound more natural.', 'en-US', 28, 'llama-3.3-70b-versatile'),
  -- Conversation 2 / Turn 1
  ('e1000000-0000-0000-0000-000000000005',
   'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000003',
   'user', 'text', 'Tell me about yourself.', 'en-US', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000006',
   'c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000003',
   'assistant', 'text', 'Good start! When answering this in an interview, structure it as: present, past, future. For example: "I am currently a developer..."', 'en-US', 35, 'llama-3.3-70b-versatile'),
  -- Conversation 3 / Turn 1
  ('e1000000-0000-0000-0000-000000000007',
   'c1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000004',
   'user', 'audio', 'Excuse me, where is the nearest hotel?', 'en-US', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000008',
   'c1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000004',
   'assistant', 'text', 'Well done! Your pronunciation was clear. A more formal option: "Could you direct me to the nearest hotel, please?"', 'en-US', 25, 'llama-3.3-70b-versatile')
ON CONFLICT DO NOTHING;

-- Audio assets (mock storage keys)
INSERT INTO audio_assets (message_id, audio_type, storage_provider, storage_key, mime_type, duration_ms, size_bytes) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'user_input',    'local', 'audio/conv1/turn1_user.wav',      'audio/wav',  3200, 51200),
  ('e1000000-0000-0000-0000-000000000002', 'assistant_tts', 'local', 'audio/conv1/turn1_assistant.mp3', 'audio/mpeg', 4100, 65600),
  ('e1000000-0000-0000-0000-000000000003', 'user_input',    'local', 'audio/conv1/turn2_user.wav',      'audio/wav',  2800, 44800),
  ('e1000000-0000-0000-0000-000000000007', 'user_input',    'local', 'audio/conv3/turn1_user.wav',      'audio/wav',  3500, 56000)
ON CONFLICT DO NOTHING;

-- Pronunciation assessments
INSERT INTO pronunciation_assessments
  (message_id, reference_text, recognized_text, overall_score, accuracy_score, fluency_score, completeness_score, prosody_score, error_rate, raw_result_json)
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

-- Pronunciation word details (for first assessment)
INSERT INTO pronunciation_word_details (assessment_id, word, accuracy_score, error_type, start_ms, duration_ms)
SELECT a.id, w.word, w.accuracy_score, w.error_type, w.start_ms, w.duration_ms
FROM pronunciation_assessments a,
(VALUES
  ('Hello',   95.0, NULL,             0,    320),
  ('my',      98.0, NULL,             380,  150),
  ('name',    92.0, NULL,             580,  280),
  ('is',      97.0, NULL,             920,  120),
  ('Alice',   88.0, NULL,             1100, 400),
  ('Nice',    85.0, NULL,             1600, 300),
  ('to',      99.0, NULL,             1960, 100),
  ('meet',    90.0, NULL,             2120, 350),
  ('you',     93.0, NULL,             2530, 280)
) AS w(word, accuracy_score, error_type, start_ms, duration_ms)
WHERE a.message_id = 'e1000000-0000-0000-0000-000000000001';

-- Agent feedback
INSERT INTO agent_feedback (turn_id, summary, grammar_feedback, pronunciation_feedback, vocabulary_feedback, next_tip) VALUES
  ('d1000000-0000-0000-0000-000000000001',
   'Great opening! Your greeting was confident and clear.',
   'Grammar is correct. Try adding "It''s a pleasure to meet you" for variety.',
   'Score: 82.5/100. "Alice" pronunciation was slightly flat — stress the first syllable more.',
   'Good use of "Nice to meet you". Also try: "Pleased to meet you", "How do you do?"',
   'Practice introducing someone else: "This is my colleague, [name]."'),
  ('d1000000-0000-0000-0000-000000000004',
   'Solid question asking good job!',
   'Consider "Could you tell me..." for a more polite register.',
   'Score: 74/100. Work on sentence-final intonation — questions should rise at the end.',
   '"Tell me about" is natural. Also try: "I''d love to hear about your hobbies."',
   'Practice 3 follow-up questions using "What", "How", "Why".')
ON CONFLICT DO NOTHING;

-- Daily progress
INSERT INTO daily_progress (user_id, date, total_turns, minutes_spoken, avg_overall_score, avg_fluency_score, avg_accuracy_score) VALUES
  ('a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 7, 3, 8,  68.0, 65.0, 70.0),
  ('a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 6, 5, 12, 71.5, 69.0, 73.5),
  ('a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 5, 4, 10, 70.0, 68.0, 72.0),
  ('a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 4, 6, 15, 74.5, 72.0, 76.5),
  ('a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 3, 8, 18, 76.0, 74.5, 78.0),
  ('a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 2, 4, 9,  78.3, 76.0, 80.0),
  ('a1000000-0000-0000-0000-000000000001', CURRENT_DATE - 1, 7, 16, 80.5, 78.5, 82.0),
  ('a1000000-0000-0000-0000-000000000002', CURRENT_DATE - 3, 3, 7,  55.0, 52.0, 58.0),
  ('a1000000-0000-0000-0000-000000000002', CURRENT_DATE - 2, 4, 9,  60.5, 58.0, 63.0),
  ('a1000000-0000-0000-0000-000000000002', CURRENT_DATE - 1, 5, 11, 63.0, 60.5, 65.5)
ON CONFLICT DO NOTHING;
