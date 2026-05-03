import { AlertCircle, BookOpen, Volume2, Zap } from 'lucide-react';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
export type Gender = 'Male' | 'Female';
export type Language = 'English' | 'Vietnamese';
export type Model = 'OpenAI GPT 5' | 'OpenAI GPT 4o' | 'Claude 3.5 Sonnet' | 'Gemini 1.5 Pro';
export type FeedbackType = 'grammar' | 'vocabulary' | 'pronunciation' | 'fluency';

export interface AuthUser {
  display_name: string;
  email?: string;
}

export interface FeedbackItem {
  id: number;
  type: FeedbackType;
  original: string;
  corrected: string;
  explanation: string;
  timestamp: Date;
}

export const FEEDBACK_ICON: Record<
  FeedbackType,
  { icon: typeof AlertCircle; color: string; bg: string; label: string }
> = {
  grammar: {
    icon: AlertCircle,
    color: 'text-red-500',
    bg: 'bg-red-50 border-red-200',
    label: 'Grammar',
  },
  vocabulary: {
    icon: BookOpen,
    color: 'text-yellow-500',
    bg: 'bg-yellow-50 border-yellow-200',
    label: 'Vocabulary',
  },
  pronunciation: {
    icon: Volume2,
    color: 'text-purple-600',
    bg: 'bg-violet-50 border-purple-500/25',
    label: 'Pronunciation',
  },
  fluency: {
    icon: Zap,
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
    label: 'Fluency',
  },
};

export const LANGUAGES: Language[] = ['English', 'Vietnamese'];
export const MODELS: Model[] = [
  'OpenAI GPT 5',
  'OpenAI GPT 4o',
  'Claude 3.5 Sonnet',
  'Gemini 1.5 Pro',
];
export const GENDERS: Gender[] = ['Male', 'Female'];

export const TOPICS = [
  { id: 'daily', label: 'Daily Conversation', desc: 'Giao tiếp hàng ngày' },
  {
    id: 'ielts1',
    label: 'IELTS Speaking Part 1',
    desc: 'Giới thiệu bản thân, cuộc sống',
  },
  {
    id: 'ielts2',
    label: 'IELTS Speaking Part 2',
    desc: 'Nói dài về một chủ đề',
  },
  {
    id: 'ielts3',
    label: 'IELTS Speaking Part 3',
    desc: 'Thảo luận ý kiến, phân tích',
  },
  { id: 'travel', label: 'Travel & Tourism', desc: 'Du lịch, khám phá' },
  { id: 'career', label: 'Work & Career', desc: 'Công việc, sự nghiệp' },
  { id: 'education', label: 'Education', desc: 'Giáo dục, học tập' },
  { id: 'environment', label: 'Environment', desc: 'Môi trường, thiên nhiên' },
  { id: 'technology', label: 'Technology', desc: 'Công nghệ, đổi mới' },
  { id: 'health', label: 'Health & Lifestyle', desc: 'Sức khỏe, lối sống' },
] as const;

export type TopicId = (typeof TOPICS)[number]['id'];

export const LANGUAGE_CODES: Record<Language, string> = {
  English: 'en-US',
  Vietnamese: 'vi-VN',
};

export const AGENT_REPLIES = [
  "That's a great question! Let me think about that for a moment. Based on my knowledge, I'd say the answer involves multiple perspectives worth exploring.",
  "Interesting! I can definitely help you with that. Here's what I know about this topic — it's quite fascinating when you dig deeper into it.",
  "Sure! I understand what you're looking for. Let me provide you with a comprehensive response that covers the key points.",
  'Great point! I agree with your thinking here. To add to that, there are a few additional considerations that might be helpful.',
  "I appreciate you asking about this! It's an area I find quite interesting. The short answer is yes, and here's why that matters in practice.",
  "Absolutely! That's something I can explain clearly. The main idea is straightforward, though the details do get nuanced depending on your specific use case.",
  "Of course! Let me break that down for you step by step so it's easy to follow and understand.",
];

export interface ISpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
}

export type SpeechRecognitionCtor = new () => ISpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export const DASHBOARD_TO_TOPIC_ID: Record<string, TopicId> = {
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
