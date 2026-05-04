// frontend/src/constants/topics.ts
// Single source of truth for all topic and category data.
// Keys match the DB topic codes exactly (topics.code column).

export interface TopicEntry {
  id: string;   // DB topic code, e.g. 'ielts_part1'
  label: string;
  desc: string;
  level: 'Beginner' | 'Beginner+' | 'Intermediate' | 'Intermediate+' | 'Advanced' | 'All levels';
  icon: string;
}

export interface TopicCategory {
  name: string;
  desc: string;
  accent: string;
  topics: TopicEntry[];
}

export const TOPIC_CATEGORIES: TopicCategory[] = [
  {
    name: 'IELTS Speaking',
    desc: 'Practise official IELTS-style speaking parts.',
    accent: 'blue',
    topics: [
      { id: 'ielts_part1', icon: '🎤', label: 'IELTS Part 1 — Intro', desc: 'Personal questions about you and familiar topics.', level: 'All levels' },
      { id: 'ielts_part2', icon: '📋', label: 'IELTS Part 2 — Long Turn', desc: 'Speak for 1–2 minutes from a cue card.', level: 'Intermediate+' },
      { id: 'ielts_part3', icon: '🎓', label: 'IELTS Part 3 — Discussion', desc: 'Abstract ideas and opinions related to Part 2.', level: 'Advanced' },
      { id: 'ielts_describe_person', icon: '🧑', label: 'Describe a Person', desc: 'Vocabulary for character, appearance, relationships.', level: 'Intermediate' },
      { id: 'ielts_describe_place', icon: '🏞️', label: 'Describe a Place', desc: 'City, country, landmark, favourite location.', level: 'Intermediate' },
      { id: 'ielts_describe_event', icon: '🎉', label: 'Describe an Event', desc: 'Describe a memorable event or celebration.', level: 'Intermediate' },
      { id: 'ielts_describe_object', icon: '🎁', label: 'Describe an Object', desc: 'Describe an object that is important to you.', level: 'Intermediate' },
    ],
  },
  {
    name: 'Business & Career',
    desc: 'Workplace English and professional speaking.',
    accent: 'violet',
    topics: [
      { id: 'business_job_interview', icon: '💼', label: 'Job Interview', desc: 'Common questions and structured answers.', level: 'Intermediate+' },
      { id: 'business_meeting', icon: '🗂️', label: 'Office Meeting', desc: 'Discuss projects, share opinions, agree/disagree.', level: 'Intermediate' },
      { id: 'business_presentation', icon: '📊', label: 'Presentations', desc: 'Open, structure, and close a short talk.', level: 'Advanced' },
      { id: 'business_negotiation', icon: '🤝', label: 'Negotiation', desc: 'Bargain politely, propose terms, reach agreement.', level: 'Advanced' },
      { id: 'business_networking', icon: '🌐', label: 'Professional Networking', desc: 'Introduce yourself, build rapport professionally.', level: 'Intermediate' },
      { id: 'business_performance_review', icon: '📝', label: 'Performance Review', desc: 'Discuss goals, achievements, and improvements.', level: 'Advanced' },
      { id: 'business_leadership', icon: '👔', label: 'Leadership & Management', desc: 'Leadership styles, team management, strategy.', level: 'Advanced' },
    ],
  },
  {
    name: 'Daily Life',
    desc: 'Everyday situations you face all the time.',
    accent: 'emerald',
    topics: [
      { id: 'daily_greetings', icon: '💬', label: 'Greetings & Small Talk', desc: 'Start conversations and chat about everyday topics.', level: 'Beginner' },
      { id: 'daily_shopping', icon: '🛍️', label: 'Shopping', desc: 'Ask prices, compare items, return products.', level: 'Beginner' },
      { id: 'daily_healthcare', icon: '🏥', label: 'Healthcare & Medical', desc: 'Doctor visits, symptoms, pharmacy talk.', level: 'Intermediate' },
      { id: 'daily_family', icon: '👨‍👩‍👧', label: 'Family & Relationships', desc: 'Relationships, gatherings, personal stories.', level: 'Beginner+' },
      { id: 'daily_hobbies', icon: '🎨', label: 'Hobbies & Free Time', desc: 'Talk about passions and free time activities.', level: 'Beginner+' },
      { id: 'daily_housing', icon: '🏠', label: 'Housing & Neighbourhood', desc: 'Describe your home, discuss renting/buying.', level: 'Beginner' },
      { id: 'daily_cooking', icon: '🍳', label: 'Food & Cooking at Home', desc: 'Discuss recipes, cooking methods, food preferences.', level: 'Beginner' },
    ],
  },
  {
    name: 'Travel & Culture',
    desc: 'From booking flights to cross-cultural chats.',
    accent: 'amber',
    topics: [
      { id: 'travel_planning', icon: '✈️', label: 'Travel Planning & Booking', desc: 'Booking, directions, holiday stories.', level: 'Intermediate' },
      { id: 'travel_restaurant', icon: '🍽️', label: 'Restaurants & Dining', desc: 'Order, describe taste, ask about dishes.', level: 'Beginner+' },
      { id: 'travel_hotel', icon: '🏨', label: 'Hotel & Accommodation', desc: 'Check-in, request services, handle problems.', level: 'Intermediate' },
      { id: 'travel_airport', icon: '🛫', label: 'Airport & Transport', desc: 'Check-in, security, customs vocabulary.', level: 'Beginner+' },
      { id: 'travel_sightseeing', icon: '🗺️', label: 'Sightseeing & Tourism', desc: 'Ask for directions, learn about attractions.', level: 'Beginner' },
      { id: 'travel_culture', icon: '🌏', label: 'Culture & Customs', desc: 'Compare traditions and cross-cultural topics.', level: 'Intermediate' },
      { id: 'travel_emergency', icon: '🆘', label: 'Lost & Emergency', desc: 'Ask for help when lost, handle unexpected situations.', level: 'Intermediate' },
    ],
  },
  {
    name: 'Academic & Education',
    desc: 'Study, research, and campus conversations.',
    accent: 'teal',
    topics: [
      { id: 'academic_classroom', icon: '📚', label: 'Classroom Discussion', desc: 'Participate in seminars, ask questions, debate ideas.', level: 'Intermediate' },
      { id: 'academic_research', icon: '🔬', label: 'Research & Thesis', desc: 'Present research findings and respond to questions.', level: 'Advanced' },
      { id: 'academic_study_abroad', icon: '🌍', label: 'Study Abroad', desc: 'Talk about studying in another country.', level: 'Intermediate' },
      { id: 'academic_presentations', icon: '🖥️', label: 'Academic Presentations', desc: 'Deliver structured talks with clear intro and conclusion.', level: 'Advanced' },
      { id: 'academic_campus', icon: '🏫', label: 'Campus Life', desc: 'Discuss university life, accommodation, challenges.', level: 'Intermediate' },
      { id: 'academic_online', icon: '💻', label: 'Online Learning', desc: 'Discuss e-learning platforms and digital education.', level: 'Beginner' },
    ],
  },
  {
    name: 'Health & Wellness',
    desc: 'Medical, mental health, and lifestyle topics.',
    accent: 'rose',
    topics: [
      { id: 'health_doctor', icon: '🏥', label: 'Doctor & Hospital', desc: 'Describe symptoms, understand diagnoses.', level: 'Intermediate' },
      { id: 'health_mental', icon: '🧠', label: 'Mental Health', desc: 'Discuss stress, anxiety, and emotional wellbeing.', level: 'Intermediate' },
      { id: 'health_diet', icon: '🥗', label: 'Diet & Nutrition', desc: 'Talk about healthy eating and food habits.', level: 'Beginner' },
      { id: 'health_exercise', icon: '🏋️', label: 'Exercise & Fitness', desc: 'Describe workout routines and fitness goals.', level: 'Beginner' },
      { id: 'health_stress', icon: '😮‍💨', label: 'Stress & Work-Life Balance', desc: 'Discuss burnout, time management, and balance.', level: 'Intermediate' },
      { id: 'health_public', icon: '🦠', label: 'Public Health', desc: 'Health policies, disease prevention, global issues.', level: 'Advanced' },
    ],
  },
  {
    name: 'Technology & Innovation',
    desc: 'Tech trends, gadgets, and digital life.',
    accent: 'indigo',
    topics: [
      { id: 'tech_social_media', icon: '📱', label: 'Social Media', desc: 'Discuss platforms, online behaviour, digital culture.', level: 'Beginner' },
      { id: 'tech_ai', icon: '🤖', label: 'AI & Future of Work', desc: 'Discuss AI trends, automation, and the future.', level: 'Advanced' },
      { id: 'tech_gadgets', icon: '💻', label: 'Gadgets & Devices', desc: 'Compare products, describe features, consumer tech.', level: 'Beginner' },
      { id: 'tech_cybersecurity', icon: '🔒', label: 'Cybersecurity & Privacy', desc: 'Discuss online safety and data privacy.', level: 'Advanced' },
      { id: 'tech_ecommerce', icon: '🛒', label: 'E-commerce & Digital Life', desc: 'Online shopping, digital payments, platform economies.', level: 'Intermediate' },
      { id: 'tech_gaming', icon: '🎮', label: 'Gaming & VR', desc: 'Talk about video games, esports, and immersive tech.', level: 'Intermediate' },
    ],
  },
  {
    name: 'Social Life & Relationships',
    desc: 'Friendships, romance, and community.',
    accent: 'pink',
    topics: [
      { id: 'social_friendship', icon: '👥', label: 'Friendship', desc: 'Making friends, social groups, maintaining relationships.', level: 'Beginner' },
      { id: 'social_dating', icon: '💕', label: 'Dating & Romance', desc: 'Discuss relationships and dating culture.', level: 'Intermediate' },
      { id: 'social_conflict', icon: '🤲', label: 'Conflict Resolution', desc: 'Navigate disagreements and find compromise.', level: 'Intermediate' },
      { id: 'social_peer_pressure', icon: '🛑', label: 'Peer Pressure & Boundaries', desc: 'Setting limits, saying no, assertive communication.', level: 'Intermediate' },
      { id: 'social_cross_cultural', icon: '🌐', label: 'Cross-Cultural Friendships', desc: 'Navigating cultural differences in relationships.', level: 'Intermediate' },
      { id: 'social_community', icon: '🤝', label: 'Community & Volunteering', desc: 'Discuss local community involvement and charity.', level: 'Beginner' },
    ],
  },
  {
    name: 'Environment & Society',
    desc: 'Climate, social issues, and current events.',
    accent: 'green',
    topics: [
      { id: 'env_climate', icon: '🌍', label: 'Climate Change', desc: 'Environmental issues, climate science, global impact.', level: 'Advanced' },
      { id: 'env_sustainable', icon: '♻️', label: 'Sustainable Living', desc: 'Eco-friendly habits, recycling, green choices.', level: 'Intermediate' },
      { id: 'env_social_issues', icon: '⚖️', label: 'Social Issues', desc: 'Discuss poverty, discrimination, systemic challenges.', level: 'Advanced' },
      { id: 'env_immigration', icon: '🗺️', label: 'Immigration & Identity', desc: 'Talk about migration, cultural identity, belonging.', level: 'Advanced' },
      { id: 'env_urban_rural', icon: '🏙️', label: 'Urban vs Rural Life', desc: 'Compare city and countryside living.', level: 'Intermediate' },
      { id: 'env_politics', icon: '🗳️', label: 'Politics & Current Events', desc: 'Discuss news, political systems, civic responsibility.', level: 'Advanced' },
    ],
  },
  {
    name: 'Entertainment & Media',
    desc: 'Movies, music, sports, and pop culture.',
    accent: 'orange',
    topics: [
      { id: 'ent_movies', icon: '🎬', label: 'Movies & TV Shows', desc: 'Review films and series, discuss genres.', level: 'Beginner' },
      { id: 'ent_music', icon: '🎵', label: 'Music & Concerts', desc: 'Talk about genres, artists, and live performances.', level: 'Beginner' },
      { id: 'ent_books', icon: '📖', label: 'Books & Literature', desc: 'Discuss books, authors, and reading habits.', level: 'Intermediate' },
      { id: 'ent_sports', icon: '⚽', label: 'Sports & Competition', desc: 'Discuss teams, sporting events, athletic achievement.', level: 'Beginner' },
      { id: 'ent_celebrities', icon: '⭐', label: 'Celebrities & Pop Culture', desc: 'Famous people, trends, and popular culture.', level: 'Beginner' },
      { id: 'ent_news', icon: '📰', label: 'News & Current Events', desc: 'Summarise news stories and discuss their significance.', level: 'Intermediate' },
    ],
  },
];

export const TOPICS_FLAT: TopicEntry[] = TOPIC_CATEGORIES.flatMap(cat => cat.topics);

export type TopicId = typeof TOPICS_FLAT[number]['id'];
