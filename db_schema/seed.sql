-- =========================
-- SEED DATA
-- =========================

-- Remove legacy flat topics replaced by categorized sub-topics
DELETE FROM topics WHERE code IN ('daily_conversation', 'travel', 'job_interview', 'business_meeting', 'academic');

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
   'technology_social_media','Social Media & Internet Culture',
   'Discuss platforms, online behaviour, and digital communication',
   'beginner', 1),
  ('t0000000-0000-0000-0000-000000000042','ca000000-0000-0000-0000-000000000007',
   'technology_ai','Artificial Intelligence & Future',
   'Discuss AI trends, automation, and the future of work',
   'advanced', 2),
  ('t0000000-0000-0000-0000-000000000043','ca000000-0000-0000-0000-000000000007',
   'technology_gadgets','Gadgets & Devices',
   'Compare products, describe features, and discuss consumer tech',
   'beginner', 3),
  ('t0000000-0000-0000-0000-000000000044','ca000000-0000-0000-0000-000000000007',
   'technology_cybersecurity','Cybersecurity & Privacy',
   'Discuss online safety, data privacy, and digital threats',
   'advanced', 4),
  ('t0000000-0000-0000-0000-000000000045','ca000000-0000-0000-0000-000000000007',
   'technology_ecommerce','E-commerce & Digital Life',
   'Discuss online shopping, digital payments, and platform economies',
   'intermediate', 5),
  ('t0000000-0000-0000-0000-000000000046','ca000000-0000-0000-0000-000000000007',
   'technology_gaming','Gaming & Virtual Reality',
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
   'environment_climate','Climate Change & Environment',
   'Discuss environmental issues, climate science, and global impact',
   'advanced', 1),
  ('t0000000-0000-0000-0000-000000000054','ca000000-0000-0000-0000-000000000009',
   'environment_sustainable','Sustainable Living',
   'Talk about eco-friendly habits, recycling, and green choices',
   'intermediate', 2),
  ('t0000000-0000-0000-0000-000000000055','ca000000-0000-0000-0000-000000000009',
   'environment_social_issues','Social Issues & Inequality',
   'Discuss poverty, discrimination, and systemic social challenges',
   'advanced', 3),
  ('t0000000-0000-0000-0000-000000000056','ca000000-0000-0000-0000-000000000009',
   'environment_immigration','Immigration & Identity',
   'Talk about migration, cultural identity, and belonging',
   'advanced', 4),
  ('t0000000-0000-0000-0000-000000000057','ca000000-0000-0000-0000-000000000009',
   'environment_urban_rural','Urban vs Rural Life',
   'Compare city and countryside living, pros and cons',
   'intermediate', 5),
  ('t0000000-0000-0000-0000-000000000058','ca000000-0000-0000-0000-000000000009',
   'environment_politics','Politics & Current Events',
   'Discuss news, political systems, and civic responsibility',
   'advanced', 6),

  -- Entertainment & Media (6)
  ('t0000000-0000-0000-0000-000000000059','ca000000-0000-0000-0000-000000000010',
   'entertainment_movies','Movies & TV Shows',
   'Review films and series, discuss genres and recommendations',
   'beginner', 1),
  ('t0000000-0000-0000-0000-000000000060','ca000000-0000-0000-0000-000000000010',
   'entertainment_music','Music & Concerts',
   'Talk about music genres, artists, and live performances',
   'beginner', 2),
  ('t0000000-0000-0000-0000-000000000061','ca000000-0000-0000-0000-000000000010',
   'entertainment_books','Books & Literature',
   'Discuss books, authors, and reading habits',
   'intermediate', 3),
  ('t0000000-0000-0000-0000-000000000062','ca000000-0000-0000-0000-000000000010',
   'entertainment_sports','Sports & Competition',
   'Discuss teams, sporting events, and athletic achievement',
   'beginner', 4),
  ('t0000000-0000-0000-0000-000000000063','ca000000-0000-0000-0000-000000000010',
   'entertainment_celebrities','Celebrities & Pop Culture',
   'Discuss famous people, trends, and popular culture',
   'beginner', 5),
  ('t0000000-0000-0000-0000-000000000064','ca000000-0000-0000-0000-000000000010',
   'entertainment_news','News & Current Events',
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
FROM (VALUES
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
JOIN pronunciation_assessments a ON a.message_id = 'e1000000-0000-0000-0000-000000000001'
ON CONFLICT (assessment_id, word_index) DO NOTHING;

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
