import { useState, useEffect, useRef, useCallback, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, Settings, Circle, SendHorizontal, AlertCircle, BookOpen, Volume2, Zap, CheckCircle2, LogIn, UserPlus, LogOut, Moon, Sun } from "lucide-react";
import { SiOpenai } from "react-icons/si";

import { chatRespond } from "../api/chat";
import { getAuthSession } from "../auth/tokenStorage";
import {
  AgentWaveform,
  DeviceSelect,
  MessageBubble,
  MicWaveform,
  SelectDropdown,
} from "../components/voice-agent";
import type { Message } from "../components/voice-agent";

interface AuthUser {
  name: string;
  email?: string;
}

type ConnectionStatus = "disconnected" | "connecting" | "connected";
type Gender = "Male" | "Female";
type Language = "English" | "Vietnamese";
type Model = "OpenAI GPT 5" | "OpenAI GPT 4o" | "Claude 3.5 Sonnet" | "Gemini 1.5 Pro";

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
  grammar:       { icon: AlertCircle,    color: "text-red-500",    bg: "bg-red-50 border-red-200",    label: "Grammar"       },
  vocabulary:    { icon: BookOpen,       color: "text-yellow-500", bg: "bg-yellow-50 border-yellow-200", label: "Vocabulary"  },
  pronunciation: { icon: Volume2,        color: "text-purple-600", bg: "bg-violet-50 border-purple-500/25", label: "Pronunciation" },
  fluency:       { icon: Zap,            color: "text-blue-600",   bg: "bg-blue-50 border-blue-200",  label: "Fluency"       },
};

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

interface VoiceAgentProps {
  currentUser?: AuthUser | null;
  onLogout?: () => void;
}

