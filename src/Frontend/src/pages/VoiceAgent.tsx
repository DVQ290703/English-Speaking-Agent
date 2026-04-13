import { useState, useEffect, useRef, useCallback, KeyboardEvent } from "react";
import { Mic, MicOff, Settings, Github, ChevronDown, Circle, Bot, User, 
  SendHorizontal, AlertCircle, BookOpen, Volume2, Zap, CheckCircle2, 
  LogIn, UserPlus, X, Eye, EyeOff, LogOut } from "lucide-react";
import { SiOpenai } from "react-icons/si";

type ConnectionStatus = "disconnected" | "connecting" | "connected";
type Gender = "Male" | "Female";
type Language = "English" | "Vietnamese";
type Model = "OpenAI GPT 5" | "OpenAI GPT 4o" | "Claude 3.5 Sonnet" | "Gemini 1.5 Pro";

interface Message {
  id: number;
  role: "agent" | "user";
  text: string;
  timestamp: Date;
  typing?: boolean;
}

type FeedbackType = "grammar" | "vocabulary" | "pronunciation" | "fluency";

interface FeedbackItem {
  id: number;
  type: FeedbackType;
  original: string;
  corrected: string;
  explanation: string;
  timestamp: Date;
}

const FEEDBACK_ICON: Record<FeedbackType, { icon: typeof AlertCircle; color: string; bg: string; label: string }> = {
  grammar:       { icon: AlertCircle,    color: "text-red-400",    bg: "bg-red-500/10 border-red-500/25",    label: "Grammar"       },
  vocabulary:    { icon: BookOpen,       color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/25", label: "Vocabulary"  },
  pronunciation: { icon: Volume2,        color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/25", label: "Pronunciation" },
  fluency:       { icon: Zap,            color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/25",  label: "Fluency"       },
};

const DEMO_FEEDBACKS: Omit<FeedbackItem, "id" | "timestamp">[] = [
  {
    type: "grammar",
    original: "I am go to school yesterday.",
    corrected: "I went to school yesterday.",
    explanation: "Use simple past tense \"went\" for completed actions in the past, not \"am go\".",
  },
  {
    type: "vocabulary",
    original: "The movie was very good.",
    corrected: "The movie was captivating / outstanding.",
    explanation: "\"Good\" is very generic. Use more descriptive words like \"captivating\", \"outstanding\", or \"compelling\" for richer expression.",
  },
  {
    type: "pronunciation",
    original: "\"Comfortable\" /kəmˈfɔːrtəbl/",
    corrected: "\"Comfortable\" /ˈkʌmftəbl/",
    explanation: "This word is commonly mispronounced. It has 3 syllables: COMF-ter-ble, not com-FOR-ta-ble.",
  },
];

const AUTO_FEEDBACKS: Omit<FeedbackItem, "id" | "timestamp">[] = [
  {
    type: "grammar",
    original: "He don't like coffee.",
    corrected: "He doesn't like coffee.",
    explanation: "Third-person singular (he/she/it) uses \"doesn't\" not \"don't\" in negative sentences.",
  },
  {
    type: "vocabulary",
    original: "I want to make my English better.",
    corrected: "I want to improve / enhance my English.",
    explanation: "\"Make better\" is informal. Prefer \"improve\" or \"enhance\" for more natural, sophisticated English.",
  },
  {
    type: "fluency",
    original: "I... uh... I think that... um... it is good.",
    corrected: "I think it is good.",
    explanation: "Try to reduce filler words (uh, um). Pausing briefly is better than filling silence with sounds.",
  },
  {
    type: "grammar",
    original: "She is more taller than her sister.",
    corrected: "She is taller than her sister.",
    explanation: "Do not use \"more\" with one-syllable adjectives. \"Taller\" is already comparative — \"more taller\" is a double comparative.",
  },
  {
    type: "pronunciation",
    original: "\"Wednesday\" /wɛdnɛsdei/",
    corrected: "\"Wednesday\" /ˈwɛnzdeɪ/",
    explanation: "The 'd' in Wednesday is silent. Pronounced as WEN-z-day, not Wed-nes-day.",
  },
  {
    type: "vocabulary",
    original: "The problem is very big.",
    corrected: "The problem is significant / substantial.",
    explanation: "Instead of \"very + adjective\", use stronger single words: \"significant\", \"substantial\", or \"considerable\".",
  },
];

const LANGUAGES: Language[] = ["English", "Vietnamese"];
const MODELS: Model[] = ["OpenAI GPT 5", "OpenAI GPT 4o", "Claude 3.5 Sonnet", "Gemini 1.5 Pro"];
const GENDERS: Gender[] = ["Male", "Female"];

const TOPICS = [
  { id: "daily",       label: "Daily Conversation",     desc: "Giao tiếp hàng ngày" },
  { id: "ielts1",      label: "IELTS Speaking Part 1",  desc: "Giới thiệu bản thân, cuộc sống" },
  { id: "ielts2",      label: "IELTS Speaking Part 2",  desc: "Nói dài về một chủ đề" },
  { id: "ielts3",      label: "IELTS Speaking Part 3",  desc: "Thảo luận ý kiến, phân tích" },
  { id: "travel",      label: "Travel & Tourism",        desc: "Du lịch, khám phá" },
  { id: "career",      label: "Work & Career",           desc: "Công việc, sự nghiệp" },
  { id: "education",   label: "Education",               desc: "Giáo dục, học tập" },
  { id: "environment", label: "Environment",             desc: "Môi trường, thiên nhiên" },
  { id: "technology",  label: "Technology",              desc: "Công nghệ, đổi mới" },
  { id: "health",      label: "Health & Lifestyle",      desc: "Sức khỏe, lối sống" },
];
type TopicId = typeof TOPICS[number]["id"];

const TOPIC_GREETINGS: Record<string, string> = {
  daily:       "Hi there! I'm your IELTS Speaking Coach. Today we'll practice everyday conversation. Feel free to talk about anything — your day, hobbies, or whatever's on your mind. Shall we get started?",
  ielts1:      "Hello! I'm your IELTS Speaking Coach. We're going to work on Part 1 today — personal questions about yourself, your life, and your interests. It's the warm-up round, so relax and speak naturally. Ready to begin?",
  ielts2:      "Welcome! I'm your IELTS Speaking Coach. In Part 2 you'll be given a cue card and asked to speak for 1–2 minutes on a topic. I'll give you a topic in a moment. Take a breath and get ready!",
  ielts3:      "Hello! Ready for Part 3? This is the discussion round — I'll ask abstract, opinion-based questions related to a broader theme. Try to give extended, well-reasoned answers. Let's dive in!",
  travel:      "Hi! I'm your IELTS Speaking Coach. Today's theme is Travel & Tourism. We'll talk about your travel experiences, dream destinations, and more. Where have you been lately?",
  career:      "Hey! I'm your IELTS Speaking Coach. Today we'll chat about Work & Career — your current job, ambitions, workplace challenges, and future goals. Tell me a bit about what you do!",
  education:   "Hello! I'm your IELTS Speaking Coach. Our topic today is Education — school experiences, learning styles, the value of higher education, and so on. What was your favourite subject growing up?",
  environment: "Hi there! I'm your IELTS Speaking Coach. Today we're talking about the Environment — climate change, conservation, sustainable living, and our responsibilities. What environmental issue concerns you most?",
  technology:  "Hello! I'm your IELTS Speaking Coach. Today's focus is Technology — how it shapes our lives, its benefits and drawbacks, and where it's heading. Are you a tech enthusiast?",
  health:      "Hi! I'm your IELTS Speaking Coach. Today's theme is Health & Lifestyle — diet, exercise, mental well-being, and healthy habits. How do you try to keep healthy in your daily life?",
};

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
  "Great point! I agree with your thinking here. To add to that, there are a few additional considerations that might be helpful.",
  "I appreciate you asking about this! It's an area I find quite interesting. The short answer is yes, and here's why that matters in practice.",
  "Absolutely! That's something I can explain clearly. The main idea is straightforward, though the details do get nuanced depending on your specific use case.",
  "Of course! Let me break that down for you step by step so it's easy to follow and understand.",
];

const DEMO_CONVERSATION: { role: "agent" | "user"; text: string; delay: number }[] = [
  { role: "agent", text: "Hello! I'm your AI voice assistant powered by TEN. How can I help you today?", delay: 1200 },
  { role: "user", text: "Hi! Can you tell me about yourself?", delay: 4500 },
  { role: "agent", text: "Of course! I'm a multi-purpose voice assistant built on TEN framework. I can help you with questions, conversations, analysis, creative writing, and much more. I support multiple languages and can adapt my voice to be either male or female. What would you like to explore?", delay: 7000 },
  { role: "user", text: "That's impressive. What languages do you support?", delay: 12000 },
  { role: "agent", text: "I currently support English, Vietnamese, Chinese, Japanese, Korean, Spanish, and French. You can switch the language anytime from the dropdown in the top right corner. Would you like me to respond in a different language?", delay: 15500 },
  { role: "user", text: "English is fine. Can you help me write a short poem?", delay: 21000 },
  { role: "agent", text: "I'd love to! Here's a short poem for you:\n\nIn circuits deep and data streams,\nA voice emerges, soft it seems,\nThrough waveforms light and language bright,\nI speak with you from day to night.\nAsk me anything, near or far,\nYour AI friend — that's what we are.", delay: 24000 },
];

function AgentWaveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-center justify-center gap-[2px] h-8">
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full bg-blue-400"
          style={{
            height: active ? `${4 + Math.sin(i * 0.5) * 12}px` : "3px",
            animation: active
              ? `agentWave ${0.7 + Math.random() * 0.6}s ease-in-out ${i * 35}ms infinite`
              : "none",
            opacity: active ? 0.8 : 0.25,
            transition: "height 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

function MicWaveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-center justify-center gap-[2px] h-16 w-full">
      {Array.from({ length: 28 }).map((_, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-blue-400"
          style={{
            height: active ? `${12 + Math.sin(i * 0.5) * 16 + Math.random() * 10}px` : "4px",
            animation: active
              ? `agentWave ${0.6 + Math.random() * 0.8}s ease-in-out ${i * 40}ms infinite`
              : "none",
            opacity: active ? 0.85 : 0.3,
            transition: "height 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

function SelectDropdown<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        data-testid={`select-${value}`}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-300 hover:bg-white/5 transition-colors border border-white/10"
      >
        <span>{value}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-50 bg-[#1a1f2e] border border-white/15 rounded-md shadow-xl min-w-[160px] overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt}
              data-testid={`option-${opt}`}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                opt === value
                  ? "bg-blue-600/30 text-blue-300"
                  : "text-gray-300 hover:bg-white/8"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const shortVal = value.length > 24 ? value.slice(0, 24) + "…" : value;

  return (
    <div ref={ref} className="relative">
      <button
        data-testid="device-select"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors max-w-[160px]"
      >
        <span className="truncate">{shortVal}</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-[#1a1f2e] border border-white/15 rounded-md shadow-xl min-w-[220px] overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt}
              data-testid={`device-option-${opt}`}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                opt === value
                  ? "bg-blue-600/30 text-blue-300"
                  : "text-gray-300 hover:bg-white/8"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 150, 300].map((delay) => (
        <div
          key={delay}
          className="w-1.5 h-1.5 rounded-full bg-blue-400"
          style={{ animation: `dotPulse 1.2s ease-in-out ${delay}ms infinite` }}
        />
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isAgent = message.role === "agent";
  const timeStr = message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      data-testid={`message-${message.id}`}
      className={`flex gap-2.5 ${isAgent ? "flex-row" : "flex-row-reverse"} items-end`}
      style={{ animation: "fadeSlideIn 0.3s ease-out" }}
    >
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mb-0.5 ${
        isAgent
          ? "bg-blue-600/25 border border-blue-500/40"
          : "bg-purple-600/25 border border-purple-500/40"
      }`}>
        {isAgent
          ? <Bot className="w-3.5 h-3.5 text-blue-400" />
          : <User className="w-3.5 h-3.5 text-purple-400" />
        }
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] flex flex-col gap-1 ${isAgent ? "items-start" : "items-end"}`}>
        <div className={`flex items-center gap-1.5 ${isAgent ? "" : "flex-row-reverse"}`}>
          <span className="text-[10px] font-medium text-gray-500">
            {isAgent ? "Agent" : "You"}
          </span>
          <span className="text-[10px] text-gray-700">{timeStr}</span>
        </div>
        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isAgent
            ? "bg-[#161d2e] border border-blue-900/40 text-gray-200 rounded-tl-sm"
            : "bg-[#1e1630] border border-purple-900/40 text-gray-200 rounded-tr-sm"
        }`}>
          {message.typing ? <TypingIndicator /> : message.text}
        </div>
      </div>
    </div>
  );
}

interface AuthUser { name: string; email: string; }

function AuthModal({
  mode,
  onClose,
  onSuccess,
}: {
  mode: "login" | "register";
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
}) {
  const [tab, setTab] = useState<"login" | "register">(mode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = () => {
    setError("");
    if (tab === "register" && !name.trim()) { setError("Vui lòng nhập tên của bạn."); return; }
    if (!email.includes("@")) { setError("Email không hợp lệ."); return; }
    if (password.length < 6) { setError("Mật khẩu phải có ít nhất 6 ký tự."); return; }
    onSuccess({ name: name.trim() || email.split("@")[0], email });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#13171f] border border-white/10 rounded-xl w-full max-w-sm mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/8">
          <div className="flex gap-1 bg-white/5 rounded-lg p-1">
            <button
              onClick={() => { setTab("login"); setError(""); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === "login" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"}`}
            >
              <LogIn className="w-3 h-3" /> Đăng nhập
            </button>
            <button
              onClick={() => { setTab("register"); setError(""); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === "register" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"}`}
            >
              <UserPlus className="w-3 h-3" /> Đăng ký
            </button>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/8 text-gray-500 hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-3">
          {tab === "register" && (
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Tên hiển thị</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
            </div>
          )}
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Mật khẩu</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-9 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
              <button
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
              >
                {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            onClick={handleSubmit}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded-lg transition-colors mt-1"
          >
            {tab === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VoiceAgent() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authModal, setAuthModal] = useState<"login" | "register" | null>(null);
  const [topic, setTopic] = useState<TopicId>("daily");

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [micEnabled, setMicEnabled] = useState(true);
  const [gender, setGender] = useState<Gender>("Male");
  const [language, setLanguage] = useState<Language>("English");
  const [model, setModel] = useState<Model>("OpenAI GPT 5");
  const [selectedMic, setSelectedMic] = useState(MICROPHONES[0]);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [agentTyping, setAgentTyping] = useState(false);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);

  const [isRecording, setIsRecording] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const msgCounterRef = useRef(100);
  const feedbackCounterRef = useRef(200);
  const autoFeedbackIndexRef = useRef(0);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const ttsActiveRef = useRef(false);
  const genderRef = useRef(gender);
  const languageRef = useRef(language);

  useEffect(() => { genderRef.current = gender; }, [gender]);
  useEffect(() => { languageRef.current = language; }, [language]);

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

  const sendChatMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userId = msgCounterRef.current++;
    const userMsg: Message = {
      id: userId,
      role: "user",
      text: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    inputRef.current?.focus();

    // Agent typing indicator
    setAgentTyping(true);
    setAgentSpeaking(true);
    const typingId = msgCounterRef.current++;
    const typingMsg: Message = {
      id: typingId,
      role: "agent",
      text: "",
      timestamp: new Date(),
      typing: true,
    };
    setTimeout(() => {
      setMessages((prev) => [...prev, typingMsg]);
    }, 400);

    // Agent reply after short delay
    const replyDelay = 1500 + Math.random() * 1000;
    const t = setTimeout(() => {
      const reply = AGENT_REPLIES[Math.floor(Math.random() * AGENT_REPLIES.length)];
      setMessages((prev) =>
        prev.map((m) => (m.id === typingId ? { ...m, text: reply, typing: false } : m))
      );
      setAgentTyping(false);

      // Text-to-speech
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(reply);
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
            const preferred = currentGender === "Female"
              ? filtered.find((v) => femaleKeywords.test(v.name))
                ?? filtered.find((v) => !maleKeywords.test(v.name))
                ?? filtered[0]
              : filtered.find((v) => maleKeywords.test(v.name))
                ?? filtered.find((v) => !femaleKeywords.test(v.name))
                ?? filtered[0];
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
          // voices not loaded yet — wait for the event
          window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.onvoiceschanged = null;
            applyVoiceAndSpeak();
          };
        }
      } else {
        const speakEnd = setTimeout(() => setAgentSpeaking(false), Math.min(reply.length * 35, 4000));
        timersRef.current.push(speakEnd);
      }
    }, replyDelay);
    timersRef.current.push(t);

    // Auto-generate an English feedback card after each user message
    const feedbackDelay = replyDelay + 600 + Math.random() * 800;
    const tf = setTimeout(() => {
      const idx = autoFeedbackIndexRef.current % AUTO_FEEDBACKS.length;
      autoFeedbackIndexRef.current++;
      const fb = AUTO_FEEDBACKS[idx];
      const newFb: FeedbackItem = {
        ...fb,
        id: feedbackCounterRef.current++,
        timestamp: new Date(),
      };
      setFeedbacks((prev) => [newFb, ...prev]);
    }, feedbackDelay);
    timersRef.current.push(tf);
  }, []);

  // Auto-start/stop recognition when mic toggle or connection changes
  useEffect(() => {
    if (status !== "connected" || !micEnabled) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      setChatInput("");
      return;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      alert("Trình duyệt không hỗ trợ nhận dạng giọng nói. Dùng Chrome hoặc Edge.");
      setMicEnabled(false);
      return;
    }

    let stopped = false;

    function startListening() {
      if (stopped) return;
      const recognition = new SpeechRecognitionAPI!();
      recognition.lang = LANGUAGE_CODES[language];
      recognition.interimResults = true;
      recognition.continuous = false;
      recognitionRef.current = recognition;

      recognition.onstart = () => setIsRecording(true);

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) final += transcript;
          else interim += transcript;
        }
        if (final) {
          setChatInput("");
          sendChatMessage(final);
        } else {
          setChatInput(interim);
        }
      };

      recognition.onerror = (event: Event) => {
        const err = (event as { error?: string }).error || "";
        if (err === "not-allowed") {
          stopped = true;
          setMicEnabled(false);
          alert("Trình duyệt chặn micro. Hãy cho phép quyền micro trong thanh địa chỉ.");
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
        // auto restart after brief pause
        setTimeout(() => { if (!stopped) startListening(); }, 200);
      };

      recognition.start();
    }

    startListening();

    return () => {
      stopped = true;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsRecording(false);
      setChatInput("");
    };
  }, [status, micEnabled, language, sendChatMessage]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (chatInput.trim() && status === "connected" && !agentTyping) {
        sendChatMessage(chatInput);
      }
    }
  }, [chatInput, status, agentTyping, sendChatMessage]);

  const handleConnect = useCallback(() => {
    if (status === "connected") {
      window.speechSynthesis?.cancel();
      ttsActiveRef.current = false;
      setStatus("disconnected");
      setAgentSpeaking(false);
      setAgentTyping(false);
      setMessages([]);
      setFeedbacks([]);
      autoFeedbackIndexRef.current = 0;
      clearTimers();
      return;
    }
    if (status === "disconnected") {
      setStatus("connecting");
      setMessages([]);
      setFeedbacks([]);
      autoFeedbackIndexRef.current = 0;
      clearTimers();

      const t0 = setTimeout(() => {
        setStatus("connected");

        // Agent greeting based on selected topic
        const greetingText = TOPIC_GREETINGS[topic] ?? TOPIC_GREETINGS["daily"];
        const greetId = msgCounterRef.current++;
        const typingId = msgCounterRef.current++;

        setTimeout(() => {
          setAgentSpeaking(true);
          setAgentTyping(true);
          setMessages([{ id: greetId, role: "agent", text: "", timestamp: new Date(), typing: true }]);
        }, 400);

        setTimeout(() => {
          setMessages([{ id: typingId, role: "agent", text: greetingText, timestamp: new Date() }]);
          setAgentTyping(false);

          // TTS
          if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const utt = new SpeechSynthesisUtterance(greetingText);
            utt.lang = LANGUAGE_CODES[languageRef.current];
            utt.rate = 1;
            utt.pitch = genderRef.current === "Female" ? 1.15 : 0.9;
            const applyAndSpeak = () => {
              const voices = window.speechSynthesis.getVoices();
              const langPrefix = LANGUAGE_CODES[languageRef.current].split("-")[0];
              const filtered = voices.filter((v) => v.lang.startsWith(langPrefix));
              if (filtered.length > 0) {
                const femaleKw = /female|woman|zira|samantha|nữ/i;
                const maleKw = /male|man|david|mark|nam/i;
                utt.voice = genderRef.current === "Female"
                  ? (filtered.find((v) => femaleKw.test(v.name)) ?? filtered.find((v) => !maleKw.test(v.name)) ?? filtered[0])
                  : (filtered.find((v) => maleKw.test(v.name)) ?? filtered.find((v) => !femaleKw.test(v.name)) ?? filtered[0]);
              }
              ttsActiveRef.current = true;
              setMicEnabled(false);
              utt.onend = () => { ttsActiveRef.current = false; setAgentSpeaking(false); setMicEnabled(true); };
              utt.onerror = () => { ttsActiveRef.current = false; setAgentSpeaking(false); setMicEnabled(true); };
              window.speechSynthesis.speak(utt);
            };
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) applyAndSpeak();
            else { window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.onvoiceschanged = null; applyAndSpeak(); }; }
          } else {
            const t = setTimeout(() => setAgentSpeaking(false), Math.min(greetingText.length * 35, 5000));
            timersRef.current.push(t);
          }
        }, 1200);
      }, 2000);

      timersRef.current.push(t0);
    }
  }, [status, clearTimers]);

  useEffect(() => {
    return () => { clearTimers(); };
  }, [clearTimers]);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  return (
    <div className="h-screen overflow-hidden bg-[#0d1017] text-gray-200 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/8 bg-[#0d1017]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-white/90 rounded-sm flex items-center justify-center">
            <span className="text-[10px] font-black text-gray-900 leading-none">VIN</span>
          </div>
          <span className="text-sm font-semibold text-white">IELTS Speaking Coach</span>
        </div>

        <div className="flex items-center gap-3">
          {currentUser ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1">
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
                  {currentUser.name[0].toUpperCase()}
                </div>
                <span className="text-xs text-gray-300">{currentUser.name}</span>
              </div>
              <button
                onClick={() => setCurrentUser(null)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-400 transition-colors"
                title="Đăng xuất"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setAuthModal("login")}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-300 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-colors"
              >
                <LogIn className="w-3 h-3" /> Đăng nhập
              </button>
              <button
                onClick={() => setAuthModal("register")}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                <UserPlus className="w-3 h-3" /> Đăng ký
              </button>
            </div>
          )}


        </div>
      </header>

      {/* Description bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-white/6 bg-[#0d1017]/80 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-400">Description</span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-400">{TOPICS.find((t) => t.id === topic)?.label ?? "Daily Conversation"}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="button-settings"
            onClick={() => setShowSettings((v) => !v)}
            className="p-1.5 rounded hover:bg-white/8 transition-colors text-gray-500 hover:text-gray-300"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            data-testid="button-connect"
            onClick={handleConnect}
            disabled={isConnecting}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${
              isConnected
                ? "bg-red-600/80 hover:bg-red-600 text-white border border-red-500/50"
                : isConnecting
                ? "bg-blue-600/50 text-blue-300 border border-blue-500/30 cursor-not-allowed"
                : "bg-white text-gray-900 hover:bg-gray-100 border border-white/20"
            }`}
          >
            {isConnected ? "Disconnect" : isConnecting ? "Connecting..." : "Connect"}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Audio & Video */}
        <div className="w-[320px] flex-shrink-0 border-r border-white/8 flex flex-col bg-[#0e1118] overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/6">
            <span className="text-xs font-semibold text-gray-300 tracking-wide">Audio & Video</span>
            <SelectDropdown value={gender} options={GENDERS} onChange={setGender} />
          </div>

          {/* Agent display */}
          <div className="bg-[#0c1020] mx-2 mt-2 rounded-md overflow-hidden border border-white/6">
            <div className="flex flex-col items-center justify-center py-5 px-4 min-h-[130px]">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all duration-500 ${
                agentSpeaking
                  ? "bg-blue-600/30 border-2 border-blue-500/60 shadow-lg shadow-blue-500/20"
                  : "bg-blue-600/15 border border-blue-500/25"
              }`}>
                <SiOpenai className={`w-6 h-6 transition-colors duration-300 ${agentSpeaking ? "text-blue-300" : "text-blue-400"}`} />
              </div>
              <span className="text-xs font-medium text-gray-400 mb-2">Agent</span>
              {(isConnected || isConnecting) ? (
                <AgentWaveform active={agentSpeaking} />
              ) : (
                <div className="flex items-center gap-1 mt-1">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-blue-500/30" />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Microphone section */}
          <div className="px-2 mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-gray-500 tracking-widest uppercase">Microphone</span>
              <div className="flex items-center gap-2">
                <button
                  data-testid="button-mic-toggle"
                  onClick={() => setMicEnabled((v) => !v)}
                  className={`p-1 rounded transition-colors ${
                    isRecording
                      ? "text-red-400 hover:text-red-300 animate-pulse"
                      : micEnabled
                      ? "text-blue-400 hover:text-blue-300"
                      : "text-gray-600 hover:text-gray-400"
                  }`}
                >
                  {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>
                <DeviceSelect value={selectedMic} options={MICROPHONES} onChange={setSelectedMic} />
              </div>
            </div>
            <div className="bg-[#0c1020] rounded-md border border-white/6 py-2 px-2">
              <MicWaveform active={micEnabled && isConnected} />
            </div>
          </div>

          {/* AI Feedback Panel */}
          <div className="px-2 mt-3 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-gray-500 tracking-widest uppercase">AI Feedback</span>
              {feedbacks.length > 0 && (
                <span className="text-[9px] bg-blue-600/20 text-blue-400 border border-blue-500/25 rounded-full px-1.5 py-0.5">
                  {feedbacks.length}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin pr-0.5">
              {feedbacks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-center py-8">
                  <CheckCircle2 className="w-7 h-7 text-gray-700" />
                  <p className="text-[10px] text-gray-600 leading-relaxed px-2">
                    {isConnected
                      ? "Listening for errors..."
                      : "Connect to see real-time English corrections"}
                  </p>
                </div>
              ) : (
                feedbacks.map((fb) => {
                  const meta = FEEDBACK_ICON[fb.type];
                  const Icon = meta.icon;
                  return (
                    <div
                      key={fb.id}
                      className={`rounded-md border p-2 ${meta.bg} animate-fadeIn`}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Icon className={`w-3 h-3 flex-shrink-0 ${meta.color}`} />
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
                      </div>
                      <p className="text-[10px] text-red-300/80 line-through mb-0.5 leading-snug">{fb.original}</p>
                      <p className="text-[10px] text-green-300 font-medium mb-1 leading-snug">{fb.corrected}</p>
                      <p className="text-[9px] text-gray-500 leading-relaxed">{fb.explanation}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="h-3" />
        </div>

        {/* Right panel: Conversation transcript */}
        <div className="flex-1 flex flex-col">
          {/* Panel top bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/6">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-gray-400">Conversation</span>
              {isConnected && (
                <div className="flex items-center gap-1.5">
                  <Circle className={`w-1.5 h-1.5 fill-current ${agentSpeaking ? "text-blue-400" : "text-green-400"}`} />
                  <span className="text-[10px] text-gray-500">
                    {agentSpeaking ? "Agent speaking" : "Listening"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <SiOpenai className="w-4 h-4 text-gray-400" />
                <SelectDropdown value={model} options={MODELS} onChange={setModel} />
              </div>
              <SelectDropdown value={language} options={LANGUAGES} onChange={setLanguage} />
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
            {status === "disconnected" && messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                  <SiOpenai className="w-8 h-8 text-blue-400/50" />
                </div>
                <div className="space-y-1">
                  <p className="text-gray-400 text-sm">
                    Click <span className="font-semibold text-white">Connect</span> to start a session
                  </p>
                  <p className="text-gray-600 text-xs">Conversation transcript will appear here</p>
                </div>
              </div>
            )}

            {status === "connecting" && (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-600/15 border border-blue-500/30 flex items-center justify-center animate-pulse">
                  <SiOpenai className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-blue-400"
                      style={{ animation: `dotPulse 1s ease-in-out ${i * 200}ms infinite` }}
                    />
                  ))}
                </div>
                <p className="text-blue-300/70 text-xs">Establishing connection...</p>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            <div ref={chatBottomRef} />
          </div>

          {/* Chat input bar */}
          <div className="border-t border-white/8 px-3 py-3 bg-[#0d1017]">
            {!isConnected ? (
              <div className="flex items-center justify-center py-2 text-xs text-gray-700">
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
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                    }}
                    onKeyDown={handleKeyDown}
                    disabled={agentTyping}
                    placeholder={isRecording ? "Đang nghe giọng nói..." : agentTyping ? "Agent is typing..." : "Type a message... (Enter to send)"}
                    rows={1}
                    className={`w-full resize-none rounded-xl border px-3 py-2 text-sm bg-[#131929] text-gray-200 placeholder-gray-600 outline-none transition-all leading-relaxed
                      ${agentTyping
                        ? "border-white/8 opacity-60 cursor-not-allowed"
                        : "border-white/12 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                      }`}
                    style={{ minHeight: "38px", maxHeight: "120px" }}
                  />
                </div>

                {/* Send button */}
                <button
                  data-testid="button-send-chat"
                  onClick={() => {
                    if (chatInput.trim() && !agentTyping) sendChatMessage(chatInput);
                  }}
                  disabled={!chatInput.trim() || agentTyping}
                  className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    chatInput.trim() && !agentTyping
                      ? "bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20"
                      : "bg-white/5 text-gray-700 cursor-not-allowed"
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
                    <div className="flex items-center gap-[2px]">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div
                          key={i}
                          className="w-[2px] rounded-full bg-blue-400"
                          style={{
                            height: `${3 + Math.sin(i * 0.8) * 6}px`,
                            animation: `agentWave 0.8s ease-in-out ${i * 60}ms infinite`,
                            opacity: 0.65,
                          }}
                        />
                      ))}
                      <span className="ml-1 text-[10px] text-blue-400/70">Agent speaking</span>
                    </div>
                  )}
                  {agentTyping && !agentSpeaking && (
                    <span className="text-[10px] text-gray-600 italic">Agent is typing...</span>
                  )}
                </div>
                <span className="text-[10px] text-gray-700">
                  {messages.filter((m) => !m.typing).length} messages • Enter to send, Shift+Enter for newline
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
            className="mt-[72px] mr-3 bg-[#161b27] border border-white/12 rounded-xl shadow-2xl w-80 p-4 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-gray-200 mb-1 text-sm">Chủ đề luyện tập</h3>
            <p className="text-[10px] text-gray-600 mb-3">Chọn chủ đề để AI tập trung hướng dẫn đúng hướng</p>
            <div className="space-y-1">
              {TOPICS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setTopic(t.id); setShowSettings(false); }}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                    topic === t.id
                      ? "bg-blue-600/25 border border-blue-500/40 text-blue-200"
                      : "text-gray-400 hover:bg-white/6 border border-transparent"
                  }`}
                >
                  <div>
                    <div className="text-xs font-medium">{t.label}</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">{t.desc}</div>
                  </div>
                  {topic === t.id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {authModal && (
        <AuthModal
          mode={authModal}
          onClose={() => setAuthModal(null)}
          onSuccess={(user) => { setCurrentUser(user); setAuthModal(null); }}
        />
      )}
    </div>
  );
}
