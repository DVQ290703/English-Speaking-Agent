// Maps the dashboard's hardcoded topic label (e.g. "IELTS Part 1") to the
// canonical internal `TopicId` used by VoiceAgent when persisting sessions
// (e.g. "ielts1"). Kept in a shared module so the dashboard's resume
// lookup and VoiceAgent's URL-init logic agree on the mapping.
export const DASHBOARD_TO_TOPIC_ID: Record<string, string> = {
  'Daily Conversation': 'daily',
  'IELTS Part 1': 'ielts1',
  'IELTS Part 2': 'ielts2',
  'Academic Discussion': 'ielts3',
  'Describe a person': 'ielts2',
  'Describe a place': 'ielts2',
  'Job Interview': 'career',
  'Office Meeting': 'career',
  Presentations: 'career',
  Negotiation: 'career',
  'Email & Phone': 'career',
  Shopping: 'daily',
  Healthcare: 'health',
  'Family & Friends': 'daily',
  Hobbies: 'daily',
  'Travel & Tourism': 'travel',
  'Food & Restaurant': 'travel',
  'Hotel & Booking': 'travel',
  'Culture & Customs': 'travel',
  'Airport English': 'travel',
};

export const DASHBOARD_TO_SUB_OPTION: Record<string, string> = {
  'Daily Conversation': 'weekend_plans',
  Shopping: 'shopping_return',
  Healthcare: 'doctor_visit',
  'Family & Friends': 'weekend_plans',
  Hobbies: 'weekend_plans',
  'IELTS Part 1': 'part_1_personal_questions',
  'IELTS Part 2': 'part_2_cue_card',
  'Academic Discussion': 'part_3_discussion',
  'Describe a person': 'part_2_cue_card',
  'Describe a place': 'part_2_cue_card',
  'Job Interview': 'tell_me_about_yourself',
  'Office Meeting': 'project_update_meeting',
  Presentations: 'project_update_meeting',
  Negotiation: 'salary_negotiation',
  'Email & Phone': 'Email & Phone',
  'Travel & Tourism': 'asking_directions',
  'Food & Restaurant': 'ordering_food',
  'Hotel & Booking': 'hotel_booking',
  'Culture & Customs': 'Culture & Customs',
  'Airport English': 'airport_check_in',
};
