export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
export type Gender = 'Male' | 'Female';
export type Accent = 'US' | 'UK';
export type Language = 'English' | 'Vietnamese';
export type Model = 'OpenAI GPT 5' | 'OpenAI GPT 4o' | 'Claude 3.5 Sonnet' | 'Gemini 1.5 Pro';

export interface AuthUser {
  display_name: string;
  email?: string;
}

export const LANGUAGES: Language[] = ['English', 'Vietnamese'];
export const MODELS: Model[] = [
  'OpenAI GPT 5',
  'OpenAI GPT 4o',
  'Claude 3.5 Sonnet',
  'Gemini 1.5 Pro',
];
export const GENDERS: Gender[] = ['Male', 'Female'];
export const ACCENTS: Accent[] = ['US', 'UK'];
export type TopicId =
  | 'daily_conversation'
  | 'travel'
  | 'job_interview'
  | 'business_meeting'
  | 'academic';

export const LANGUAGE_CODES: Record<Language, string> = {
  English: 'en-US',
  Vietnamese: 'vi-VN',
};

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
  length: number;
}

export interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

export interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface ISpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onnomatch: ((this: ISpeechRecognition, ev: Event) => void) | null;
}

export type SpeechRecognitionCtor = new () => ISpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export const DASHBOARD_TO_TOPIC_ID: Record<string, TopicId> = {
  // Human-readable labels (legacy / hardcoded dashboard)
  'Daily Conversation': 'daily_conversation',
  'IELTS Part 1': 'academic',
  'IELTS Part 2': 'academic',
  'IELTS Part 3': 'academic',
  'Academic Discussion': 'academic',
  'Describe a person': 'academic',
  'Describe a place': 'academic',
  'Job Interview': 'job_interview',
  'Office Meeting': 'business_meeting',
  Presentations: 'business_meeting',
  Negotiation: 'business_meeting',
  'Email & Phone': 'business_meeting',
  Shopping: 'daily_conversation',
  Healthcare: 'daily_conversation',
  'Family & Friends': 'daily_conversation',
  Hobbies: 'daily_conversation',
  'Travel & Tourism': 'travel',
  'Travel English': 'travel',
  'Food & Restaurant': 'travel',
  'Hotel & Booking': 'travel',
  'Culture & Customs': 'travel',
  'Airport English': 'travel',
  // DB codes → TOPICS ids (same value now)
  daily_conversation: 'daily_conversation',
  travel: 'travel',
  job_interview: 'job_interview',
  business_meeting: 'business_meeting',
  academic: 'academic',
  ielts_part1: 'academic',
  ielts_part2: 'academic',
  ielts_part3: 'academic',
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
