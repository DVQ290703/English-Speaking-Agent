import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { SiOpenai } from "react-icons/si";

import { chatRespond, assessPronunciation } from "../api/chat";
import {
  saveSession as saveSessionHistory,
  getSession as getSessionHistory,
} from "../api/sessionHistory";
import { getAuthSession, clearAuthSession } from "../auth/tokenStorage";
import {
  AgentWaveform,
  DeviceSelect,
  MessageBubble,
  MicWaveform,
  SelectDropdown,
} from "../components/voice-agent";
import type { Message } from "../components/voice-agent";

interface AuthUser {
  display_name: string;
  email?: string;
}

type ConnectionStatus = "disconnected" | "connecting" | "connected";
type Gender = "Male" | "Female";
type Language = "English" | "Vietnamese";
type Model =
  | "OpenAI GPT 5"
  | "OpenAI GPT 4o"
  | "Claude 3.5 Sonnet"
  | "Gemini 1.5 Pro";

type FeedbackType = "grammar" | "vocabulary" | "pronunciation" | "fluency";

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
    color: "text-red-500",
    bg: "bg-red-50 border-red-200",
    label: "Grammar",
  },
  vocabulary: {
    icon: BookOpen,
    color: "text-yellow-500",
    bg: "bg-yellow-50 border-yellow-200",
    label: "Vocabulary",
  },
  pronunciation: {
    icon: Volume2,
    color: "text-purple-600",
    bg: "bg-violet-50 border-purple-500/25",
    label: "Pronunciation",
  },
  fluency: {
    icon: Zap,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    label: "Fluency",
  },
};

const AUTO_FEEDBACKS: Omit<FeedbackItem, "id" | "timestamp">[] = [
  {
    type: "grammar",
    original: "He don't like coffee.",
    corrected: "He doesn't like coffee.",
    explanation:
      'Third-person singular (he/she/it) uses "doesn\'t" not "don\'t" in negative sentences.',
  },
  {
    type: "vocabulary",
    original: "I want to make my English better.",
    corrected: "I want to improve / enhance my English.",
    explanation:
      '"Make better" is informal. Prefer "improve" or "enhance" for more natural, sophisticated English.',
  },
  {
    type: "fluency",
    original: "I... uh... I think that... um... it is good.",
    corrected: "I think it is good.",
    explanation:
      "Try to reduce filler words (uh, um). Pausing briefly is better than filling silence with sounds.",
  },
  {
    type: "grammar",
    original: "She is more taller than her sister.",
    corrected: "She is taller than her sister.",
    explanation:
      'Do not use "more" with one-syllable adjectives. "Taller" is already comparative — "more taller" is a double comparative.',
  },
  {
    type: "pronunciation",
    original: '"Wednesday" /wɛdnɛsdei/',
    corrected: '"Wednesday" /ˈwɛnzdeɪ/',
    explanation:
      "The 'd' in Wednesday is silent. Pronounced as WEN-z-day, not Wed-nes-day.",
  },
  {
    type: "vocabulary",
    original: "The problem is very big.",
    corrected: "The problem is significant / substantial.",
    explanation:
      'Instead of "very + adjective", use stronger single words: "significant", "substantial", or "considerable".',
  },
];

const LANGUAGES: Language[] = ["English", "Vietnamese"];
const MODELS: Model[] = [
  "OpenAI GPT 5",
  "OpenAI GPT 4o",
  "Claude 3.5 Sonnet",
  "Gemini 1.5 Pro",
];
const GENDERS: Gender[] = ["Male", "Female"];

const TOPICS = [
  { id: "daily", label: "Daily Conversation", desc: "Giao tiếp hàng ngày" },
  {
    id: "ielts1",
    label: "IELTS Speaking Part 1",
    desc: "Giới thiệu bản thân, cuộc sống",
  },
  {
    id: "ielts2",
    label: "IELTS Speaking Part 2",
    desc: "Nói dài về một chủ đề",
  },
  {
    id: "ielts3",
    label: "IELTS Speaking Part 3",
    desc: "Thảo luận ý kiến, phân tích",
  },
  { id: "travel", label: "Travel & Tourism", desc: "Du lịch, khám phá" },
  { id: "career", label: "Work & Career", desc: "Công việc, sự nghiệp" },
  { id: "education", label: "Education", desc: "Giáo dục, học tập" },
  { id: "environment", label: "Environment", desc: "Môi trường, thiên nhiên" },
  { id: "technology", label: "Technology", desc: "Công nghệ, đổi mới" },
  { id: "health", label: "Health & Lifestyle", desc: "Sức khỏe, lối sống" },
];
type TopicId = (typeof TOPICS)[number]["id"];

const MICROPHONES = [
  "Microphone Array (AMD Audio Device)",
  "USB Microphone",
  "Built-in Microphone",
  "External Microphone",
];

const LANGUAGE_CODES: Record<Language, string> = {
  English: "en-US",
  Vietnamese: "vi-VN",
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
  onresult:
    | ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => void)
    | null;
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
  "Great point! I agree with your thinking here. To add to that, there are a few additional considerations that might be helpful.",
  "I appreciate you asking about this! It's an area I find quite interesting. The short answer is yes, and here's why that matters in practice.",
  "Absolutely! That's something I can explain clearly. The main idea is straightforward, though the details do get nuanced depending on your specific use case.",
  "Of course! Let me break that down for you step by step so it's easy to follow and understand.",
];

interface VoiceAgentProps {
  currentUser?: AuthUser | null;
  onLogout?: () => void;
}

