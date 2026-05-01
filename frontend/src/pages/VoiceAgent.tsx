import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mic,
  MicOff,
  Settings,
  Circle,
  SendHorizontal,
  AlertCircle,
  BookOpen,
  Volume2,
  Zap,
  CheckCircle2,
  LogIn,
  UserPlus,
  LogOut,
  Moon,
  Sun,
  User,
  Sparkles,
  Trophy,
  RefreshCw,
  X,
} from 'lucide-react';
import { SiOpenai } from 'react-icons/si';

import { chatRespond, assessPronunciation, toWav } from '../api/chat';
import {
  saveSession as saveSessionHistory,
  getSession as getSessionHistory,
} from '../api/sessionHistory';
import { getAuthSession, clearAuthSession } from '../auth/tokenStorage';
import {
  AgentWaveform,
  DeviceSelect,
  MessageBubble,
  MicWaveform,
  SelectDropdown,
} from '../components/voice-agent';
import type { Message, Mistake } from '../components/voice-agent';
import { useLanguage } from '../i18n/LanguageContext';
import LanguageToggle from '../i18n/LanguageToggle';
import { clearConversation } from '../api/conversations';
import { dbClearConversationData } from '../lib/db';
import { evictConversationAudio } from '../lib/audioCache';
import { queryClient } from '../lib/queryClient';

interface AuthUser {
  display_name: string;
  email?: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
type Gender = 'Male' | 'Female';
type Language = 'English' | 'Vietnamese';
type Model = 'OpenAI GPT 5' | 'OpenAI GPT 4o' | 'Claude 3.5 Sonnet' | 'Gemini 1.5 Pro';

type FeedbackType = 'grammar' | 'vocabulary' | 'pronunciation' | 'fluency';

interface FeedbackItem {
  id: number;
  type: FeedbackType;
  original: string;
  corrected: string;
  explanation: string;
  timestamp: Date;
}

const FEEDBACK_ICON: Record<
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

const LANGUAGES: Language[] = ['English', 'Vietnamese'];
const MODELS: Model[] = ['OpenAI GPT 5', 'OpenAI GPT 4o', 'Claude 3.5 Sonnet', 'Gemini 1.5 Pro'];
const GENDERS: Gender[] = ['Male', 'Female'];

const TOPICS = [
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
];
type TopicId = (typeof TOPICS)[number]['id'];

const LANGUAGE_CODES: Record<Language, string> = {
  English: 'en-US',
  Vietnamese: 'vi-VN',
};

interface ISpeechRecognition extends EventTarget {
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

type SpeechRecognitionCtor = new () => ISpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

const AGENT_REPLIES = [
  "That's a great question! Let me think about that for a moment. Based on my knowledge, I'd say the answer involves multiple perspectives worth exploring.",
  "Interesting! I can definitely help you with that. Here's what I know about this topic — it's quite fascinating when you dig deeper into it.",
  "Sure! I understand what you're looking for. Let me provide you with a comprehensive response that covers the key points.",
  'Great point! I agree with your thinking here. To add to that, there are a few additional considerations that might be helpful.',
  "I appreciate you asking about this! It's an area I find quite interesting. The short answer is yes, and here's why that matters in practice.",
  "Absolutely! That's something I can explain clearly. The main idea is straightforward, though the details do get nuanced depending on your specific use case.",
  "Of course! Let me break that down for you step by step so it's easy to follow and understand.",
];

interface VoiceAgentProps {
  currentUser?: AuthUser | null;
  onLogout?: () => void;
}

export default function VoiceAgent({ currentUser: initialUser = null, onLogout }: VoiceAgentProps) {
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem('va-theme') === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem('va-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    if (initialUser) return initialUser;
    const session = getAuthSession();
    if (!session?.user) return null;
    const u = session.user;
    return {
      display_name: u.display_name || u.name || u.email || 'User',
      email: u.email,
    };
  });

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [micEnabled, setMicEnabled] = useState(false);
  // Tracks whether the user has explicitly turned the mic on. Used so the
  // auto-mute-during-TTS logic doesn't accidentally turn the mic on when the
  // user never asked for it (push-to-talk behaviour).
  const userMicIntentRef = useRef(false);
  const [gender, setGender] = useState<Gender>('Male');
  const [language, setLanguage] = useState<Language>(lang === 'vi' ? 'Vietnamese' : 'English');

  // Initialize speech language from UI language on first render, but keep it
  // independent afterwards so toggling the UI translations doesn't affect
  // audio capture / assessment language.