export default function VoiceAgent({ currentUser: initialUser = null, onLogout }: VoiceAgentProps) {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState<boolean>(() => {
    try { return localStorage.getItem("va-theme") === "dark"; } catch { return false; }
  });

  useEffect(() => {
    localStorage.setItem("va-theme", isDark ? "dark" : "light");
    const id = 'va-dark-override';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (isDark) {
      if (!el) {
        el = document.createElement('style');
        el.id = id;
        document.head.appendChild(el);
      }
      el.textContent = `
        [data-va=root]                  { background:#0d1117 !important; color:#e2e8f0 !important; }
        [data-va=header]                { background:#0d1117 !important; border-color:rgba(255,255,255,0.08) !important; }
        [data-va=descbar]               { background:#0c1220 !important; border-color:rgba(255,255,255,0.06) !important; }
        [data-va=content]               { background:#0d1117 !important; }
        [data-va=left]                  { background:#13181f !important; border-color:rgba(255,255,255,0.08) !important; }
        [data-va=left] .border-gray-200 { border-color:rgba(255,255,255,0.08) !important; }
        [data-va=right]                 { background:#0d1117 !important; }
        [data-va=messages]              { background:#0c1220 !important; }
        [data-va=input]                 { background:#0d1117 !important; border-color:rgba(255,255,255,0.08) !important; }
        [data-va=textarea]              { background:#131929 !important; color:#e2e8f0 !important; border-color:rgba(255,255,255,0.12) !important; }
        [data-va=textarea]::placeholder { color:#475569 !important; }
        [data-va=root] .text-gray-800   { color:#e2e8f0 !important; }
        [data-va=root] .text-gray-700   { color:#cbd5e1 !important; }
        [data-va=root] .text-gray-600   { color:#94a3b8 !important; }
        [data-va=root] .text-gray-500   { color:#64748b !important; }
        [data-va=root] .text-gray-900   { color:#f1f5f9 !important; }
        [data-va=root] .border-gray-200 { border-color:rgba(255,255,255,0.08) !important; }
        [data-va=root] .border-gray-100 { border-color:rgba(255,255,255,0.06) !important; }
        [data-va=root] .bg-white        { background:#13181f !important; }
        [data-va=root] .bg-gray-50      { background:#13181f !important; }
        [data-va=root] .bg-gray-100     { background:#1a2232 !important; }
        [data-va=root] .hover\\:bg-gray-100:hover { background:rgba(255,255,255,0.06) !important; }
        [data-va=root] .bg-blue-50      { background:#12213a !important; }
        [data-va=root] .bg-violet-50    { background:#1e1538 !important; }
        [data-va=root] .bg-blue-100     { background:#172542 !important; }
        [data-va=root] .bg-violet-100   { background:#241640 !important; }
        [data-va=root] .border-blue-200,
        [data-va=root] .border-blue-300  { border-color:rgba(96,165,250,0.28) !important; }
        [data-va=root] .border-violet-200,
        [data-va=root] .border-violet-300 { border-color:rgba(167,139,250,0.28) !important; }
        [data-va=root] .bg-red-50       { background:#2a1215 !important; }
        [data-va=root] .bg-yellow-50    { background:#251d0a !important; }
        [data-va=root] .bg-purple-50    { background:#1e1330 !important; }
        [data-va=root] .bg-green-50     { background:#0f2215 !important; }
        [data-va=root] .border-red-200  { border-color:rgba(248,113,113,0.3) !important; }
        [data-va=root] .border-yellow-200 { border-color:rgba(251,191,36,0.3) !important; }
        [data-va=root] .border-purple-200 { border-color:rgba(192,132,252,0.3) !important; }
        [data-va=root] .border-green-200 { border-color:rgba(74,222,128,0.3) !important; }
        [data-va=root] select           { background:#13181f !important; color:#e2e8f0 !important; }
        [data-va=root] .text-red-500    { color:#f87171 !important; }
        [data-va=root] .text-red-600    { color:#f87171 !important; }
        [data-va=root] .text-green-600  { color:#4ade80 !important; }
        [data-va=root] .text-amber-600, [data-va=root] .text-yellow-600 { color:#fbbf24 !important; }
        [data-va=root] .text-purple-600 { color:#c084fc !important; }
        [data-va=root] .bg-gradient-to-b { background:#0c1220 !important; }
        /* ScoreBadge /100 text — switch to light in dark mode */
        [data-va=root] [data-score-suffix] { color:rgba(255,255,255,0.35) !important; }
        /* ReplayButton — invert to white-transparent in dark mode */
        [data-va=root] [data-replay-btn]   { border-color:rgba(255,255,255,0.15) !important; background:rgba(255,255,255,0.06) !important; color:rgba(255,255,255,0.45) !important; }
        /* Chat bubbles in dark mode */
        [data-va=root] .text-gray-900      { color:#f1f5f9 !important; }
        [data-va=root] ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); }
        [data-va=conv-header]           { background:#0d1117 !important; border-color:rgba(255,255,255,0.08) !important; }
        [data-va=right]                 { background:#0d1117 !important; }
      `;
    } else {
      if (el) el.remove();
    }
  }, [isDark]);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(initialUser);
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
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const localAudioUrlsRef = useRef<string[]>([]);

  useEffect(() => { genderRef.current = gender; }, [gender]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { setCurrentUser(initialUser); }, [initialUser]);

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
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    if (mediaRecorderRef.current?.state === "recording") {
      return;
    }

    if (!mediaStreamRef.current) {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    const preferredMimeType = "audio/webm;codecs=opus";
    const recorder = MediaRecorder.isTypeSupported(preferredMimeType)
      ? new MediaRecorder(mediaStreamRef.current, { mimeType: preferredMimeType })
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

    if (recorder.state === "inactive") {
      mediaRecorderRef.current = null;
      if (audioChunksRef.current.length === 0) {
        return undefined;
      }
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
      audioChunksRef.current = [];
      return blob.size > 0 ? blob : undefined;
    }

    return await new Promise<Blob | undefined>((resolve) => {
      recorder.onstop = () => {
        mediaRecorderRef.current = null;
        const blob = audioChunksRef.current.length
          ? new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" })
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

  const playAgentAudio = useCallback((text: string, audioUrl?: string) => {
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
  }, [speakText]);

  const generateScore = useCallback((text: string) => {
    const words = text.trim().split(/\s+/).length;
    const base = Math.floor(Math.random() * 20) + 72;
    const bonus = Math.min(words * 0.6, 9);
    return Math.min(Math.round(base + bonus), 99);
  }, []);

  const sendChatMessage = useCallback(async (text: string, audioBlob?: Blob) => {
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
      userAudioUrl: audioBlob ? URL.createObjectURL(audioBlob) : undefined,
    };

    if (userMsg.userAudioUrl) {
      localAudioUrlsRef.current.push(userMsg.userAudioUrl);
    }

    const historyPayload: { role: string; text: string }[] = [
      ...messages.filter((message) => !message.typing).map((message) => ({
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

        const responseText = String(data.response_text || "").trim() || "I am ready to help you practice.";
        
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
          prev.map((message) => (
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
          ))
        );
      } else {
        await new Promise<void>((res) => { timersRef.current.push(setTimeout(res, 700 + Math.random() * 600)); });
        const reply = AGENT_REPLIES[Math.floor(Math.random() * AGENT_REPLIES.length)];
        playAgentAudio(reply);
        setMessages((prev: Message[]) =>
          prev.map((message) => (
            message.id === typingId
              ? { ...message, text: reply, typing: false }
              : message
          ))
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
      const errorMessage = error instanceof Error ? error.message : "Chat request failed";
      setMessages((prev: Message[]) =>
        prev.map((message) => (
          message.id === typingId
            ? { ...message, text: `Agent error: ${errorMessage}`, typing: false }
            : message
        ))
      );
      setAgentSpeaking(false);
      setMicEnabled(true);
    } finally {
      setAgentTyping(false);
    }
  }, [agentTyping, messages, playAgentAudio, topic, generateScore]);

  // Auto-start/stop recognition when mic toggle or connection changes
  useEffect(() => {
    if (status !== "connected" || !micEnabled) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      setChatInput("");
      void stopUserAudioCapture();
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
        if (err === "not-allowed") {
          stopped = true;
          setMicEnabled(false);
          alert("Trình duyệt chặn micro. Hãy cho phép quyền micro trong thanh địa chỉ.");
        }
        setIsRecording(false);
        void stopUserAudioCapture();
      };

      recognition.onend = () => {
        setIsRecording(false);
        void stopUserAudioCapture();
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
      void stopUserAudioCapture();
    };
  }, [status, micEnabled, language, sendChatMessage, startUserAudioCapture, stopUserAudioCapture]);

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
      clearLocalAudioUrls();
      setFeedbacks([]);
      autoFeedbackIndexRef.current = 0;
      clearTimers();
      return;
    }
    if (status === "disconnected") {
      setStatus("connecting");
      setMessages([]);
      clearLocalAudioUrls();
      setFeedbacks([]);
      autoFeedbackIndexRef.current = 0;
      clearTimers();

      const t0 = setTimeout(() => {
        setStatus("connected");
        setAgentTyping(false);
        setAgentSpeaking(false);
      }, 600);

      timersRef.current.push(t0);
    }
  }, [status, clearTimers, clearLocalAudioUrls]);

  useEffect(() => {
    return () => {
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
    <div data-va="root" className={`h-screen overflow-hidden bg-[#f5f7fa] text-gray-800 flex flex-col${isDark ? " va-dark" : ""}`}>
      {/* Top bar */}
      <header data-va="header" className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-[#f5f7fa]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded-sm flex items-center justify-center">
            <span className="text-[10px] font-black text-white leading-none">VIN</span>
          </div>
          <span className="text-sm font-semibold text-gray-800">IELTS Speaking Coach</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDark(v => !v)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          {currentUser ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-1">
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-gray-900">
                  {currentUser.name[0].toUpperCase()}
                </div>
                <span className="text-xs text-gray-400">{currentUser.name}</span>
              </div>
              <button
                onClick={() => {
                  if (onLogout) {
                    onLogout();
                    return;
                  }
                  setCurrentUser(null);
                }}
                className="flex items-center gap-1 text-xs text-gray-700 hover:text-red-400 transition-colors"
                title="Đăng xuất"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
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
      <div data-va="descbar" className="flex items-center justify-between px-4 py-1.5 border-b border-gray-200 bg-[#f5f7fa]/80 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-700">Description</span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-700">{TOPICS.find((t) => t.id === topic)?.label ?? "Daily Conversation"}</span>
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
            {isConnected ? "Disconnect" : isConnecting ? "Connecting..." : "Connect"}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div data-va="content" className="flex flex-1 overflow-hidden">
        {/* Left panel: Audio & Video */}
        <div data-va="left" className="w-[320px] shrink-0 border-r border-gray-200 flex flex-col bg-white overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-700 tracking-wide">Audio & Video</span>
            <SelectDropdown value={gender} options={GENDERS} onChange={setGender} />
          </div>

          {/* Agent display */}
          <div className="bg-gradient-to-b from-blue-50 to-indigo-50 mx-2 mt-2 rounded-md overflow-hidden border border-gray-200">
            <div className="flex flex-col items-center justify-center py-5 px-4 min-h-32.5">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all duration-500 ${
                agentSpeaking
                  ? "bg-blue-600/30 border-2 border-blue-500/60 shadow-lg shadow-blue-200"
                  : "bg-blue-100 border border-blue-200"
              }`}>
                <SiOpenai className={`w-6 h-6 transition-colors duration-300 ${agentSpeaking ? "text-blue-600" : "text-blue-600"}`} />
              </div>
              <span className="text-xs font-medium text-gray-700 mb-2">Agent</span>
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
              <span className="text-[10px] font-semibold text-gray-700 tracking-widest uppercase">Microphone</span>
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
                  {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>
                <DeviceSelect value={selectedMic} options={MICROPHONES} onChange={setSelectedMic} />
              </div>
            </div>
            <div className="bg-gradient-to-b from-blue-50 to-indigo-50 rounded-md border border-gray-200 py-2 px-2">
              <MicWaveform active={micEnabled && isConnected} />
            </div>
          </div>

          {/* AI Feedback Panel */}
          <div className="px-2 mt-3 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-gray-700 tracking-widest uppercase">AI Feedback</span>
              {feedbacks.length > 0 && (
                <span className="text-[9px] bg-blue-600/20 text-blue-400 border border-blue-200 rounded-full px-1.5 py-0.5">
                  {feedbacks.length}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin pr-0.5">
              {feedbacks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-center py-8">
                  <CheckCircle2 className="w-7 h-7 text-gray-400" />
                  <p className="text-[10px] text-gray-500 leading-relaxed px-2">
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
                        <Icon className={`w-3 h-3 shrink-0 ${meta.color}`} />
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
                      </div>
                      <p className="text-[10px] text-red-500 opacity-75 line-through mb-0.5 leading-snug">{fb.original}</p>
                      <p className="text-[10px] text-green-600 font-medium mb-1 leading-snug">{fb.corrected}</p>
                      <p className="text-[9px] text-gray-700 leading-relaxed">{fb.explanation}</p>
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
          <div data-va="conv-header" className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-gray-700">Conversation</span>
              {isConnected && (
                <div className="flex items-center gap-1.5">
                  <Circle className={`w-1.5 h-1.5 fill-current ${agentSpeaking ? "text-blue-600" : "text-green-400"}`} />
                  <span className="text-[10px] text-gray-600">
                    {agentSpeaking ? "Agent speaking" : "Listening"}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <SiOpenai className="w-4 h-4 text-gray-500" />
                <SelectDropdown value={model} options={MODELS} onChange={setModel} />
              </div>
              <SelectDropdown value={language} options={LANGUAGES} onChange={setLanguage} />
            </div>
          </div>

          {/* Messages area */}
          <div data-va="messages" className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
            {status === "disconnected" && messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center">
                  <SiOpenai className="w-8 h-8 text-blue-400/50" />
                </div>
                <div className="space-y-1">
                  <p className="text-gray-600 text-sm">
                    Click <span className="font-semibold text-gray-900">Connect</span> to start a session
                  </p>
                  <p className="text-gray-400 text-xs">Conversation transcript will appear here</p>
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
                      style={{ animation: `dotPulse 1s ease-in-out ${i * 200}ms infinite` }}
                    />
                  ))}
                </div>
                <p className="text-blue-600/70 text-xs">Establishing connection...</p>
              </div>
            )}

            {messages.map((msg) => {
              const canReplay = msg.role === "agent" || Boolean(msg.userAudioUrl);
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onReplay={canReplay ? () => {
                    if (msg.role === "agent") {
                      // Use stored audio URL if available; fall back to TTS if not
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
                  } : undefined}
                />
              );
            })}

            <div ref={chatBottomRef} />
          </div>

          {/* Chat input bar */}
          <div data-va="input" className="border-t border-gray-200 px-3 py-3 bg-[#f5f7fa]">
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
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                    }}
                    onKeyDown={handleKeyDown}
                    disabled={agentTyping}
                    placeholder={isRecording ? "Đang nghe giọng nói..." : agentTyping ? "Agent is typing..." : "Type a message... (Enter to send)"}
                    rows={1}
                    data-va="textarea" className={`w-full resize-none rounded-xl border px-3 py-2 text-sm bg-[#f1f5f9] text-gray-800 placeholder-gray-400 outline-none transition-all leading-relaxed
                      ${agentTyping
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
                    if (chatInput.trim() && !agentTyping) sendChatMessage(chatInput);
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
                      <span className="ml-1 text-[10px] text-blue-600/80">Agent speaking</span>
                    </div>
                  )}
                  {agentTyping && !agentSpeaking && (
                    <span className="text-[10px] text-gray-500 italic">Agent is typing...</span>
                  )}
                </div>
                <span className="text-[10px] text-gray-600">
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
            className="mt-18 mr-3 bg-white border border-gray-200 rounded-xl shadow-2xl w-80 p-4 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-gray-800 mb-1 text-sm">Chủ đề luyện tập</h3>
            <p className="text-[10px] text-gray-500 mb-3">Chọn chủ đề để AI tập trung hướng dẫn đúng hướng</p>
            <div className="space-y-1">
              {TOPICS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setTopic(t.id); setShowSettings(false); }}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                    topic === t.id
                      ? "bg-blue-100 border border-blue-300 text-blue-200"
                      : "text-gray-600 hover:bg-gray-100 border border-transparent"
                  }`}
                >
                  <div>
                    <div className="text-xs font-medium text-gray-800">{t.label}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{t.desc}</div>
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
    </div>
  );
}