export default function VoiceAgent({
  currentUser: initialUser = null,
  onLogout,
}: VoiceAgentProps) {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem("va-theme") === "dark";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem("va-theme", isDark ? "dark" : "light");
  }, [isDark]);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    if (initialUser) return initialUser;
    const session = getAuthSession();
    if (!session?.user) return null;
    const u = session.user;
    return {
      display_name: u.display_name || u.name || u.email || "User",
      email: u.email,
    };
  });
  const [topic, setTopic] = useState<TopicId>("daily");
  const [customTopicLabel, setCustomTopicLabel] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("session") && initialMessagesAndId.topic) {
        setTopic(initialMessagesAndId.topic);
        return;
      }
      const raw =
        params.get("topic") || sessionStorage.getItem("va_selected_topic");
      if (!raw) return;
      sessionStorage.removeItem("va_selected_topic");

      const DASHBOARD_TO_TOPIC_ID: Record<string, TopicId> = {
        "Daily Conversation": "daily",
        "IELTS Part 1": "ielts1",
        "IELTS Part 2": "ielts2",
        "Academic Discussion": "ielts3",
        "Describe a person": "ielts2",
        "Describe a place": "ielts2",
        "Job Interview": "career",
        "Office Meeting": "career",
        Presentations: "career",
        Negotiation: "career",
        "Email & Phone": "career",
        Shopping: "daily",
        Healthcare: "health",
        "Family & Friends": "daily",
        Hobbies: "daily",
        "Travel & Tourism": "travel",
        "Food & Restaurant": "travel",
        "Hotel & Booking": "travel",
        "Culture & Customs": "travel",
        "Airport English": "travel",
      };
      const mappedId = DASHBOARD_TO_TOPIC_ID[raw];
      if (mappedId) setTopic(mappedId);
      setCustomTopicLabel(raw);
    } catch {}
  }, []);

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [micEnabled, setMicEnabled] = useState(true);
  const [gender, setGender] = useState<Gender>("Male");
  const [language, setLanguage] = useState<Language>("English");
  const [model, setModel] = useState<Model>("OpenAI GPT 5");
  const [selectedMic, setSelectedMic] = useState(MICROPHONES[0]);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Computed once via useMemo with empty deps — this hits localStorage and
  // parses URL params, so we don't want to redo it on every render. Empty
  // deps guarantee a single computation and a stable identity across all
  // renders, so any code that closes over it (like the topic-init effect
  // below) sees the exact same object that initialised state.
  const initialMessagesAndId = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sid = params.get("session");
      if (sid) {
        const saved = getSessionHistory(sid);
        if (saved) {
          const rehydrated = ((saved.messages as Message[]) ?? []).map((m) => ({
            ...m,
            timestamp:
              m.timestamp instanceof Date
                ? m.timestamp
                : new Date(m.timestamp as unknown as string | number),
            audioUrl: undefined,
          }));
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
  const [messages, setMessages] = useState<Message[]>(
    initialMessagesAndId.messages,
  );
  const sessionIdRef = useRef<string | null>(initialMessagesAndId.sessionId);
  const [expandedMsgId, setExpandedMsgId] = useState<number | null>(null);
  const selectedMsg =
    expandedMsgId !== null
      ? (messages.find((m) => m.id === expandedMsgId) ?? null)
      : null;
  const latestUserMsg = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "user" && (m.scoreDetails || m.mistakes)) return m;
    }
    return null;
  })();
  const displayMsg = selectedMsg ?? latestUserMsg;
  const isAutoLatest = !selectedMsg && !!latestUserMsg;

  const sessionSummary = useMemo(() => {
    const userMsgs = messages.filter(
      (m) => m.role === "user" && m.scoreDetails,
    );
    if (userMsgs.length === 0) return null;
    const avg = (key: "overall" | "pronunciation" | "fluency" | "accuracy") =>
      Math.round(
        userMsgs.reduce((s, m) => s + (m.scoreDetails?.[key] ?? 0), 0) /
          userMsgs.length,
      );
    const scores = {
      overall: avg("overall"),
      pronunciation: avg("pronunciation"),
      fluency: avg("fluency"),
      accuracy: avg("accuracy"),
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
    const weakest = (["pronunciation", "fluency", "accuracy"] as const).reduce(
      (w, k) => (scores[k] < scores[w] ? k : w),
      "pronunciation" as "pronunciation" | "fluency" | "accuracy",
    );
    const tipMap: Record<typeof weakest, string> = {
      pronunciation:
        "Practice tricky sounds with shadowing — repeat after the agent right after each reply.",
      fluency:
        "Try speaking in longer 2-3 sentence chunks without pausing — record and replay yourself.",
      accuracy:
        "Slow down slightly and self-correct grammar before sending — focus on tense and articles.",
    };
    const tips: string[] = [tipMap[weakest]];
    if (topErrors[0]) {
      tips.push(
        `You made ${topErrors[0][1]} ${topErrors[0][0].toLowerCase()} mistake${topErrors[0][1] > 1 ? "s" : ""} — review them in your messages.`,
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
    status === "disconnected" &&
    messages.length > 0 &&
    sessionSummary !== null &&
    !summaryDismissed;
  const [chatInput, setChatInput] = useState("");
  const [agentTyping, setAgentTyping] = useState(false);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);

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
    Math.max(
      100,
      ...initialMessagesAndId.messages.map((m) =>
        typeof m.id === "number" ? m.id : 0,
      ),
    ) + 1,
  );
  const feedbackCounterRef = useRef(200);
  const autoFeedbackIndexRef = useRef(0);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const ttsActiveRef = useRef(false);
  const sessionStartRef = useRef<number | null>(null);
  const genderRef = useRef(gender);
  const languageRef = useRef(language);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const localAudioUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    genderRef.current = gender;
  }, [gender]);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  useEffect(() => {
    if (initialUser) setCurrentUser(initialUser);
  }, [initialUser]);

  const scrollToBottom = useCallback(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const clearLocalAudioUrls = useCallback(() => {
    localAudioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localAudioUrlsRef.current = [];
  }, []);

  const startUserAudioCapture = useCallback(async () => {
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      return;
    }

    if (mediaRecorderRef.current?.state === "recording") {
      return;
    }

    if (!mediaStreamRef.current) {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    }

    const preferredMimeType = "audio/webm;codecs=opus";
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

  const stopUserAudioCapture = useCallback(async (): Promise<
    Blob | undefined
  > => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      return undefined;
    }

    if (recorder.state === "inactive") {
      mediaRecorderRef.current = null;
      if (audioChunksRef.current.length === 0) {
        return undefined;
      }
      const blob = new Blob(audioChunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      audioChunksRef.current = [];
      return blob.size > 0 ? blob : undefined;
    }

    return await new Promise<Blob | undefined>((resolve) => {
      recorder.onstop = () => {
        mediaRecorderRef.current = null;
        const blob = audioChunksRef.current.length
          ? new Blob(audioChunksRef.current, {
              type: recorder.mimeType || "audio/webm",
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
      utt.pitch = currentGender === "Female" ? 1.15 : 0.9;

      const applyVoiceAndSpeak = () => {
        const voices = window.speechSynthesis.getVoices();
        const langPrefix = LANGUAGE_CODES[currentLanguage].split("-")[0];
        const filtered = voices.filter((v) => v.lang.startsWith(langPrefix));
        if (filtered.length > 0) {
          const femaleKeywords = /female|woman|zira|samantha|nữ/i;
          const maleKeywords = /male|man|david|mark|nam/i;
          const preferred =
            currentGender === "Female"
              ? (filtered.find((v) => femaleKeywords.test(v.name)) ??
                filtered.find((v) => !maleKeywords.test(v.name)) ??
                filtered[0])
              : (filtered.find((v) => maleKeywords.test(v.name)) ??
                filtered.find((v) => !femaleKeywords.test(v.name)) ??
                filtered[0]);
          utt.voice = preferred;
        }
        ttsActiveRef.current = true;
        setMicEnabled(false);
        utt.onend = () => {
          ttsActiveRef.current = false;
          setAgentSpeaking(false);
          setMicEnabled(true);
        };
        utt.onerror = () => {
          ttsActiveRef.current = false;
          setAgentSpeaking(false);
          setMicEnabled(true);
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
      const speakEnd = setTimeout(
        () => setAgentSpeaking(false),
        Math.min(text.length * 35, 4000),
      );
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
          setMicEnabled(true);
        };
        audio.onerror = () => {
          ttsActiveRef.current = false;
          setAgentSpeaking(false);
          setMicEnabled(true);
          speakText(text);
        };
        void audio.play().catch(() => {
          ttsActiveRef.current = false;
          setAgentSpeaking(false);
          setMicEnabled(true);
          speakText(text);
        });
      } catch {
        speakText(text);
      }

      return audioUrl;
    },
    [speakText],
  );

  const generateScore = useCallback((text: string) => {
    const words = text.trim().split(/\s+/).length;
    const base = Math.floor(Math.random() * 20) + 72;
    const bonus = Math.min(words * 0.6, 9);
    return Math.min(Math.round(base + bonus), 99);
  }, []);

  const generateScoreDetails = useCallback((overall: number) => {
    const jitter = () => Math.floor(Math.random() * 11) - 5;
    const clamp = (n: number) => Math.max(45, Math.min(99, n));
    return {
      overall,
      pronunciation: clamp(overall + jitter()),
      fluency: clamp(overall + jitter()),
      accuracy: clamp(overall + jitter()),
    };
  }, []);

  const generateMistakes = useCallback((text: string, overall: number) => {
    type MType = "Pronunciation" | "Grammar" | "Word choice" | "Fluency";
    const tokens = text
      .replace(/[.!?,;:"']/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 2);
    if (tokens.length === 0) return [];

    const target =
      overall >= 92 ? 0 : overall >= 85 ? 1 : overall >= 75 ? 2 : 3;
    const count = Math.min(target, tokens.length);
    if (count === 0) return [];

    const PRONUNCIATION_NOTES = [
      "Stress the second syllable more clearly.",
      "Soften the ending consonant for natural flow.",
      "Lengthen the vowel sound slightly.",
      "Don't drop the final 's' sound.",
    ];
    const GRAMMAR_PAIRS = [
      {
        wrong: "have went",
        correct: "have gone",
        note: "Past participle of 'go' is 'gone'.",
      },
      {
        wrong: "more better",
        correct: "better",
        note: "'Better' is already comparative.",
      },
      {
        wrong: "I am agree",
        correct: "I agree",
        note: "'Agree' is already a verb.",
      },
      {
        wrong: "people is",
        correct: "people are",
        note: "'People' takes a plural verb.",
      },
    ];
    const WORD_CHOICE_PAIRS = [
      {
        wrong: "very good",
        correct: "excellent",
        note: "Use a stronger adjective for variety.",
      },
      {
        wrong: "a lot of",
        correct: "numerous",
        note: "More formal alternative.",
      },
      {
        wrong: "thing",
        correct: "aspect",
        note: "Be more specific in academic contexts.",
      },
      {
        wrong: "big",
        correct: "significant",
        note: "Stronger word for emphasis.",
      },
    ];
    const FLUENCY_NOTES = [
      "Try to reduce filler words like 'um' and 'uh'.",
      "Pause briefly between clauses for rhythm.",
      "Connect ideas with linking words (however, moreover).",
    ];

    const types: MType[] = [
      "Pronunciation",
      "Grammar",
      "Word choice",
      "Fluency",
    ];
    const used = new Set<number>();
    const out: Array<{
      wrong: string;
      correct: string;
      type: MType;
      note?: string;
    }> = [];

    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      if (type === "Grammar") {
        const pair =
          GRAMMAR_PAIRS[Math.floor(Math.random() * GRAMMAR_PAIRS.length)];
        out.push({ ...pair, type });
      } else if (type === "Word choice") {
        const pair =
          WORD_CHOICE_PAIRS[
            Math.floor(Math.random() * WORD_CHOICE_PAIRS.length)
          ];
        out.push({ ...pair, type });
      } else if (type === "Pronunciation") {
        let idx = Math.floor(Math.random() * tokens.length);
        let guard = 0;
        while (used.has(idx) && guard++ < 6)
          idx = Math.floor(Math.random() * tokens.length);
        used.add(idx);
        const word = tokens[idx];
        out.push({
          wrong: word,
          correct: word,
          type,
          note: PRONUNCIATION_NOTES[
            Math.floor(Math.random() * PRONUNCIATION_NOTES.length)
          ],
        });
      } else {
        out.push({
          wrong: "—",
          correct: "—",
          type,
          note: FLUENCY_NOTES[Math.floor(Math.random() * FLUENCY_NOTES.length)],
        });
      }
    }
    return out;
  }, []);

  const sendChatMessage = useCallback(
    async (text: string, audioBlob?: Blob) => {
      const trimmed = text.trim();
      if (!trimmed || agentTyping) return;

      const session = getAuthSession();
      const userId = msgCounterRef.current++;
      const typingId = msgCounterRef.current++;
      const score = generateScore(trimmed);

      const userMsg: Message = {
        id: userId,
        role: "user",
        text: trimmed,
        timestamp: new Date(),
        score,
        scoreDetails: generateScoreDetails(score),
        mistakes: generateMistakes(trimmed, score),
        userAudioUrl: audioBlob ? URL.createObjectURL(audioBlob) : undefined,
      };

      if (userMsg.userAudioUrl) {
        localAudioUrlsRef.current.push(userMsg.userAudioUrl);
      }

      const historyPayload: { role: string; text: string }[] = [
        ...messages
          .filter((message) => !message.typing)
          .map((message) => ({
            role: message.role === "agent" ? "assistant" : "user",
            text: message.text,
          })),
        { role: "user", text: trimmed },
      ];

      setMessages((prev: Message[]) => [
        ...prev,
        userMsg,
        {
          id: typingId,
          role: "agent",
          text: "",
          timestamp: new Date(),
          typing: true,
        },
      ]);
      setChatInput("");
      inputRef.current?.focus();
      setAgentTyping(true);

      try {
        if (session?.token) {
          const data = await chatRespond({
            token: session.token,
            text: trimmed,
            audioBlob,
            history: historyPayload,
            topic: TOPICS.find((item) => item.id === topic)?.label ?? topic,
          });

          const pronunciationFeedback = audioBlob 
          ? await assessPronunciation({
              token: session.token,
              audioBlob: audioBlob!, 
              language: "en-US",
            })
          : null;

          const responseText =
            String(data.response_text || "").trim() ||
            "I am ready to help you practice.";

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

          const audioToPlay = audioUrl;
          const playedUrl = playAgentAudio(responseText, audioToPlay);

          setMessages((prev: Message[]) =>
            prev.map((message) =>
              message.id === userId
                ? {
                    ...message,
                    // Keep the local blob URL (created before the API call).
                    // MinIO presigned URLs use the internal Docker hostname and
                    // are unreachable from the browser.
                    userAudioUrl:
                      message.userAudioUrl || data.user_audio_url || undefined,
                  }
                : message.id === typingId
                  ? {
                      ...message,
                      text: responseText,
                      typing: false,
                      audioUrl: playedUrl,
                      minioUrl: data.assistant_audio_url || undefined,
                    }
                  : message,
            ),
          );
        } else {
          await new Promise<void>((res) => {
            timersRef.current.push(setTimeout(res, 700 + Math.random() * 600));
          });
          const reply =
            AGENT_REPLIES[Math.floor(Math.random() * AGENT_REPLIES.length)];
          playAgentAudio(reply);
          setMessages((prev: Message[]) =>
            prev.map((message) =>
              message.id === typingId
                ? { ...message, text: reply, typing: false }
                : message,
            ),
          );
        }

        const idx = autoFeedbackIndexRef.current % AUTO_FEEDBACKS.length;
        autoFeedbackIndexRef.current++;
        const fb = AUTO_FEEDBACKS[idx];
        const newFb: FeedbackItem = {
          ...fb,
          id: feedbackCounterRef.current++,
          timestamp: new Date(),
        };
        setFeedbacks((prev: FeedbackItem[]) => [newFb, ...prev]);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Chat request failed";
        setMessages((prev: Message[]) =>
          prev.map((message) =>
            message.id === typingId
              ? {
                  ...message,
                  text: `Agent error: ${errorMessage}`,
                  typing: false,
                }
              : message,
          ),
        );
        setAgentSpeaking(false);
        setMicEnabled(true);
      } finally {
        setAgentTyping(false);
      }
    },
    [
      agentTyping,
      messages,
      playAgentAudio,
      topic,
      generateScore,
      generateScoreDetails,
      generateMistakes,
    ],
  );

  // Auto-start/stop recognition when mic toggle or connection changes
  useEffect(() => {
    if (status !== "connected" || !micEnabled) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      setChatInput("");
      void stopUserAudioCapture();
      return;
    }

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      alert(
        "Trình duyệt không hỗ trợ nhận dạng giọng nói. Hãy dùng Chrome hoặc Edge trên máy tính.",
      );
      setMicEnabled(false);
      return;
    }

    let stopped = false;
    let consecutiveErrors = 0;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    // Pre-flight check: make sure we actually have mic permission in this
    // browsing context. Inside cross-origin iframes (e.g. previews embedded
    // in another site) the Speech API often fails silently without this.
    const ensureMicPermission = async (): Promise<boolean> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert(
          "Trình duyệt này không hỗ trợ truy cập micro (cần HTTPS và Chrome/Edge mới).",
        );
        return false;
      }
      // If we already hold a stream with at least one live track, reuse it
      // instead of re-prompting. Otherwise stop any dead/old tracks first
      // so the OS-level "mic in use" indicator goes away cleanly.
      const existing = mediaStreamRef.current;
      if (existing) {
        const hasLiveTrack = existing
          .getTracks()
          .some((t) => t.readyState === "live");
        if (hasLiveTrack) return true;
        existing.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      try {
        const probe = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        // Same liveness check on whatever we got: if a concurrent caller
        // already populated the ref while we awaited, prefer that and stop
        // our own probe to avoid leaving a second mic stream open.
        if (
          mediaStreamRef.current &&
          mediaStreamRef.current
            .getTracks()
            .some((t) => t.readyState === "live")
        ) {
          probe.getTracks().forEach((t) => t.stop());
        } else {
          mediaStreamRef.current = probe;
        }
        return true;
      } catch (err) {
        const name = (err as { name?: string })?.name || "";
        console.error("[VoiceAgent] getUserMedia failed:", err);
        if (name === "NotAllowedError" || name === "SecurityError") {
          alert(
            "Trình duyệt chặn micro. Nếu bạn đang xem app trong khung xem trước, hãy mở app ở tab mới rồi cho phép micro.",
          );
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          alert("Không tìm thấy thiết bị micro. Hãy cắm micro hoặc chọn thiết bị khác.");
        } else if (name === "NotReadableError") {
          alert("Micro đang bị app khác chiếm dụng. Đóng các app dùng micro khác rồi thử lại.");
        } else {
          alert("Không thể truy cập micro: " + (name || "lỗi không xác định"));
        }
        return false;
      }
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
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) final += transcript;
          else interim += transcript;
        }
        if (final && !hasSentFinal) {
          hasSentFinal = true;
          const recordedAudio = await stopUserAudioCapture();
          setChatInput("");
          sendChatMessage(final, recordedAudio);
        } else {
          setChatInput(interim);
        }
      };

      recognition.onerror = (event: Event) => {
        const err = (event as { error?: string }).error || "";
        // Always log so we can diagnose silent failures.
        console.warn("[VoiceAgent] SpeechRecognition error:", err);
        if (err === "not-allowed" || err === "service-not-allowed") {
          stopped = true;
          setMicEnabled(false);
          alert(
            "Trình duyệt chặn micro hoặc dịch vụ nhận dạng giọng nói. Nếu đang xem trong khung preview, hãy mở app ở tab mới và cho phép micro.",
          );
        } else if (err === "audio-capture") {
          stopped = true;
          setMicEnabled(false);
          alert("Không bắt được tín hiệu từ micro. Kiểm tra lại thiết bị thu âm.");
        } else if (err === "network") {
          // Speech API needs network for some engines; back off harder.
          consecutiveErrors += 3;
        } else if (err !== "no-speech" && err !== "aborted") {
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
          console.error(
            "[VoiceAgent] giving up after repeated SpeechRecognition errors",
          );
          alert(
            "Nhận dạng giọng nói liên tục lỗi. Hãy thử mở app ở tab mới (Chrome/Edge) và cấp quyền micro.",
          );
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
        console.warn("[VoiceAgent] recognition.start() threw:", err);
      }
    }

    void ensureMicPermission().then((ok) => {
      if (ok && !stopped) startListening();
    });

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsRecording(false);
      setChatInput("");
      void stopUserAudioCapture();
    };
  }, [
    status,
    micEnabled,
    language,
    sendChatMessage,
    startUserAudioCapture,
    stopUserAudioCapture,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (chatInput.trim() && status === "connected" && !agentTyping) {
          sendChatMessage(chatInput);
        }
      }
    },
    [chatInput, status, agentTyping, sendChatMessage],
  );

  // Mirror the values persistSession needs into refs that update synchronously
  // during render. This way persistSession itself can be stable (no deps) and
  // window event handlers / cleanup callbacks always see the latest committed
  // values — no closure can ever go stale, even on rapid disconnects.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const sessionSummaryRef = useRef(sessionSummary);
  sessionSummaryRef.current = sessionSummary;
  const topicRef = useRef(topic);
  topicRef.current = topic;
  const customTopicLabelRef = useRef(customTopicLabel);
  customTopicLabelRef.current = customTopicLabel;
  // Same pattern for `status` so handleConnect can read the latest committed
  // status from a ref instead of a closure — eliminates the rapid-click race
  // where two clicks dispatched in the same tick both see the previous value.
  const statusRef = useRef(status);
  statusRef.current = status;

  const persistSession = useCallback(() => {
    const currentMessages = messagesRef.current;
    if (!currentMessages.length) return;
    const currentSummary = sessionSummaryRef.current;
    const currentTopic = topicRef.current;
    const currentCustomTopicLabel = customTopicLabelRef.current;
    const topicLabel =
      currentCustomTopicLabel ??
      TOPICS.find((t) => t.id === currentTopic)?.label ??
      "Daily Conversation";
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
    // Cancel any in-flight connect timers from a previous startNewSession /
    // handleConnect call so they can't fire after we've moved on.
    clearTimers();
    const myVersion = ++sessionVersionRef.current;
    setMessages([]);
    setExpandedMsgId(null);
    setSummaryDismissed(false);
    clearLocalAudioUrls();
    setFeedbacks([]);
    autoFeedbackIndexRef.current = 0;
    sessionStartRef.current = Date.now();
    sessionIdRef.current = null;
    // Eagerly update the ref BEFORE calling setStatus so that handleConnect
    // called synchronously in the same event-loop tick (before React re-renders
    // and updates statusRef.current via `statusRef.current = status`) already
    // sees "connecting" and correctly skips both its if-branches instead of
    // re-entering the "connected" branch and cancelling this new session.
    statusRef.current = "connecting";
    setStatus("connecting");

    const t0 = setTimeout(() => {
      // Bail out if a newer session/connect has superseded this one.
      if (sessionVersionRef.current !== myVersion) return;
      statusRef.current = "connected";
      setStatus("connected");
      setAgentTyping(false);
      setAgentSpeaking(false);
    }, 600);

    timersRef.current.push(t0);
  }, [clearTimers, clearLocalAudioUrls]);

  const handleConnect = useCallback(() => {
    // Read status from a ref so rapid clicks within a single event-loop
    // tick (before React commits the next render) always see the very
    // latest committed status — never a stale closure value.
    const currentStatus = statusRef.current;
    if (currentStatus === "connected") {
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
      // Eagerly mirror the state change into statusRef so that any handleConnect
      // call dispatched in the same tick (before the next React render) sees the
      // new value and doesn't enter a stale branch.
      statusRef.current = "disconnected";
      setStatus("disconnected");
      setAgentSpeaking(false);
      setAgentTyping(false);
      setExpandedMsgId(null);
      autoFeedbackIndexRef.current = 0;
      clearTimers();
      persistSession();
      return;
    }
    if (currentStatus === "disconnected") {
      setSummaryDismissed(true);
      autoFeedbackIndexRef.current = 0;
      clearTimers();
      const myVersion = ++sessionVersionRef.current;
      if (sessionStartRef.current === null) {
        sessionStartRef.current = Date.now();
      }
      // Eagerly mirror into statusRef so that startNewSession or another
      // handleConnect call dispatched in the same tick can see the pending
      // status before React re-renders.
      statusRef.current = "connecting";
      setStatus("connecting");

      const t0 = setTimeout(() => {
        if (sessionVersionRef.current !== myVersion) return;
        statusRef.current = "connected";
        setStatus("connected");
        setAgentTyping(false);
        setAgentSpeaking(false);
      }, 600);

      timersRef.current.push(t0);
    }
  }, [
    clearTimers,
    persistSession,
    sessionSummary,
    customTopicLabel,
    topic,
  ]);

  const persistSessionRef = useRef(persistSession);
  // Update synchronously during render so the ref always points at the
  // latest closure (no race between a state change and an effect firing
  // before a rapid unmount or visibility change).
  persistSessionRef.current = persistSession;

  useEffect(() => {
    const onHide = () => {
      try {
        persistSessionRef.current?.();
      } catch {}
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        persistSessionRef.current?.();
      } catch {}
      clearTimers();
      clearLocalAudioUrls();
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    };
  }, [clearTimers, clearLocalAudioUrls]);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  return (
    <div
      data-va="root"
      className={`h-screen overflow-hidden bg-[#f5f7fa] text-gray-800 flex flex-col${isDark ? " va-dark" : ""}`}
    >
      {/* Top bar */}
      <header
        data-va="header"
        className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-[#f5f7fa]"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded-sm flex items-center justify-center">
            <span className="text-[10px] font-black text-white leading-none">
              VIN
            </span>
          </div>
          <span className="text-sm font-semibold text-gray-800">
            IELTS Speaking Coach
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDark((v) => !v)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-lg px-2.5 py-1 transition-colors"
                title={currentUser.display_name || currentUser.email || "User"}
              >
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
                  {currentUser.display_name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <span className="text-xs text-gray-700">
                  {currentUser.display_name || currentUser.email || "User"}
                </span>
                <svg
                  className={`w-3 h-3 text-gray-500 transition-transform ${showUserMenu ? "rotate-180" : ""}`}
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
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-gray-200 shadow-lg z-40 overflow-hidden animate-fadeIn">
                    <div className="px-3 py-2.5 border-b border-gray-100">
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {currentUser.display_name || "User"}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {currentUser.email}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        const hadMessages = messages.length > 0;
                        if (hadMessages) {
                          persistSession();
                        }
                        navigate("/dashboard", {
                          state: hadMessages
                            ? { highlightSessionId: sessionIdRef.current }
                            : undefined,
                        });
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                    >
                      <span>📊</span> Dashboard
                    </button>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        setShowLogoutConfirm(true);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors border-t border-gray-100"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
              >
                <LogIn className="w-3 h-3" /> Đăng nhập
              </button>
              <button
                onClick={() => navigate("/register")}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-gray-900 rounded-lg transition-colors"
              >
                <UserPlus className="w-3 h-3" /> Đăng ký
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
          <span className="font-medium text-gray-700">Description</span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-700">
            {customTopicLabel ??
              TOPICS.find((t) => t.id === topic)?.label ??
              "Daily Conversation"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="button-settings"
            onClick={() => setShowSettings((v) => !v)}
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
                ? "bg-red-600/80 hover:bg-red-600 text-gray-900 border border-red-500/50"
                : isConnecting
                  ? "bg-blue-600/50 text-blue-300 border border-blue-300 cursor-not-allowed"
                  : "bg-white text-gray-900 hover:bg-gray-100 border border-gray-300"
            }`}
          >
            {isConnected
              ? "Disconnect"
              : isConnecting
                ? "Connecting..."
                : "Connect"}
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
              Audio Settings
            </span>
            <SelectDropdown
              value={gender}
              options={GENDERS}
              onChange={setGender}
            />
          </div>

          {/* Agent row */}
          <div className="px-2 mt-2 space-y-2">
            <div className="bg-linear-to-r from-blue-50 to-indigo-50 rounded-md border border-gray-200 flex items-center gap-2.5 px-2 py-2">
              <div
                className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-all duration-500 ${
                  agentSpeaking
                    ? "bg-blue-600/30 border-2 border-blue-500/60 shadow-lg shadow-blue-200"
                    : "bg-blue-100 border border-blue-200"
                }`}
              >
                <SiOpenai className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-gray-700 mb-1">
                  Agent
                </div>
                {isConnected || isConnecting ? (
                  <AgentWaveform active={agentSpeaking} />
                ) : (
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 14 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-blue-500/30"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Microphone selector */}
            <div className="px-2 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-gray-700 tracking-widest uppercase">
                  Microphone
                </span>
                <div className="flex items-center gap-2">
                  <button
                    data-testid="button-mic-toggle"
                    onClick={() => setMicEnabled((v) => !v)}
                    className={`p-1 rounded transition-colors ${
                      isRecording
                        ? "text-red-400 hover:text-red-300 animate-pulse"
                        : micEnabled
                          ? "text-blue-600 hover:text-blue-300"
                          : "text-gray-400 hover:text-gray-500"
                    }`}
                  >
                    {micEnabled ? (
                      <Mic className="w-4 h-4" />
                    ) : (
                      <MicOff className="w-4 h-4" />
                    )}
                  </button>
                  <DeviceSelect
                    value={selectedMic}
                    options={MICROPHONES}
                    onChange={setSelectedMic}
                  />
                </div>
              </div>
            </div>

            {/* User row */}
            <div className="bg-linear-to-r from-violet-50 to-purple-50 rounded-md border border-gray-200 flex items-center gap-2.5 px-2 py-2">
              <div
                className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-all duration-500 ${
                  isRecording
                    ? "bg-violet-600/30 border-2 border-violet-500/60 shadow-lg shadow-violet-200"
                    : "bg-violet-100 border border-violet-200"
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
                  {currentUser?.display_name || "You"}
                </div>
                {isConnected || isConnecting ? (
                  <MicWaveform active={micEnabled && isConnected} />
                ) : (
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 14 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-violet-500/30"
                      />
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
                AI Feedback
              </span>
              {selectedMsg ? (
                <button
                  type="button"
                  onClick={() => setExpandedMsgId(null)}
                  className="text-[9px] text-gray-500 hover:text-gray-800 underline"
                >
                  Show latest
                </button>
              ) : isAutoLatest ? (
                <span className="text-[9px] bg-violet-100 text-violet-700 border border-violet-200 rounded-full px-1.5 py-0.5">
                  Latest
                </span>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin pr-0.5">
              {displayMsg ? (
                <>
                  <div className="rounded-md border border-violet-200 bg-violet-50 p-2 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-violet-700">
                        {selectedMsg ? "Selected sentence" : "Latest sentence"}
                      </span>
                      {displayMsg.userAudioUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              const audio = new Audio(displayMsg.userAudioUrl);
                              void audio.play();
                            } catch {
                              // ignore playback errors
                            }
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold text-violet-700 bg-white border border-violet-200 hover:bg-violet-100 transition-colors"
                        >
                          <Volume2 className="w-2.5 h-2.5" />
                          Replay
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-800 italic leading-snug">
                      "{displayMsg.text}"
                    </p>
                  </div>

                  {displayMsg.scoreDetails && (
                    <div className="rounded-md border border-gray-200 bg-white p-2 animate-fadeIn">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-600 block mb-1.5">
                        Score breakdown
                      </span>
                      <div className="flex flex-col gap-1">
                        {(
                          [
                            ["Overall", displayMsg.scoreDetails.overall],
                            [
                              "Pronunciation",
                              displayMsg.scoreDetails.pronunciation,
                            ],
                            ["Fluency", displayMsg.scoreDetails.fluency],
                            ["Accuracy", displayMsg.scoreDetails.accuracy],
                          ] as const
                        ).map(([label, val]) => {
                          const color =
                            val >= 85
                              ? "bg-green-500"
                              : val >= 70
                                ? "bg-yellow-500"
                                : "bg-orange-500";
                          return (
                            <div
                              key={label}
                              className="flex items-center gap-1.5"
                            >
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
                      ? `Errors (${displayMsg.mistakes.length})`
                      : "Errors"}
                  </span>

                  {!displayMsg.mistakes || displayMsg.mistakes.length === 0 ? (
                    <div className="rounded-md border border-green-200 bg-green-50 p-2 flex items-start gap-1.5 animate-fadeIn">
                      <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-green-700 leading-snug">
                        Great job! No issues detected in this sentence.
                      </p>
                    </div>
                  ) : (
                    displayMsg.mistakes.map((m, i) => {
                      const map: Record<typeof m.type, FeedbackType> = {
                        Pronunciation: "pronunciation",
                        Grammar: "grammar",
                        "Word choice": "vocabulary",
                        Fluency: "fluency",
                      };
                      const meta = FEEDBACK_ICON[map[m.type]];
                      const Icon = meta.icon;
                      return (
                        <div
                          key={i}
                          className={`rounded-md border p-2 ${meta.bg} animate-fadeIn`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon
                              className={`w-3 h-3 shrink-0 ${meta.color}`}
                            />
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider ${meta.color}`}
                            >
                              {m.type}
                            </span>
                          </div>
                          {m.wrong !== "—" && (
                            <p className="text-[10px] text-red-500 opacity-80 line-through mb-0.5 leading-snug">
                              {m.wrong}
                            </p>
                          )}
                          {m.correct !== "—" && (
                            <p className="text-[10px] text-green-600 font-medium mb-1 leading-snug">
                              {m.correct}
                            </p>
                          )}
                          {m.note && (
                            <p className="text-[9px] text-gray-700 leading-relaxed">
                              {m.note}
                            </p>
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
                      ? "Send a message to see feedback for your latest sentence here."
                      : "Connect to see real-time English corrections"}
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
              <span className="text-xs font-semibold text-gray-700">
                Conversation
              </span>
              {isConnected && (
                <div className="flex items-center gap-1.5">
                  <Circle
                    className={`w-1.5 h-1.5 fill-current ${agentSpeaking ? "text-blue-600" : "text-green-400"}`}
                  />
                  <span className="text-[10px] text-gray-600">
                    {agentSpeaking ? "Agent speaking" : "Listening"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <SiOpenai className="w-4 h-4 text-gray-500" />
                <SelectDropdown
                  value={model}
                  options={MODELS}
                  onChange={setModel}
                />
              </div>
              <SelectDropdown
                value={language}
                options={LANGUAGES}
                onChange={setLanguage}
              />
            </div>
          </div>

          {/* Messages area */}
          <div
            data-va="messages"
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin"
          >
            {status === "disconnected" && messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center">
                  <SiOpenai className="w-8 h-8 text-blue-400/50" />
                </div>
                <div className="space-y-1">
                  <p className="text-gray-600 text-sm">
                    Click{" "}
                    <span className="font-semibold text-gray-900">Connect</span>{" "}
                    to start a session
                  </p>
                  <p className="text-gray-400 text-xs">
                    Conversation transcript will appear here
                  </p>
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
                    aria-label="Close"
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
                          Session summary
                        </h3>
                        <p className="text-[11px] text-gray-500">
                          {sessionSummary.sentenceCount} sentence
                          {sessionSummary.sentenceCount > 1 ? "s" : ""} • {sessionSummary.totalErrors} total error{sessionSummary.totalErrors === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          persistSession();
                          navigate("/dashboard", {
                            state: { highlightSessionId: sessionIdRef.current },
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-violet-700 bg-white border border-violet-300 hover:bg-violet-50 transition-colors"
                      >
                        <span>📊</span>
                        View on Dashboard
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
                        New session
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {(
                      [
                        ["Overall", sessionSummary.scores.overall],
                        ["Pronunc.", sessionSummary.scores.pronunciation],
                        ["Fluency", sessionSummary.scores.fluency],
                        ["Accuracy", sessionSummary.scores.accuracy],
                      ] as const
                    ).map(([label, val]) => {
                      const color =
                        val >= 85
                          ? "text-green-600"
                          : val >= 70
                            ? "text-yellow-600"
                            : "text-orange-600";
                      return (
                        <div
                          key={label}
                          className="va-stat-card rounded-md bg-white border border-gray-200 px-2 py-1.5 text-center"
                        >
                          <div
                            className={`va-stat-value text-lg font-bold tabular-nums ${color}`}
                          >
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
                        Top error types
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {sessionSummary.topErrors.map(([type, count]) => (
                          <span
                            key={type}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-200"
                          >
                            {type}
                            <span className="text-red-500/80">×{count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-violet-600" />
                      Practice tips
                    </div>
                    <ul className="space-y-1">
                      {sessionSummary.tips.map((t, i) => (
                        <li
                          key={i}
                          className="text-[11px] text-gray-700 leading-snug pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-violet-500"
                        >
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {status === "connecting" && (
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
                <p className="text-blue-600/70 text-xs">
                  Establishing connection...
                </p>
              </div>
            )}

            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const canReplay =
                msg.role === "agent" || Boolean(msg.userAudioUrl);
              const expandable = isUser && !msg.typing;
              const replay = canReplay
                ? () => {
                    if (msg.role === "agent") {
                      const audioUrl = msg.minioUrl || msg.audioUrl;
                      if (audioUrl) {
                        playAgentAudio(msg.text, audioUrl);
                      } else {
                        speakText(msg.text);
                      }
                      return;
                    }
                    if (!msg.userAudioUrl) return;
                    try {
                      const audio = new Audio(msg.userAudioUrl);
                      void audio.play();
                    } catch {
                      // Ignore playback failures for user recording replays.
                    }
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
                      ? () =>
                          setExpandedMsgId((prev) =>
                            prev === msg.id ? null : msg.id,
                          )
                      : undefined
                  }
                />
              );
            })}

            <div ref={chatBottomRef} />
          </div>

          {/* Chat input bar */}
          <div
            data-va="input"
            className="border-t border-gray-200 px-3 py-3 bg-[#f5f7fa]"
          >
            {!isConnected ? (
              <div className="flex items-center justify-center py-2 text-xs text-gray-400">
                Connect to start chatting
              </div>
            ) : (
              <div className="flex items-end gap-2">
                {/* Text input */}
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    data-testid="input-chat"
                    value={chatInput}
                    onChange={(e) => {
                      setChatInput(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height =
                        Math.min(e.target.scrollHeight, 120) + "px";
                    }}
                    onKeyDown={handleKeyDown}
                    disabled={agentTyping}
                    placeholder={
                      isRecording
                        ? "Đang nghe giọng nói..."
                        : agentTyping
                          ? "Agent is typing..."
                          : "Type a message... (Enter to send)"
                    }
                    rows={1}
                    data-va="textarea"
                    className={`w-full resize-none rounded-xl border px-3 py-2 text-sm bg-[#f1f5f9] text-gray-800 placeholder-gray-400 outline-none transition-all leading-relaxed
                      ${
                        agentTyping
                          ? "border-gray-200 opacity-60 cursor-not-allowed"
                          : "border-gray-200 focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
                      }`}
                    style={{ minHeight: "38px", maxHeight: "120px" }}
                  />
                </div>

                {/* Send button */}
                <button
                  data-testid="button-send-chat"
                  onClick={() => {
                    if (chatInput.trim() && !agentTyping)
                      sendChatMessage(chatInput);
                  }}
                  disabled={!chatInput.trim() || agentTyping}
                  className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    chatInput.trim() && !agentTyping
                      ? "bg-blue-600 hover:bg-blue-500 text-gray-900 shadow-md shadow-blue-200"
                      : "bg-gray-100 text-gray-500 cursor-not-allowed"
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
                        Agent speaking
                      </span>
                    </div>
                  )}
                  {agentTyping && !agentSpeaking && (
                    <span className="text-[10px] text-gray-500 italic">
                      Agent is typing...
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-gray-600">
                  {messages.filter((m) => !m.typing).length} messages • Enter to
                  send, Shift+Enter for newline
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
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-gray-800 mb-1 text-sm">
              Chủ đề luyện tập
            </h3>
            <p className="text-[10px] text-gray-500 mb-3">
              Chọn chủ đề để AI tập trung hướng dẫn đúng hướng
            </p>
            <div className="space-y-1">
              {TOPICS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTopic(t.id);
                    setCustomTopicLabel(null);
                    setShowSettings(false);
                    try {
                      const url = new URL(window.location.href);
                      url.searchParams.set("topic", t.label);
                      window.history.replaceState({}, "", url.toString());
                    } catch {}
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                    topic === t.id
                      ? "bg-blue-100 border border-blue-300 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100 border border-transparent"
                  }`}
                >
                  <div>
                    <div className="text-xs font-medium text-gray-800">
                      {t.label}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {t.desc}
                    </div>
                  </div>
                  {topic === t.id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  )}
                </button>
              ))}
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
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-xl shrink-0">
                👋
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Đăng xuất?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Bạn có chắc muốn đăng xuất khỏi tài khoản không?
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  clearAuthSession();
                  setCurrentUser(null);
                  if (onLogout) onLogout();
                  navigate("/", { replace: true });
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}