  const handleLanguageChange = useCallback((next: Language) => {
    // This dropdown controls the speech/assessment language only.
    setLanguage(next);
  }, []);
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const initialMessagesAndId = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sid = params.get('session');
      if (sid) {
        const saved = getSessionHistory(sid);
        if (saved) {
          const rehydrated = ((saved.messages as Message[]) ?? []).map(m => {
            const ts =
              m.timestamp instanceof Date
                ? m.timestamp
                : new Date(m.timestamp as unknown as string | number);
            // Drop any persisted `blob:` object URLs — they are not valid after
            // a page reload. Also ensure we don't rehydrate binary Blobs.
            const userAudioUrl =
              typeof m.userAudioUrl === 'string' && m.userAudioUrl.startsWith('blob:')
                ? undefined
                : m.userAudioUrl;
            return {
              ...m,
              timestamp: ts,
              audioUrl: undefined,
              userAudioUrl,
              audioBlob: undefined,
            };
          });
          return {
            messages: rehydrated,
            sessionId: sid,
            topic: saved.topicKey as TopicId | null,
          };
        }
      }
    } catch {}
    return {
      messages: [] as Message[],
      sessionId: null as string | null,
      topic: null as TopicId | null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const _initialTopicAndLabel = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('session') && initialMessagesAndId.topic) {
        return {
          topic: initialMessagesAndId.topic as TopicId | null,
          label: null as string | null,
          subOption: null as string | null,
        };
      }
      const raw = params.get('topic') || sessionStorage.getItem('va_selected_topic');
      if (!raw) {
        return { topic: null as TopicId | null, label: null as string | null, subOption: null as string | null };
      }
      sessionStorage.removeItem('va_selected_topic');
      const DASHBOARD_TO_TOPIC_ID: Record<string, TopicId> = {
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
      const DASHBOARD_TO_SUB_OPTION: Record<string, string> = {
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
      const mappedId = DASHBOARD_TO_TOPIC_ID[raw];
      if (mappedId) {
        return {
          topic: mappedId,
          label: null,
          subOption: DASHBOARD_TO_SUB_OPTION[raw] ?? null,
        };
      }
      return { topic: null as TopicId | null, label: raw, subOption: raw };
    } catch {
      return { topic: null as TopicId | null, label: null as string | null, subOption: null as string | null };
    }
  }, [initialMessagesAndId]);
  const [topic, setTopic] = useState<TopicId | null>(_initialTopicAndLabel.topic);
  const [customTopicLabel, setCustomTopicLabel] = useState<string | null>(
    _initialTopicAndLabel.label
  );
  const [subOption, setSubOption] = useState<string | null>(_initialTopicAndLabel.subOption);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [model, setModel] = useState<Model>('OpenAI GPT 5');

  // Real mic devices enumerated from the browser — populated on mount and
  // refreshed whenever the user plugs/unplugs hardware.
  const [micDevices, setMicDevices] = useState<{ deviceId: string; label: string }[]>([]);
  // selectedMicId stores the real deviceId so getUserMedia can target it.
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  // Stable ref so callbacks (e.g. startUserAudioCapture) always read the
  // current deviceId without being recreated on every render.
  const selectedMicIdRef = useRef<string>('');
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Computed once via useMemo with empty deps — this hits localStorage and
  // parses URL params, so we don't want to redo it on every render. Empty
  // deps guarantee a single computation and a stable identity across all
  // renders, so any code that closes over it (like the topic-init effect
  // below) sees the exact same object that initialised state.
  const [messages, setMessages] = useState<Message[]>(initialMessagesAndId.messages);
  const sessionIdRef = useRef<string | null>(initialMessagesAndId.sessionId);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [expandedMsgId, setExpandedMsgId] = useState<number | null>(null);
  const selectedMsg =
    expandedMsgId !== null ? (messages.find(m => m.id === expandedMsgId) ?? null) : null;
  // Prefer the most recent user message that contains assessment information
  // (either `scoreDetails` or recorded `mistakes`). This prevents the
  // feedback pane from showing stale or unassessed messages.
  const latestUserMsg = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (
        m.role === 'user' &&
        (m.scoreDetails || (Array.isArray(m.mistakes) && m.mistakes.length > 0))
      )
        return m;
    }
    return null;
  })();
  const displayMsg = selectedMsg ?? latestUserMsg;
  const isAutoLatest = !selectedMsg && !!latestUserMsg;

  const sessionSummary = useMemo(() => {
    const userMsgs = messages.filter(m => m.role === 'user' && m.scoreDetails);
    if (userMsgs.length === 0) return null;
    const avg = (key: 'overall' | 'pronunciation' | 'fluency' | 'accuracy') =>
      Math.round(userMsgs.reduce((s, m) => s + (m.scoreDetails?.[key] ?? 0), 0) / userMsgs.length);
    const scores = {
      overall: avg('overall'),
      pronunciation: avg('pronunciation'),
      fluency: avg('fluency'),
      accuracy: avg('accuracy'),
    };
    const errorCounts: Record<string, number> = {};
    let totalErrors = 0;
    for (const m of userMsgs) {
      for (const mk of m.mistakes ?? []) {
        errorCounts[mk.type] = (errorCounts[mk.type] ?? 0) + 1;
        totalErrors++;
      }
    }
    const topErrors = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const weakest = (['pronunciation', 'fluency', 'accuracy'] as const).reduce(
      (w, k) => (scores[k] < scores[w] ? k : w),
      'pronunciation' as 'pronunciation' | 'fluency' | 'accuracy'
    );
    const tipMap: Record<typeof weakest, string> = {
      pronunciation:
        'Practice tricky sounds with shadowing — repeat after the agent right after each reply.',
      fluency:
        'Try speaking in longer 2-3 sentence chunks without pausing — record and replay yourself.',
      accuracy:
        'Slow down slightly and self-correct grammar before sending — focus on tense and articles.',
    };
    const tips: string[] = [tipMap[weakest]];
    if (topErrors[0]) {
      tips.push(
        `You made ${topErrors[0][1]} ${topErrors[0][0].toLowerCase()} mistake${topErrors[0][1] > 1 ? 's' : ''} — review them in your messages.`
      );
    }
    return {
      sentenceCount: userMsgs.length,
      totalErrors,
      scores,
      topErrors,
      tips,
    };
  }, [messages]);

  const [summaryDismissed, setSummaryDismissed] = useState(false);
  const showSessionSummary =
    status === 'disconnected' &&
    messages.length > 0 &&
    sessionSummary !== null &&
    !summaryDismissed;
  const [chatInput, setChatInput] = useState('');
  const [agentTyping, setAgentTyping] = useState(false);
  const [_feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);

  const [isRecording, setIsRecording] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Bumped every time we (re)start a connection. Pending timers compare
  // against this and bail out if a newer session has been started, so
  // rapid clicks on "New session" / Connect can never let a stale timer
  // overwrite the current status / typing state.
  const sessionVersionRef = useRef(0);
  const msgCounterRef = useRef(
    (() => {
      // Math.max(...spread) returns -Infinity on an empty array and silently
      // ignores non-numeric IDs mapped to 0, which could produce a counter
      // lower than an existing string-form ID. Use reduce instead so we can
      // explicitly skip non-finite values and always start above every
      // existing message ID regardless of its original type.
      const maxId = initialMessagesAndId.messages.reduce((max, m) => {
        const id = typeof m.id === 'number' ? m.id : Number(m.id);
        return Number.isFinite(id) && id > 0 ? Math.max(max, id) : max;
      }, 100);
      return maxId + 1;
    })()
  );
  const feedbackCounterRef = useRef(200);
  const micPermissionInFlightRef = useRef<Promise<boolean> | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  // Guards against double-saving the same session when both visibilitychange
  // and the unmount cleanup fire in rapid succession (e.g. tab close on
  // mobile). Reset to false at the start of every new session.
  const hasSavedCurrentSessionRef = useRef(false);
  const ttsActiveRef = useRef(false);
  const sessionStartRef = useRef<number | null>(null);
  const genderRef = useRef(gender);
  const languageRef = useRef(language);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const localAudioUrlsRef = useRef<string[]>([]);
  const audioBlobsRef = useRef<Record<number, Blob>>({});
  const audioPlayersRef = useRef<
    Record<
      number,
      { audio: HTMLAudioElement; url: string; createdUrl: boolean; timeoutId?: number }
    >
  >({});

  // Mounted flag to avoid creating DOM/audio resources after unmount.
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    selectedMicIdRef.current = selectedMicId;
  }, [selectedMicId]);
  // `currentUser` is initialised from `initialUser` in the useState initializer above.
  // We intentionally avoid calling setState synchronously from an effect here.

  // Enumerate real microphone devices and keep the list fresh whenever the
  // user plugs/unplugs hardware. Device labels are empty strings until mic
  // permission is granted, so we re-enumerate after a successful getUserMedia.
  const refreshMicDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices
        .filter(d => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        }));
      setMicDevices(mics);
      setSelectedMicId(prev => {
        const stillPresent = mics.some(m => m.deviceId === prev);
        if (stillPresent) return prev;
        const first = mics[0]?.deviceId ?? '';
        selectedMicIdRef.current = first;
        return first;
      });
    } catch {
      // enumerateDevices can throw in restricted contexts; ignore.
    }
  }, []);

  // Keep a stable ref so the devicechange listener is registered exactly once
  // with an empty-deps effect (same pattern as persistSessionRef). This makes
  // the listener lifetime explicit and avoids any risk of stale closures or
  // duplicate registrations if refreshMicDevices identity ever changes.
  const refreshMicDevicesRef = useRef(refreshMicDevices);
  useLayoutEffect(() => {
    refreshMicDevicesRef.current = refreshMicDevices;
  }, [refreshMicDevices]);

  useEffect(() => {
    void refreshMicDevicesRef.current();
    const handler = () => void refreshMicDevicesRef.current();
    navigator.mediaDevices?.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', handler);
  }, []); // [] — stable handler, registered exactly once for the component lifetime

  const scrollToBottom = useCallback(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const clearLocalAudioUrls = useCallback(() => {
    localAudioUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    localAudioUrlsRef.current = [];
    // Also forget any in-memory Blob references when we revoke their object URLs.
    audioBlobsRef.current = {};
  }, []);

  // Keep localAudioUrls bounded to avoid unbounded memory growth in long
  // sessions. Trim the oldest entries when we exceed the limit.
  const MAX_LOCAL_AUDIO_URLS = 50;
  const trimLocalAudioUrls = useCallback((max = MAX_LOCAL_AUDIO_URLS) => {
    while (localAudioUrlsRef.current.length > max) {
      const oldest = localAudioUrlsRef.current.shift();
      try {
        if (oldest) URL.revokeObjectURL(oldest);
      } catch {}
    }
  }, []);

  // Revoke any remaining object URLs when the component unmounts.
  useEffect(() => {
    return () => {
      clearLocalAudioUrls();
    };
  }, [clearLocalAudioUrls]);

  // Stop and cleanup any tracked audio player for a message id.
  const stopAndCleanupAudio = useCallback((id: number) => {
    const p = audioPlayersRef.current[id];
    if (!p) return;
    try {
      p.audio.pause();
    } catch {}
    try {
      p.audio.removeAttribute('src');
      // Some browsers need load() to fully detach the element
      // and allow GC to reclaim resources.
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      p.audio.load && p.audio.load();
    } catch {}
    if (p.timeoutId) {
      try {
        clearTimeout(p.timeoutId);
      } catch {}
    }
    if (p.createdUrl) {
      try {
        URL.revokeObjectURL(p.url);
      } catch {}
      const idx = localAudioUrlsRef.current.indexOf(p.url);
      if (idx !== -1) localAudioUrlsRef.current.splice(idx, 1);
    }
    delete audioPlayersRef.current[id];
  }, []);

  // Ensure all tracked audio players are cleaned on unmount.
  useEffect(() => {
    const players = audioPlayersRef.current;
    return () => {
      Object.keys(players).forEach(k => {
        try {
          stopAndCleanupAudio(Number(k));
        } catch {}
      });
    };
  }, [stopAndCleanupAudio]);

  // Global promise rejection logger to help diagnose audio playback errors in
  // the wild. This is intentionally non-fatal and only logs extra context.
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      // eslint-disable-next-line no-console
      console.warn('Unhandled promise rejection:', e.reason, e);
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  const startUserAudioCapture = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      return;
    }

    if (!mediaStreamRef.current) {
      const deviceId = selectedMicIdRef.current;
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      });
    }

    const preferredMimeType = 'audio/webm;codecs=opus';
    const recorder = MediaRecorder.isTypeSupported(preferredMimeType)
      ? new MediaRecorder(mediaStreamRef.current, {
          mimeType: preferredMimeType,
        })
      : new MediaRecorder(mediaStreamRef.current);

    audioChunksRef.current = [];
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    recorder.start(100);
    mediaRecorderRef.current = recorder;
  }, []);

  const stopUserAudioCapture = useCallback(async (): Promise<Blob | undefined> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      return undefined;
    }

    if (recorder.state === 'inactive') {
      mediaRecorderRef.current = null;
      if (audioChunksRef.current.length === 0) {
        return undefined;
      }
      const blob = new Blob(audioChunksRef.current, {
        type: recorder.mimeType || 'audio/webm',
      });
      audioChunksRef.current = [];
      return blob.size > 0 ? blob : undefined;
    }

    return await new Promise<Blob | undefined>(resolve => {
      recorder.onstop = () => {
        mediaRecorderRef.current = null;
        const blob = audioChunksRef.current.length
          ? new Blob(audioChunksRef.current, {
              type: recorder.mimeType || 'audio/webm',
            })
          : undefined;
        audioChunksRef.current = [];
        resolve(blob && blob.size > 0 ? blob : undefined);
      };
      recorder.stop();
    });
  }, []);

  const speakText = useCallback((text: string) => {
    if (!text) return;

    setAgentSpeaking(true);

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      const currentLanguage = languageRef.current;
      const currentGender = genderRef.current;
      utt.lang = LANGUAGE_CODES[currentLanguage];
      utt.rate = 1;
      utt.pitch = currentGender === 'Female' ? 1.15 : 0.9;

      const applyVoiceAndSpeak = () => {
        const voices = window.speechSynthesis.getVoices();
        const langPrefix = LANGUAGE_CODES[currentLanguage].split('-')[0];
        const filtered = voices.filter(v => v.lang.startsWith(langPrefix));
        if (filtered.length > 0) {
          const femaleKeywords = /female|woman|zira|samantha|nữ/i;
          const maleKeywords = /male|man|david|mark|nam/i;
          const preferred =
            currentGender === 'Female'
              ? (filtered.find(v => femaleKeywords.test(v.name)) ??
                filtered.find(v => !maleKeywords.test(v.name)) ??
                filtered[0])
              : (filtered.find(v => maleKeywords.test(v.name)) ??
                filtered.find(v => !femaleKeywords.test(v.name)) ??
                filtered[0]);
          utt.voice = preferred;
        }
        ttsActiveRef.current = true;
        setMicEnabled(false);
        utt.onend = () => {
          ttsActiveRef.current = false;
          setAgentSpeaking(false);
          // Only resume listening if the user previously turned the mic on.
          if (userMicIntentRef.current) setMicEnabled(true);
        };
        utt.onerror = () => {
          ttsActiveRef.current = false;
          setAgentSpeaking(false);
          if (userMicIntentRef.current) setMicEnabled(true);
        };
        window.speechSynthesis.speak(utt);
      };

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        applyVoiceAndSpeak();
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.onvoiceschanged = null;
          applyVoiceAndSpeak();
        };
      }
    } else {
      const speakEnd = setTimeout(() => setAgentSpeaking(false), Math.min(text.length * 35, 4000));
      timersRef.current.push(speakEnd);
    }
  }, []);

  const playAgentAudio = useCallback(
    (text: string, audioUrl?: string) => {
      if (!audioUrl) {
        speakText(text);
        return undefined;
      }

      try {
        window.speechSynthesis?.cancel();
        const audio = new Audio(audioUrl);
        ttsActiveRef.current = true;
        setMicEnabled(false);
        setAgentSpeaking(true);
        audio.onended = () => {
          ttsActiveRef.current = false;
          setAgentSpeaking(false);
          if (userMicIntentRef.current) setMicEnabled(true);
        };
        audio.onerror = () => {
          ttsActiveRef.current = false;
          setAgentSpeaking(false);
          if (userMicIntentRef.current) setMicEnabled(true);
          speakText(text);
        };
        void audio.play().catch(() => {
          ttsActiveRef.current = false;
          setAgentSpeaking(false);
          if (userMicIntentRef.current) setMicEnabled(true);
          speakText(text);
        });
      } catch {
        speakText(text);
      }

      return audioUrl;
    },
    [speakText]
  );

  const playMessageAudio = useCallback(
    async (id: number) => {
      if (!isMountedRef.current) return;
      const msg = messagesRef.current.find(m => m.id === id);
      if (!msg) return;

      if (msg.role === 'agent') {
        const audioUrl = msg.minioUrl || msg.audioUrl;
        if (audioUrl) {
          playAgentAudio(msg.text, audioUrl);
        } else {
          speakText(msg.text);
        }
        return;
      }

      // User message playback
      if (!msg.userAudioUrl && !msg.audioBlob && !audioBlobsRef.current[id]) return;

      try {
        let blob: Blob | undefined = msg.audioBlob ?? audioBlobsRef.current[id];

        if (!blob && msg.userAudioUrl) {
          try {
            const resp = await fetch(msg.userAudioUrl);
            if (!isMountedRef.current) return;
            if (resp.ok) blob = await resp.blob();
          } catch {
            // ignore fetch errors
          }
        }

        if (blob) {
          const audioEl = document.createElement('audio');
          const canPlay = audioEl.canPlayType(blob.type || 'audio/webm;codecs=opus');

          if (!canPlay) {
            try {
              const wavBlob = await toWav(blob);
              if (!isMountedRef.current) return;
              const wavUrl = URL.createObjectURL(wavBlob);
              // Track and trim stored URLs to avoid unbounded growth.
              localAudioUrlsRef.current.push(wavUrl);
              trimLocalAudioUrls();

              // Stop any existing player for this message id before starting.
              stopAndCleanupAudio(id);

              const audio = new Audio(wavUrl);
              audioPlayersRef.current[id] = { audio, url: wavUrl, createdUrl: true };
              audio.addEventListener('ended', () => stopAndCleanupAudio(id));
              audio.addEventListener('error', () => stopAndCleanupAudio(id));

              if (!isMountedRef.current) {
                stopAndCleanupAudio(id);
                return;
              }

              void audio.play().catch(err => {
                stopAndCleanupAudio(id);
                console.warn('User audio playback failed for', wavUrl, err);
              });
            } catch (err) {
              console.warn('Failed to convert user audio to WAV', err);
              if (!isMountedRef.current) return;
              speakText(msg.text);
            }
          } else {
            let url: string;
            let createdUrl = false;
            if (msg.userAudioUrl) {
              url = msg.userAudioUrl;
            } else {
              if (!isMountedRef.current) return;
              url = URL.createObjectURL(blob);
              createdUrl = true;
              localAudioUrlsRef.current.push(url);
              trimLocalAudioUrls();
            }

            stopAndCleanupAudio(id);
            const audio = new Audio(url);
            audioPlayersRef.current[id] = { audio, url, createdUrl };
            audio.addEventListener('ended', () => stopAndCleanupAudio(id));
            audio.addEventListener('error', () => stopAndCleanupAudio(id));

            if (!isMountedRef.current) {
              stopAndCleanupAudio(id);
              return;
            }

            void audio.play().catch(err => {
              stopAndCleanupAudio(id);
              console.warn('User audio playback failed for', url, err);
            });
          }
        } else if (msg.userAudioUrl) {
          stopAndCleanupAudio(id);
          if (!isMountedRef.current) return;
          const audio = new Audio(msg.userAudioUrl);
          audioPlayersRef.current[id] = { audio, url: msg.userAudioUrl, createdUrl: false };
          audio.addEventListener('ended', () => stopAndCleanupAudio(id));
          audio.addEventListener('error', () => stopAndCleanupAudio(id));

          if (!isMountedRef.current) {
            stopAndCleanupAudio(id);
            return;
          }

          void audio.play().catch(err => {
            stopAndCleanupAudio(id);
            console.warn('User audio playback failed for', msg.userAudioUrl, err);
          });
        } else {
          speakText(msg.text);
        }
      } catch (err) {
        console.warn('User audio playback error', err);
      }
    },
    [playAgentAudio, speakText, stopAndCleanupAudio, trimLocalAudioUrls]
  );

  // Removed mock score/mistake generators — feedback comes only from Azure assessment.

  const sendChatMessage = useCallback(
    async (text: string, audioBlob?: Blob) => {
      const trimmed = text.trim();
      if (!trimmed || agentTyping) return;

      const session = getAuthSession();
      const userId = msgCounterRef.current++;
      const typingId = msgCounterRef.current++;
      const userMsg: Message = {
        id: userId,
        role: 'user',
        text: trimmed,
        timestamp: new Date(),
        userAudioUrl: audioBlob ? URL.createObjectURL(audioBlob) : undefined,
        audioBlob: audioBlob ?? undefined,
        assessmentStatus: audioBlob && session?.token ? 'pending' : 'unavailable',
      };

      if (userMsg.userAudioUrl) {
        localAudioUrlsRef.current.push(userMsg.userAudioUrl);
        trimLocalAudioUrls();
      }
      // Keep a memory-only reference to the original Blob so replay works
      // even if something else later clears the `audioBlob` property.
      if (audioBlob) audioBlobsRef.current[userId] = audioBlob;

      setMessages((prev: Message[]) => [
        ...prev,
        userMsg,
        {
          id: typingId,
          role: 'agent',
          text: '',
          timestamp: new Date(),
          typing: true,
        },
      ]);
      setChatInput('');
      inputRef.current?.focus();
      setAgentTyping(true);

      try {
        if (session?.token) {
          const data = await chatRespond({
            token: session.token,
            text: trimmed,
            audioBlob,
            topic:
              TOPICS.find(item => item.id === (topic as TopicId | undefined))?.label ??
              topic ??
              undefined,
            subOption: subOption ?? undefined,
            voiceGender: gender,
          });

          if (data.conversation_id) {
            setCurrentConversationId(data.conversation_id);
          }

          const responseText =
            String(data.response_text || '').trim() || 'I am ready to help you practice.';

          // audio_base64 is the real-time delivery format — always use it for
          // immediate playback. assistant_audio_url is a MinIO presigned URL with
          // a Docker-internal hostname (minio:9000) that the browser cannot reach;
          // it is only useful for conversation history replay via the messages API.
          let audioUrl: string | undefined;
          if (data.audio_base64) {
            audioUrl = `data:audio/mpeg;base64,${data.audio_base64}`;
          } else if (data.assistant_audio_url) {
            audioUrl = data.assistant_audio_url;
          }

          const playedUrl = playAgentAudio(responseText, audioUrl);

          setMessages((prev: Message[]) =>
            prev.map(message =>
              message.id === userId
                ? {
                    ...message,
                    // Keep the local blob URL (created before the API call).
                    // MinIO presigned URLs use the internal Docker hostname and
                    // are unreachable from the browser.
                    userAudioUrl: message.userAudioUrl || data.user_audio_url || undefined,
                  }
                : message.id === typingId
                  ? {
                      ...message,
                      text: responseText,
                      typing: false,
                      audioUrl: playedUrl,
                      minioUrl: data.assistant_audio_url || undefined,
                    }
                  : message
            )
          );
        } else {
          await new Promise<void>(res => {
            timersRef.current.push(setTimeout(res, 700 + Math.random() * 600));
          });
          const reply = AGENT_REPLIES[Math.floor(Math.random() * AGENT_REPLIES.length)];
          playAgentAudio(reply);
          setMessages((prev: Message[]) =>
            prev.map(message =>
              message.id === typingId ? { ...message, text: reply, typing: false } : message
            )
          );
        }

        // If we have an audio blob and a logged-in session, call the backend
        // pronunciation assessment API and map the Azure response into the
        // message `scoreDetails` and `mistakes` shown in the AI Feedback panel.
        if (session?.token && audioBlob) {
          try {
            const assessment = await assessPronunciation({
              token: session.token,
              audioBlob,
              referenceText: trimmed,
              language: LANGUAGE_CODES[language],
            });

            const pron = Math.round(assessment.pron_score ?? 0);
            const accuracy = Math.round(assessment.accuracy_score ?? 0);
            const fluency = Math.round(assessment.fluency_score ?? 0);
            const completenessRaw = assessment.completeness_score;
            const completeness = completenessRaw != null ? Math.round(completenessRaw) : null;

            // Fixed-weight overall when completeness is available:
            // Pronunciation 35%, Accuracy 35%, Fluency 20%, Completeness 10%.
            // If completeness is not provided by the backend, fall back to previous weights
            // (Accuracy 40%, Pronunciation 40%, Fluency 20%).
            let overall: number;
            if (completeness != null) {
              overall = Math.round(
                accuracy * 0.35 + pron * 0.35 + fluency * 0.2 + completeness * 0.1
              );
            } else {
              overall = Math.round(accuracy * 0.4 + pron * 0.4 + fluency * 0.2) || pron;
            }

            const scoreDetails = {
              overall,
              pronunciation: pron,
              fluency,
              accuracy,
              completeness: completeness ?? undefined,
            };

            const words = assessment.words ?? [];
            const mistakes: Mistake[] =
              words.flatMap(w => {
                const err = w.error_type;
                const acc = Math.round((w.accuracy_score ?? 0) as number);

                const phonemes = (w.phonemes || []).map(p => ({
                  phoneme: p.phoneme,
                  accuracy_score: Math.round(p.accuracy_score ?? 0),
                }));
                const lowPhonemes = phonemes.filter(p => p.accuracy_score < 80);
                const phonemeNote =
                  lowPhonemes.length > 0
                    ? ` Phonemes: ${lowPhonemes
                        .map(p => `${p.phoneme} ${p.accuracy_score}%`)
                        .join(', ')}`
                    : '';

                if (err && err !== 'None') {
                  const type = err === 'Mispronunciation' ? 'Pronunciation' : 'Fluency';
                  return [
                    {
                      wrong: w.word || '—',
                      correct: w.word || '—',
                      type,
                      note: `Accuracy ${acc}%` + phonemeNote,
                      phonemes: lowPhonemes.length > 0 ? lowPhonemes : undefined,
                    },
                  ];
                }

                if (acc < 90 || lowPhonemes.length > 0) {
                  return [
                    {
                      wrong: w.word || '—',
                      correct: w.word || '—',
                      type: 'Pronunciation',
                      note: `Accuracy ${acc}%` + phonemeNote,
                      phonemes: lowPhonemes.length > 0 ? lowPhonemes : undefined,
                    },
                  ];
                }
                return [] as Mistake[];
              }) || [];

            setMessages((prev: Message[]) =>
              prev.map(message =>
                message.id === userId
                  ? {
                      ...message,
                      scoreDetails,
                      mistakes,
                      score: overall,
                      assessmentStatus: 'available',
                    }
                  : message
              )
            );

            const newFb: FeedbackItem = {
              id: feedbackCounterRef.current++,
              type: 'pronunciation',
              original: trimmed,
              corrected: '',
              explanation: `Overall ${overall} — pronunciation ${pron}${
                scoreDetails.completeness != null
                  ? ` — completeness ${scoreDetails.completeness}`
                  : ''
              }`,
              timestamp: new Date(),
            };
            setFeedbacks((prev: FeedbackItem[]) => [newFb, ...prev]);
            setExpandedMsgId(null);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setMessages((prev: Message[]) =>
              prev.map(message =>
                message.id === userId
                  ? { ...message, assessmentStatus: 'failed', assessmentNote: msg }
                  : message
              )
            );
          }
        } else {
          // No assessment available (either no audio or no session token).
          // Do not generate mock feedback — leave feedback list unchanged.
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Chat request failed';
        setMessages((prev: Message[]) =>
          prev.map(message =>
            message.id === typingId
              ? {
                  ...message,
                  text: `Agent error: ${errorMessage}`,
                  typing: false,
                }
              : message
          )
        );
        setAgentSpeaking(false);
        setMicEnabled(true);
      } finally {
        setAgentTyping(false);
      }
    },
    [agentTyping, messages, playAgentAudio, topic, subOption, gender, language, trimLocalAudioUrls]
  );

  // Auto-start/stop recognition when mic toggle or connection changes
  useEffect(() => {
    if (status !== 'connected' || !micEnabled) {
      recognitionRef.current?.stop();
      // Defer state updates to avoid triggering cascading renders inside
      // the effect body (keeps behaviour identical while satisfying the
      // lint rule).
      setTimeout(() => {
        try {
          setIsRecording(false);
          setChatInput('');
        } catch {}
      }, 0);
      void stopUserAudioCapture();
      return;
    }

    // When the user switches mic, stop the current stream so ensureMicPermission
    // opens a fresh one pointing at the newly selected device.
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      alert(t('va.alert.noBrowserSupport'));
      // Defer the setState to avoid synchronous setState inside the effect
      // which can trigger cascading renders.
      setTimeout(() => {
        try {
          setMicEnabled(false);
        } catch {}
      }, 0);
      return;
    }

    let stopped = false;
    let consecutiveErrors = 0;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    // Pre-flight check: make sure we actually have mic permission in this
    // browsing context. Inside cross-origin iframes (e.g. previews embedded
    // in another site) the Speech API often fails silently without this.
    const ensureMicPermission = (): Promise<boolean> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert(t('va.alert.noMicAPI'));
        return Promise.resolve(false);
      }
      // If we already hold a stream with at least one live track, reuse it
      // instead of re-prompting. Otherwise stop any dead/old tracks first
      // so the OS-level "mic in use" indicator goes away cleanly.
      const existing = mediaStreamRef.current;
      if (existing) {
        const hasLiveTrack = existing.getTracks().some(tr => tr.readyState === 'live');
        if (hasLiveTrack) return Promise.resolve(true);
        existing.getTracks().forEach(tr => tr.stop());
        mediaStreamRef.current = null;
      }

      // If a concurrent call is already waiting for getUserMedia, share its
      // promise instead of opening a second hardware stream in parallel.
      // This eliminates the race where two callers both pass the live-track
      // check above before either has received a stream from the OS.
      if (micPermissionInFlightRef.current) {
        return micPermissionInFlightRef.current;
      }

      const p = (async (): Promise<boolean> => {
        try {
          const deviceId = selectedMicIdRef.current;
          const probe = await navigator.mediaDevices.getUserMedia({
            audio: {
              ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
              channelCount: 1,
            },
          });
          // If the session was stopped while we were awaiting (e.g. user
          // clicked Disconnect during the OS permission prompt), discard the
          // probe immediately so the hardware indicator turns off cleanly.
          if (stopped) {
            probe.getTracks().forEach(tr => tr.stop());
            return false;
          }
          // Re-enumerate after a successful grant so device labels
          // (empty strings before permission) get populated in the UI.
          void refreshMicDevicesRef.current();
          // If a concurrent caller already populated the ref while we
          // awaited, prefer that stream to avoid leaving two streams open.
          if (
            mediaStreamRef.current &&
            mediaStreamRef.current.getTracks().some(tr => tr.readyState === 'live')
          ) {
            probe.getTracks().forEach(tr => tr.stop());
          } else {
            mediaStreamRef.current = probe;
          }
          return true;
        } catch (err) {
          const name = (err as { name?: string })?.name || '';
          console.error('[VoiceAgent] getUserMedia failed:', err);
          if (name === 'NotAllowedError' || name === 'SecurityError') {
            alert(t('va.alert.micBlockedPreview'));
          } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
            alert(t('va.alert.micNotFound'));
          } else if (name === 'NotReadableError') {
            alert(t('va.alert.micBusy'));
          } else {
            alert(
              t('va.alert.micGeneric', {
                detail: name || t('va.alert.unknownError'),
              })
            );
          }
          return false;
        } finally {
          // Always release the lock so future calls can proceed normally.
          micPermissionInFlightRef.current = null;
        }
      })();

      micPermissionInFlightRef.current = p;
      return p;
    };

    function startListening() {
      if (stopped) return;

      // Detach all event handlers from the previous instance before discarding it
      // to prevent accumulated listeners from firing during garbage collection.
      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
      }

      const recognition = new SpeechRecognitionAPI!();
      recognition.lang = LANGUAGE_CODES[language];
      recognition.interimResults = true;
      recognition.continuous = false;
      recognitionRef.current = recognition;
      let hasSentFinal = false;

      recognition.onstart = () => {
        consecutiveErrors = 0;
        setIsRecording(true);
        void startUserAudioCapture();
      };

      recognition.onresult = async (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) final += transcript;
          else interim += transcript;
        }
        if (final && !hasSentFinal) {
          hasSentFinal = true;
          const recordedAudio = await stopUserAudioCapture();
          setChatInput('');
          sendChatMessage(final, recordedAudio);
        } else {
          setChatInput(interim);
        }
      };

      recognition.onerror = (event: Event) => {
        const err = (event as { error?: string }).error || '';
        // Always log so we can diagnose silent failures.
        console.warn('[VoiceAgent] SpeechRecognition error:', err);
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          stopped = true;
          setMicEnabled(false);
          alert(t('va.alert.recogBlockedPreview'));
        } else if (err === 'audio-capture') {
          stopped = true;
          setMicEnabled(false);
          alert(t('va.alert.noSignal'));
        } else if (err === 'network') {
          // Speech API needs network for some engines; back off harder.
          consecutiveErrors += 3;
        } else if (err !== 'no-speech' && err !== 'aborted') {
          consecutiveErrors += 1;
        }
        setIsRecording(false);
        void stopUserAudioCapture();
      };

      recognition.onend = () => {
        setIsRecording(false);
        void stopUserAudioCapture();
        if (stopped) return;
        // If we keep failing back-to-back, stop trying so we don't burn CPU
        // in an infinite restart loop.
        if (consecutiveErrors >= 4) {
          stopped = true;
          setMicEnabled(false);
          console.error('[VoiceAgent] giving up after repeated SpeechRecognition errors');
          alert(t('va.alert.recogGivingUp'));
          return;
        }
        // Back off a bit more on each error to be polite to the engine.
        const delay = 200 + consecutiveErrors * 400;
        restartTimer = setTimeout(() => {
          if (!stopped) startListening();
        }, delay);
      };

      try {
        recognition.start();
      } catch (err) {
        // start() throws if called while already started — log and let onend
        // handle the restart cycle.
        console.warn('[VoiceAgent] recognition.start() threw:', err);
      }
    }

    void ensureMicPermission().then(ok => {
      if (ok && !stopped) startListening();
    });

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      // Avoid calling setState synchronously from cleanup — it's unnecessary
      // during unmount and can be racy. We simply stop the stream and let
      // any in-flight handlers update UI when appropriate.
      void stopUserAudioCapture();
    };
  }, [
    status,
    micEnabled,
    language,
    selectedMicId,
    sendChatMessage,
    startUserAudioCapture,
    stopUserAudioCapture,
    t,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (chatInput.trim() && status === 'connected' && !agentTyping) {
          sendChatMessage(chatInput);
        }
      }
    },
    [chatInput, status, agentTyping, sendChatMessage]
  );

  // Mirror the values persistSession needs into refs. Using useLayoutEffect
  // instead of bare render-body assignments ensures these refs are only
  // updated when React actually commits the render to the DOM. In Concurrent
  // Mode, React can render a component multiple times without committing
  // (e.g. for priority-based preemption); bare assignments would leave refs
  // holding values from an abandoned, never-committed render, which could
  // cause persistSession to save stale data.
  const messagesRef = useRef<Message[]>([]);
  const sessionSummaryRef = useRef<typeof sessionSummary | null>(null);
  const topicRef = useRef<TopicId | null>(null);
  const customTopicLabelRef = useRef<string | null>(null);
  // Sync refs with latest values on commit. This pattern intentionally
  // mutates `.current` so the persisted handlers read the latest state.
  /* eslint-disable react-hooks/immutability */
  useLayoutEffect(() => {
    messagesRef.current = messages;
    sessionSummaryRef.current = sessionSummary;
    topicRef.current = topic;
    customTopicLabelRef.current = customTopicLabel;
  }, [messages, sessionSummary, topic, customTopicLabel]);
  /* eslint-enable react-hooks/immutability */
  // ---------------------------------------------------------------------------
  // statusRef + setStatusSync
  // ---------------------------------------------------------------------------
  // statusRef always holds the *latest intended* status — it is updated
  // synchronously by setStatusSync so that handleConnect / startNewSession
  // called in the same event-loop tick (before React re-renders) always read
  // the correct value.
  //
  // IMPORTANT: never call setStatus() directly. Always go through
  // setStatusSync so the ref and React state are kept in sync atomically.
  // Scattering `statusRef.current = X; setStatus(X)` across multiple
  // call-sites risks the two diverging if a future edit updates one but not
  // the other. Using a single helper eliminates that class of bug entirely.
  const statusRef = useRef<ConnectionStatus>(status);
  const setStatusSync = useCallback((next: ConnectionStatus) => {
    statusRef.current = next; // synchronous — readable by same-tick callers
    setStatus(next); // triggers async React re-render
  }, []); // stable: closes only over refs and the React state setter (both stable)

  const persistSession = useCallback(() => {
    if (hasSavedCurrentSessionRef.current) return;
    const currentMessages = messagesRef.current;
    if (!currentMessages.length) return;
    hasSavedCurrentSessionRef.current = true;
    const currentSummary = sessionSummaryRef.current;
    const currentTopic = topicRef.current;
    const currentCustomTopicLabel = customTopicLabelRef.current;
    const topicLabel =
      currentCustomTopicLabel ??
      TOPICS.find(t => t.id === currentTopic)?.label ??
      'Daily Conversation';
    const startedAt = sessionStartRef.current ?? Date.now();
    if (!sessionIdRef.current) {
      sessionIdRef.current = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    saveSessionHistory({
      id: sessionIdRef.current,
      topic: topicLabel,
      topicKey: currentTopic,
      avgScore: currentSummary?.scores.overall ?? 0,
      sentenceCount: currentSummary?.sentenceCount ?? 0,
      corrections: currentSummary?.totalErrors ?? 0,
      durationMs: Date.now() - startedAt,
      scores: currentSummary?.scores ?? null,
      topErrors: currentSummary?.topErrors ?? [],
      messages: currentMessages,
    });
  }, []);

  const startNewSession = useCallback(() => {
    window.speechSynthesis?.cancel();
    ttsActiveRef.current = false;
    // Allow the new session to be persisted when the time comes.
    hasSavedCurrentSessionRef.current = false;
    // Cancel any in-flight connect timers from a previous startNewSession /
    // handleConnect call so they can't fire after we've moved on.
    clearTimers();
    const myVersion = ++sessionVersionRef.current;
    setMessages([]);
    setExpandedMsgId(null);
    setSummaryDismissed(false);
    clearLocalAudioUrls();
    setFeedbacks([]);
    sessionStartRef.current = Date.now();
    sessionIdRef.current = null;

    if (currentConversationId) {
      const session = getAuthSession();
      const convId = currentConversationId;
      const clearedAt = new Date().toISOString();
      clearConversation(session?.token ?? '', convId)
        .then(() => dbClearConversationData(convId, clearedAt))
        .then(() => evictConversationAudio(convId))
        .then(() => queryClient.invalidateQueries({ queryKey: ['conversations'] }))
        .catch(err => console.warn('Failed to sync clear:', err));
    }
    setCurrentConversationId(null);

    setStatusSync('connecting');

    const t0 = setTimeout(() => {
      // Bail out if a newer session/connect has superseded this one.
      if (sessionVersionRef.current !== myVersion) return;
      setStatusSync('connected');
      setAgentTyping(false);
      setAgentSpeaking(false);
    }, 600);

    timersRef.current.push(t0);
  }, [clearTimers, clearLocalAudioUrls, setStatusSync, currentConversationId]);

  const handleConnect = useCallback(() => {
    // Read status from a ref so rapid clicks within a single event-loop
    // tick (before React commits the next render) always see the very
    // latest committed status — never a stale closure value.
    const currentStatus = statusRef.current;
    if (currentStatus === 'connected') {
      // Bump the version FIRST so any in-flight `connecting → connected`
      // setTimeout from a prior handleConnect call is immediately
      // invalidated by its own version-check guard. clearTimers() also
      // cancels them, but bumping the version is belt-and-suspenders
      // against a callback that already fired and is waiting in the
      // microtask queue.
      ++sessionVersionRef.current;
      window.speechSynthesis?.cancel();
      ttsActiveRef.current = false;
      setSummaryDismissed(false);
      setStatusSync('disconnected');
      setAgentSpeaking(false);
      setAgentTyping(false);
      setExpandedMsgId(null);
      clearTimers();
      persistSession();
      return;
    }
    if (currentStatus === 'disconnected') {
      setSummaryDismissed(true);
      clearTimers();
      // Allow the upcoming session to be persisted when it ends.
      hasSavedCurrentSessionRef.current = false;
      const myVersion = ++sessionVersionRef.current;
      if (sessionStartRef.current === null) {
        sessionStartRef.current = Date.now();
      }
      setStatusSync('connecting');

      const t0 = setTimeout(() => {
        if (sessionVersionRef.current !== myVersion) return;
        setStatusSync('connected');
        setAgentTyping(false);
        setAgentSpeaking(false);
      }, 600);

      timersRef.current.push(t0);
    }
  }, [clearTimers, persistSession, setStatusSync]);

  const persistSessionRef = useRef(persistSession);
  // Keep ref updated synchronously after render but before paint so the
  // handlers (visibilitychange / beforeunload) always see the latest
  // closure. useLayoutEffect mirrors the intent without violating render
  // rules.
  useLayoutEffect(() => {
    persistSessionRef.current = persistSession;
  }, [persistSession]);

  useEffect(() => {
    const onHide = () => {
      try {
        persistSessionRef.current?.();
      } catch {}
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        persistSessionRef.current?.();
      } catch {}
      clearTimers();
      clearLocalAudioUrls();
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    };
  }, [clearTimers, clearLocalAudioUrls]);

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <div
      data-va="root"
      className={`h-screen overflow-hidden bg-[#f5f7fa] text-gray-800 flex flex-col${isDark ? ' va-dark' : ''}`}
    >
      {/* Top bar */}
      <header
        data-va="header"
        className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-[#f5f7fa]"
      >
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 focus:outline-none cursor-pointer"
          title={t('common.dashboard')}
        >
          <div className="w-6 h-6 bg-blue-600 rounded-sm flex items-center justify-center">
            <span className="text-[10px] font-black text-white leading-none">VIN</span>
          </div>
          <span className="text-sm font-semibold text-gray-800">{t('brand.name')}</span>
        </button>

        <div className="flex items-center gap-3">
          <LanguageToggle />
          <button
            onClick={() => setIsDark(v => !v)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title={isDark ? t('va.theme.light') : t('va.theme.dark')}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          {currentUser ? (
            <>
              {/* Dashboard button removed (use logo to navigate to dashboard) */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(v => !v)}
                  className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-lg px-2.5 py-1 transition-colors"
                  title={currentUser.display_name || currentUser.email || t('common.user')}
                >
                  <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
                    {currentUser.display_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <span className="text-xs text-gray-700">
                    {currentUser.display_name || currentUser.email || t('common.user')}
                  </span>
                  <svg
                    className={`w-3 h-3 text-gray-500 transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-gray-200 shadow-lg z-40 overflow-hidden animate-fadeIn">
                      <div className="px-3 py-2.5 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {currentUser.display_name || t('common.user')}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{currentUser.email}</div>
                      </div>
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowLogoutConfirm(true);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" /> {t('common.signOut')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
              >
                <LogIn className="w-3 h-3" /> {t('common.signIn')}
              </button>
              <button
                onClick={() => navigate('/register')}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-gray-900 rounded-lg transition-colors"
              >
                <UserPlus className="w-3 h-3" /> {t('common.signUp')}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Description bar */}
      <div
        data-va="descbar"
        className="flex items-center justify-between px-4 py-1.5 border-b border-gray-200 bg-[#f5f7fa]/80 text-xs text-gray-500"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-700">{t('va.descbar.label')}</span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-700">
            {customTopicLabel ?? TOPICS.find(tp => tp.id === topic)?.label ?? 'Daily Conversation'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="button-settings"
            onClick={() => setShowSettings(v => !v)}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-700 hover:text-gray-400"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            data-testid="button-connect"
            onClick={handleConnect}
            disabled={isConnecting}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${
              isConnected
                ? 'bg-red-600/80 hover:bg-red-600 text-gray-900 border border-red-500/50'
                : isConnecting
                  ? 'bg-blue-600/50 text-blue-300 border border-blue-300 cursor-not-allowed'
                  : 'bg-white text-gray-900 hover:bg-gray-100 border border-gray-300'
            }`}
          >
            {isConnected
              ? t('va.connect.disconnect')
              : isConnecting
                ? t('va.connect.connecting')
                : t('va.connect.connect')}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div data-va="content" className="flex flex-1 overflow-hidden">
        {/* Left panel: Audio & Video */}
        <div
          data-va="left"
          className="w-[320px] shrink-0 border-r border-gray-200 flex flex-col bg-white overflow-visible"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-700 tracking-wide">
              {t('va.left.audioSettings')}
            </span>
            <SelectDropdown value={gender} options={GENDERS} onChange={setGender} />
          </div>

          {/* Agent row */}
          <div className="px-2 mt-2 space-y-2">
            <div className="bg-linear-to-r from-blue-50 to-indigo-50 rounded-md border border-gray-200 flex items-center gap-2.5 px-2 py-2">
              <div
                className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-all duration-500 ${
                  agentSpeaking
                    ? 'bg-blue-600/30 border-2 border-blue-500/60 shadow-lg shadow-blue-200'
                    : 'bg-blue-100 border border-blue-200'
                }`}
              >
                <SiOpenai className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-gray-700 mb-1">Agent</div>
                {isConnected || isConnecting ? (
                  <AgentWaveform active={agentSpeaking} />
                ) : (
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 14 }).map((_, i) => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-500/30" />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Microphone selector */}
            <div className="px-2 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-gray-700 tracking-widest uppercase">
                  {t('va.left.microphone')}
                </span>
                <div className="flex items-center gap-2">
                  <DeviceSelect
                    value={
                      micDevices.find(d => d.deviceId === selectedMicId)?.label ??
                      (micDevices[0]?.label || 'Default Mic')
                    }
                    options={micDevices.length > 0 ? micDevices.map(d => d.label) : ['Default Mic']}
                    onChange={label => {
                      const device = micDevices.find(d => d.label === label);
                      if (device) {
                        setSelectedMicId(device.deviceId);
                        selectedMicIdRef.current = device.deviceId;
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* User row */}
            <div className="bg-linear-to-r from-violet-50 to-purple-50 rounded-md border border-gray-200 flex items-center gap-2.5 px-2 py-2">
              <div
                className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-all duration-500 ${
                  isRecording
                    ? 'bg-violet-600/30 border-2 border-violet-500/60 shadow-lg shadow-violet-200'
                    : 'bg-violet-100 border border-violet-200'
                }`}
              >
                {currentUser?.display_name?.[0] ? (
                  <span className="text-sm font-semibold text-violet-700">
                    {currentUser.display_name[0].toUpperCase()}
                  </span>
                ) : (
                  <User className="w-5 h-5 text-violet-700" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-gray-700 mb-1 truncate">
                  {currentUser?.display_name || t('common.you')}
                </div>
                {isConnected || isConnecting ? (
                  <MicWaveform active={micEnabled && isConnected} />
                ) : (
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 14 }).map((_, i) => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-500/30" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AI Feedback Panel */}
          <div className="px-2 mt-3 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-gray-700 tracking-widest uppercase">
                {t('va.left.aiFeedback')}
              </span>
              {selectedMsg ? (
                <button
                  type="button"
                  onClick={() => setExpandedMsgId(null)}
                  className="text-[9px] text-gray-500 hover:text-gray-800 underline"
                >
                  {t('va.left.showLatest')}
                </button>
              ) : isAutoLatest ? (
                <span className="text-[9px] bg-violet-100 text-violet-700 border border-violet-200 rounded-full px-1.5 py-0.5">
                  {t('va.left.latest')}
                </span>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin pr-0.5">
              {displayMsg ? (
                <>
                  <div className="rounded-md border border-violet-200 bg-violet-50 p-2 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-violet-700">
                        {selectedMsg ? t('va.left.selectedSentence') : t('va.left.latestSentence')}
                      </span>
                      {displayMsg.userAudioUrl && (
                        <button
                          type="button"
                          onClick={() => void playMessageAudio(displayMsg.id)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold text-violet-700 bg-white border border-violet-200 hover:bg-violet-100 transition-colors"
                        >
                          <Volume2 className="w-2.5 h-2.5" />
                          {t('common.replay')}
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-800 italic leading-snug">
                      &ldquo;{displayMsg.text}&rdquo;
                    </p>

                    {displayMsg.assessmentStatus === 'pending' && (
                      <div className="rounded-md border border-yellow-200 bg-yellow-50 p-2 flex items-center gap-2 mt-2 animate-fadeIn">
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
                        <p className="text-[10px] text-yellow-700 leading-snug">
                          {t('va.left.assessing')}
                        </p>
                      </div>
                    )}
                  </div>

                  {displayMsg.scoreDetails && (
                    <div className="rounded-md border border-gray-200 bg-white p-2 animate-fadeIn">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-600 block mb-1.5">
                        {t('va.left.scoreBreakdown')}
                      </span>
                      <div className="flex flex-col gap-1">
                        {(() => {
                          const base: Array<[string, number]> = [
                            [t('va.score.overall'), displayMsg.scoreDetails.overall],
                            [t('va.score.pronunciation'), displayMsg.scoreDetails.pronunciation],
                            [t('va.score.fluency'), displayMsg.scoreDetails.fluency],
                            [t('va.score.accuracy'), displayMsg.scoreDetails.accuracy],
                          ];
                          if (displayMsg.scoreDetails.completeness != null) {
                            base.push([
                              t('va.score.completeness'),
                              displayMsg.scoreDetails.completeness,
                            ]);
                          }
                          return base;
                        })().map(([label, val]) => {
                          const color =
                            val >= 85
                              ? 'bg-green-500'
                              : val >= 70
                                ? 'bg-yellow-500'
                                : 'bg-orange-500';
                          return (
                            <div key={label} className="flex items-center gap-1.5">
                              <span className="text-[9px] text-gray-600 w-16 shrink-0">
                                {label}
                              </span>
                              <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${color} rounded-full`}
                                  style={{ width: `${val}%` }}
                                />
                              </div>
                              <span className="text-[9px] font-bold text-gray-700 w-5 text-right tabular-nums">
                                {val}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-600 block px-1">
                    {displayMsg.mistakes && displayMsg.mistakes.length > 0
                      ? t('va.left.errorsCount', {
                          n: displayMsg.mistakes.length,
                        })
                      : t('va.left.errors')}
                  </span>

                  {!displayMsg.mistakes || displayMsg.mistakes.length === 0 ? (
                    <div className="rounded-md border border-green-200 bg-green-50 p-2 flex items-start gap-1.5 animate-fadeIn">
                      <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-green-700 leading-snug">
                        {t('va.left.noIssues')}
                      </p>
                    </div>
                  ) : (
                    displayMsg.mistakes.map((m, i) => {
                      const map: Record<typeof m.type, FeedbackType> = {
                        Pronunciation: 'pronunciation',
                        Grammar: 'grammar',
                        'Word choice': 'vocabulary',
                        Fluency: 'fluency',
                      };
                      const meta = FEEDBACK_ICON[map[m.type]];
                      const Icon = meta.icon;
                      return (
                        <div key={i} className={`rounded-md border p-2 ${meta.bg} animate-fadeIn`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon className={`w-3 h-3 shrink-0 ${meta.color}`} />
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider ${meta.color}`}
                            >
                              {t(`va.mistake.${m.type}`)}
                            </span>
                          </div>
                          {m.wrong !== '—' && (
                            <p className="text-[10px] text-red-500 opacity-80 line-through mb-0.5 leading-snug">
                              {m.wrong}
                            </p>
                          )}
                          {m.correct !== '—' && (
                            <p className="text-[10px] text-green-600 font-medium mb-1 leading-snug">
                              {m.correct}
                            </p>
                          )}
                          {m.note && (
                            <p className="text-[9px] text-gray-700 leading-relaxed">{m.note}</p>
                          )}
                        </div>
                      );
                    })
                  )}
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-center py-8">
                  <CheckCircle2 className="w-7 h-7 text-gray-400" />
                  <p className="text-[10px] text-gray-500 leading-relaxed px-2">
                    {isConnected
                      ? t('va.left.feedbackEmptyConnected')
                      : t('va.left.feedbackEmptyDisconnected')}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="h-3" />
        </div>

        {/* Right panel: Conversation transcript */}
        <div className="flex-1 flex flex-col">
          {/* Panel top bar */}
          <div
            data-va="conv-header"
            className="flex items-center justify-between px-4 py-2 border-b border-gray-200"
          >
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-gray-700">{t('va.conv.title')}</span>
              {isConnected && (
                <div className="flex items-center gap-1.5">
                  <Circle
                    className={`w-1.5 h-1.5 fill-current ${agentSpeaking ? 'text-blue-600' : 'text-green-400'}`}
                  />
                  <span className="text-[10px] text-gray-600">
                    {agentSpeaking ? t('va.conv.agentSpeaking') : t('va.conv.listening')}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <SiOpenai className="w-4 h-4 text-gray-500" />
                <SelectDropdown value={model} options={MODELS} onChange={setModel} />
              </div>
              <SelectDropdown
                value={language}
                options={LANGUAGES}
                onChange={handleLanguageChange}
              />
            </div>
          </div>

          {/* Messages area */}
          <div
            data-va="messages"
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin"
          >
            {status === 'disconnected' && messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center">
                  <SiOpenai className="w-8 h-8 text-blue-400/50" />
                </div>
                <div className="space-y-1">
                  <p className="text-gray-600 text-sm">
                    {t('va.empty.clickConnectPrefix')}{' '}
                    <span className="font-semibold text-gray-900">{t('va.connect.connect')}</span>{' '}
                    {t('va.empty.clickConnectSuffix')}
                  </p>
                  <p className="text-gray-400 text-xs">{t('va.empty.transcriptHere')}</p>
                </div>
              </div>
            )}

            {showSessionSummary && sessionSummary && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fadeIn"
                role="dialog"
                aria-modal="true"
              >
                <div
                  className="absolute inset-0 bg-black/30"
                  onClick={() => setSummaryDismissed(true)}
                />
                <div className="relative w-full max-w-md rounded-xl border border-violet-200 bg-linear-to-br from-violet-50 via-white to-blue-50 shadow-2xl p-4">
                  <button
                    type="button"
                    onClick={() => setSummaryDismissed(true)}
                    className="absolute top-2 right-2 p-1 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                    aria-label={t('common.close')}
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="flex items-start justify-between gap-3 mb-3 pr-6">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center">
                        <Trophy className="w-5 h-5 text-violet-700" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">
                          {t('va.summary.title')}
                        </h3>
                        <p className="text-[11px] text-gray-500">
                          {t('va.summary.meta', {
                            sentences: sessionSummary.sentenceCount,
                            errors: sessionSummary.totalErrors,
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          persistSession();
                          navigate('/dashboard', {
                            state: { highlightSessionId: sessionIdRef.current },
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-violet-700 bg-white border border-violet-300 hover:bg-violet-50 transition-colors"
                      >
                        <span>📊</span>
                        {t('va.summary.viewDashboard')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSummaryDismissed(true);
                          startNewSession();
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        {t('va.summary.newSession')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {(
                      [
                        [t('va.score.overall'), sessionSummary.scores.overall],
                        [t('va.score.pronShort'), sessionSummary.scores.pronunciation],
                        [t('va.score.fluency'), sessionSummary.scores.fluency],
                        [t('va.score.accuracy'), sessionSummary.scores.accuracy],
                      ] as const
                    ).map(([label, val]) => {
                      const color =
                        val >= 85
                          ? 'text-green-600'
                          : val >= 70
                            ? 'text-yellow-600'
                            : 'text-orange-600';
                      return (
                        <div
                          key={label}
                          className="va-stat-card rounded-md bg-white border border-gray-200 px-2 py-1.5 text-center"
                        >
                          <div className={`va-stat-value text-lg font-bold tabular-nums ${color}`}>
                            {val}
                          </div>
                          <div className="va-stat-label text-[9px] uppercase tracking-wider text-gray-500">
                            {label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {sessionSummary.topErrors.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                        {t('va.summary.topErrors')}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {sessionSummary.topErrors.map(([type, count]) => (
                          <span
                            key={type}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-200"
                          >
                            {t(`va.mistake.${type}`)}
                            <span className="text-red-500/80">×{count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-violet-600" />
                      {t('va.summary.tips')}
                    </div>
                    <ul className="space-y-1">
                      {sessionSummary.tips.map((tip, i) => (
                        <li
                          key={i}
                          className="text-[11px] text-gray-700 leading-snug pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-violet-500"
                        >
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {status === 'connecting' && (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 border border-blue-300 flex items-center justify-center animate-pulse">
                  <SiOpenai className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-blue-500"
                      style={{
                        animation: `dotPulse 1s ease-in-out ${i * 200}ms infinite`,
                      }}
                    />
                  ))}
                </div>
                <p className="text-blue-600/70 text-xs">{t('va.connecting.note')}</p>
              </div>
            )}

            {messages.map(msg => {
              const isUser = msg.role === 'user';
              const canReplay = msg.role === 'agent' || Boolean(msg.userAudioUrl);
              const expandable = isUser && !msg.typing;
              const replay = canReplay
                ? () => {
                    void playMessageAudio(msg.id);
                  }
                : undefined;

              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onReplay={replay}
                  expandable={expandable}
                  expanded={expandedMsgId === msg.id}
                  onToggleExpanded={
                    expandable
                      ? () => setExpandedMsgId(prev => (prev === msg.id ? null : msg.id))
                      : undefined
                  }
                />
              );
            })}

            <div ref={chatBottomRef} />
          </div>

          {/* Chat input bar */}
          <div data-va="input" className="border-t border-gray-200 px-3 py-3 bg-[#f5f7fa]">
            {!isConnected ? (
              <div className="flex items-center justify-center py-2 text-xs text-gray-400">
                {t('va.input.connectHint')}
              </div>
            ) : (
              <div className="flex items-end gap-2">
                {/* Mic toggle (push-to-talk) */}
                <button
                  data-testid="button-mic-toggle"
                  type="button"
                  onClick={() => {
                    const next = !micEnabled;
                    userMicIntentRef.current = next;
                    setMicEnabled(next);
                  }}
                  title={micEnabled ? t('va.input.listening') : t('va.left.microphone')}
                  className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all border ${
                    isRecording
                      ? 'bg-red-100 border-red-300 text-red-600 animate-pulse'
                      : micEnabled
                        ? 'bg-blue-100 border-blue-300 text-blue-600 hover:bg-blue-200'
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                >
                  {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>
                {/* Text input */}
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    data-testid="input-chat"
                    value={chatInput}
                    onChange={e => {
                      setChatInput(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    }}
                    onKeyDown={handleKeyDown}
                    disabled={agentTyping}
                    placeholder={
                      isRecording
                        ? t('va.input.listening')
                        : agentTyping
                          ? t('va.input.agentTyping')
                          : t('va.input.placeholder')
                    }
                    rows={1}
                    data-va="textarea"
                    className={`w-full resize-none rounded-xl border px-3 py-2 text-sm bg-[#f1f5f9] text-gray-800 placeholder-gray-400 outline-none transition-all leading-relaxed
                      ${
                        agentTyping
                          ? 'border-gray-200 opacity-60 cursor-not-allowed'
                          : 'border-gray-200 focus:border-blue-300 focus:ring-1 focus:ring-blue-200'
                      }`}
                    style={{ minHeight: '38px', maxHeight: '120px' }}
                  />
                </div>

                {/* Send button */}
                <button
                  data-testid="button-send-chat"
                  onClick={() => {
                    if (chatInput.trim() && !agentTyping) sendChatMessage(chatInput);
                  }}
                  disabled={!chatInput.trim() || agentTyping}
                  className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    chatInput.trim() && !agentTyping
                      ? 'bg-blue-600 hover:bg-blue-500 text-gray-900 shadow-md shadow-blue-200'
                      : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <SendHorizontal className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Status info below input */}
            {isConnected && (
              <div className="flex items-center justify-between mt-2 px-1">
                <div className="flex items-center gap-2">
                  {agentSpeaking && (
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div
                          key={i}
                          className="w-0.5 rounded-full bg-blue-500"
                          style={{
                            height: `${3 + Math.sin(i * 0.8) * 6}px`,
                            animation: `agentWave 0.8s ease-in-out ${i * 60}ms infinite`,
                            opacity: 0.65,
                          }}
                        />
                      ))}
                      <span className="ml-1 text-[10px] text-blue-600/80">
                        {t('va.conv.agentSpeaking')}
                      </span>
                    </div>
                  )}
                  {agentTyping && !agentSpeaking && (
                    <span className="text-[10px] text-gray-500 italic">
                      {t('va.input.agentTyping')}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-gray-600">
                  {t('va.input.statusHint', {
                    n: messages.filter(m => !m.typing).length,
                  })}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings panel (overlay) — Topic selector */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="mt-18 mr-3 bg-white border border-gray-200 rounded-xl shadow-2xl w-80 p-4 text-sm"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold text-gray-800 mb-1 text-sm">{t('va.settings.title')}</h3>
            <p className="text-[10px] text-gray-500 mb-3">{t('va.settings.subtitle')}</p>
            <div className="space-y-1">
              {TOPICS.map(tp => {
                const tpTitle =
                  t(`topic.${tp.label}.title`) === `topic.${tp.label}.title`
                    ? tp.label
                    : t(`topic.${tp.label}.title`);
                const tpDesc =
                  t(`topic.${tp.label}.desc`) === `topic.${tp.label}.desc`
                    ? tp.desc
                    : t(`topic.${tp.label}.desc`);
                return (
                  <button
                    key={tp.id}
                    onClick={() => {
                      setTopic(tp.id);
                      setCustomTopicLabel(null);
                      setSubOption(null);
                      setShowSettings(false);
                      try {
                        const url = new URL(window.location.href);
                        url.searchParams.set('topic', tp.label);
                        window.history.replaceState({}, '', url.toString());
                      } catch {}
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                      topic === tp.id
                        ? 'bg-blue-100 border border-blue-300 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 border border-transparent'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-medium text-gray-800">{tpTitle}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{tpDesc}</div>
                    </div>
                    {topic === tp.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fadeIn"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-sm w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-xl shrink-0">
                👋
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{t('dash.logout.title')}</h3>
                <p className="text-sm text-gray-500 mt-1">{t('dash.logout.body')}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  clearAuthSession();
                  setCurrentUser(null);
                  if (onLogout) onLogout();
                  navigate('/', { replace: true });
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
              >
                {t('dash.logout.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
