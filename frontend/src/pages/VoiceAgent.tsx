import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Circle } from 'lucide-react';
import { toast } from 'sonner';
import { SiOpenai } from 'react-icons/si';

import { clearAuthSession, getAuthSession } from '../auth/tokenStorage';
import { fetchConversations, fetchMessagesWithScores } from '../api/conversations';
import type { MessageWithScoreOut, ConversationSummary } from '../api/conversations';
import {
  AiFeedbackPanel,
  ChatInputBar,
  ConversationSidebar,
  HistorySidebar,
  LeftAudioPanel,
  LogoutConfirmModal,
  MessageBubble,
  SelectDropdown,
  SessionSummaryModal,
  VoiceAgentHeader,
} from '../components/voice-agent';
import type { Message, Mistake, SessionSummary } from '../components/voice-agent';
import {
  LANGUAGES,
  MODELS,
  type AuthUser,
  type ConnectionStatus,
  type FeedbackItem,
  type Gender,
  type Language,
  type Model,
} from '../components/voice-agent/constants';
import { useTopics } from '../hooks/useTopics';
import { getInitialSessionState } from '../components/voice-agent/sessionRestore';
import { useLanguage } from '../i18n/useLanguage';
import useAgentAudio from '../hooks/useAgentAudio';
import useAudioCapture from '../hooks/useAudioCapture';
import useMicDevices from '../hooks/useMicDevices';
import useSendChatMessage from '../hooks/useSendChatMessage';
import useSessionPersistence from '../hooks/useSessionPersistence';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import useVoiceActivity from '../hooks/useVoiceActivity';
import { useDarkMode } from '../theme/useDarkMode';

interface VoiceAgentProps {
  currentUser?: AuthUser | null;
  onLogout?: () => void;
}

export default function VoiceAgent({ currentUser: initialUser = null, onLogout }: VoiceAgentProps) {
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const [isDark, toggleDark] = useDarkMode();

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

  // ---------------------------------------------------------------------------
  // Initial session restore (from ?session=, ?topic=, or sessionStorage)
  // Computed once via useMemo with empty deps — this hits localStorage and
  // parses URL params, so we don't want to redo it on every render.
  // ---------------------------------------------------------------------------
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const initialState = useMemo(() => getInitialSessionState(), []);

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [micEnabled, setMicEnabled] = useState(false);
  // Tracks whether the user has explicitly turned the mic on. Used so the
  // auto-mute-during-TTS logic doesn't accidentally turn the mic on when the
  // user never asked for it (push-to-talk behaviour).
  const userMicIntentRef = useRef(false);
  const [gender, setGender] = useState<Gender>('Male');
  const [language, setLanguage] = useState<Language>(lang === 'vi' ? 'Vietnamese' : 'English');

  const { categories: topicCategories, loading: topicsLoading } = useTopics();

  // Flat list of all DB topics — derived from loaded categories
  const allDbTopics = useMemo(() => topicCategories.flatMap((c) => c.topics), [topicCategories]);

  const [topic, setTopic] = useState<string | null>(initialState.topic);
  const [customTopicLabel, setCustomTopicLabel] = useState<string | null>(
    initialState.customTopicLabel,
  );
  const [subOption, setSubOption] = useState<string | null>(initialState.subOption);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [model, setModel] = useState<Model>('OpenAI GPT 5');

  const { micDevices, selectedMicId, selectedMicIdRef, setSelectedMicId, refreshMicDevicesRef } =
    useMicDevices();

  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>(initialState.messages);
  const sessionIdRef = useRef<string | null>(initialState.sessionId);
  const [expandedMsgId, setExpandedMsgId] = useState<number | null>(null);
  const selectedMsg =
    expandedMsgId !== null ? (messages.find((m) => m.id === expandedMsgId) ?? null) : null;
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

  const sessionSummary = useMemo<SessionSummary | null>(() => {
    const userMsgs = messages.filter((m) => m.role === 'user' && m.scoreDetails);
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
      .slice(0, 3) as [string, number][];
    const weakest = (['pronunciation', 'fluency', 'accuracy'] as const).reduce(
      (w, k) => (scores[k] < scores[w] ? k : w),
      'pronunciation' as 'pronunciation' | 'fluency' | 'accuracy',
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
        `You made ${topErrors[0][1]} ${topErrors[0][0].toLowerCase()} mistake${topErrors[0][1] > 1 ? 's' : ''} — review them in your messages.`,
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
  const [, setFeedbacks] = useState<FeedbackItem[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showLeftPanelMobile, setShowLeftPanelMobile] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [convsLoading, setConvsLoading] = useState(false);
  const [convsRefreshKey, setConvsRefreshKey] = useState(0);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Bumped every time we (re)start a connection. Pending timers compare
  // against this and bail out if a newer session has been started, so
  // rapid clicks on "New session" / Connect can never let a stale timer
  // overwrite the current status / typing state.
  const sessionVersionRef = useRef(0);
  const msgCounterRef = useRef(initialState.nextMsgId);
  const feedbackCounterRef = useRef(200);
  // Tracks the DB conversation_id returned by the backend on each chat turn.
  // Sent back with every subsequent message so all turns belong to one conversation.
  const conversationIdRef = useRef<string | null>(initialState.conversationId ?? null);
  // Guards against double-saving the same session when both visibilitychange
  // and the unmount cleanup fire in rapid succession (e.g. tab close on
  // mobile). Reset to false at the start of every new session.
  const hasSavedCurrentSessionRef = useRef(false);
  // Prevents the "auto-load latest conversation" effect from re-firing after the
  // initial load (e.g. after New Chat or after the first navigation has happened).
  const hasAutoLoadedRef = useRef(false);
  // Set to true inside handleConnect when the session is brand-new (no prior
  // conversations for the topic) so the post-connect effect sends a greeting.
  const shouldGreetRef = useRef(false);
  const sessionStartRef = useRef<number | null>(null);
  const genderRef = useRef(gender);
  const languageRef = useRef(language);

  useLayoutEffect(() => {
    genderRef.current = gender;
  }, [gender]);
  useLayoutEffect(() => {
    languageRef.current = language;
  }, [language]);

  // Mirror the values persistSession needs into refs. Using useLayoutEffect
  // instead of bare render-body assignments ensures these refs are only
  // updated when React actually commits the render to the DOM. In Concurrent
  // Mode, React can render a component multiple times without committing
  // (e.g. for priority-based preemption); bare assignments would leave refs
  // holding values from an abandoned, never-committed render, which could
  // cause persistSession to save stale data.
  const messagesRef = useRef<Message[]>(initialState.messages);
  const sessionSummaryRef = useRef<SessionSummary | null>(null);
  const topicRef = useRef<string | null>(initialState.topic);
  const customTopicLabelRef = useRef<string | null>(initialState.customTopicLabel);
  /* eslint-disable react-hooks/immutability */
  useLayoutEffect(() => {
    messagesRef.current = messages;
    sessionSummaryRef.current = sessionSummary;
    topicRef.current = topic;
    customTopicLabelRef.current = customTopicLabel;
  }, [messages, sessionSummary, topic, customTopicLabel]);
  /* eslint-enable react-hooks/immutability */

  const { mediaStreamRef, startUserAudioCapture, stopUserAudioCapture, releaseMediaStream } =
    useAudioCapture(selectedMicIdRef);

  // Detects whether the user's voice is currently above the noise floor.
  // Drives mic-button + waveform animations so they only animate during
  // actual speech (not just because the mic is open).
  const isSpeaking = useVoiceActivity(mediaStreamRef, isRecording);

  const {
    ttsActiveRef,
    localAudioUrlsRef,
    audioBlobsRef,
    playAgentAudio,
    playMessageAudio,
    trimLocalAudioUrls,
    clearLocalAudioUrls,
  } = useAgentAudio({
    setMicEnabled,
    setAgentSpeaking,
    languageRef,
    genderRef,
    userMicIntentRef,
    messagesRef,
    timersRef,
  });

  // Single source of truth for toggling the mic — used by both the mic
  // button and the global Space-key shortcut so behaviour stays in sync.
  const toggleMic = useCallback(() => {
    setMicEnabled((prev) => {
      const next = !prev;
      userMicIntentRef.current = next;
      return next;
    });
  }, []);

  // Global keyboard shortcuts:
  //   Space  — toggle mic (ignored while typing in inputs/textareas)
  //   Esc    — close any open modal/menu, top-most first
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLogoutConfirm) {
          e.preventDefault();
          setShowLogoutConfirm(false);
          return;
        }
        if (showUserMenu) {
          e.preventDefault();
          setShowUserMenu(false);
          return;
        }
        return;
      }
      if (e.code === 'Space' || e.key === ' ') {
        // Ignore auto-repeat so holding Space doesn't rapid-toggle the mic.
        if (e.repeat) return;
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        // Don't hijack Space when focus is on any interactive control —
        // text fields, native buttons/links, or anything ARIA-flagged as
        // interactive. This keeps native keyboard activation working.
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          tag === 'button' ||
          tag === 'a' ||
          target?.isContentEditable ||
          target?.closest(
            'button, a, [role="button"], [role="menuitem"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"])',
          )
        ) {
          return;
        }
        e.preventDefault();
        toggleMic();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showLogoutConfirm, showUserMenu, toggleMic]);

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

  const { sendChatMessage, sendGreeting } = useSendChatMessage({
    messages,
    topic,
    subOption,
    gender,
    language,
    agentTyping,
    conversationIdRef,
    msgCounterRef,
    feedbackCounterRef,
    timersRef,
    localAudioUrlsRef,
    audioBlobsRef,
    inputRef,
    trimLocalAudioUrls,
    playAgentAudio,
    setMessages,
    setFeedbacks,
    setExpandedMsgId,
    setChatInput,
    setAgentTyping,
    setAgentSpeaking,
    setMicEnabled,
  });

  useSpeechRecognition({
    status,
    micEnabled,
    language,
    selectedMicId,
    selectedMicIdRef,
    mediaStreamRef,
    refreshMicDevicesRef,
    setIsRecording,
    setMicEnabled,
    setChatInput,
    startUserAudioCapture,
    stopUserAudioCapture,
    sendChatMessage,
    t,
  });

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (chatInput.trim() && status === 'connected' && !agentTyping) {
          sendChatMessage(chatInput);
        }
      }
    },
    [chatInput, status, agentTyping, sendChatMessage],
  );

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
  const statusRef = useRef<ConnectionStatus>(status);
  const setStatusSync = useCallback((next: ConnectionStatus) => {
    statusRef.current = next; // synchronous — readable by same-tick callers
    setStatus(next); // triggers async React re-render
  }, []);

  const { persistSession } = useSessionPersistence({
    hasSavedCurrentSessionRef,
  });

  const startNewSession = useCallback(
    (opts: { stayDisconnected?: boolean } = {}) => {
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
      conversationIdRef.current = null;

      if (opts.stayDisconnected) {
        setStatusSync('disconnected');
        return;
      }

      setStatusSync('connecting');

      const t0 = setTimeout(() => {
        // Bail out if a newer session/connect has superseded this one.
        if (sessionVersionRef.current !== myVersion) return;
        setStatusSync('connected');
        setAgentTyping(false);
        setAgentSpeaking(false);
      }, 600);

      timersRef.current.push(t0);
    },
    [clearTimers, clearLocalAudioUrls, setStatusSync, ttsActiveRef],
  );

  const handleConnect = useCallback(() => {
    // Read status from a ref so rapid clicks within a single event-loop
    // tick (before React commits the next render) always see the very
    // latest committed status — never a stale closure value.
    const currentStatus = statusRef.current;
    if (currentStatus === 'connected') {
      // Bump the version FIRST so any in-flight `connecting → connected`
      // setTimeout from a prior handleConnect call is immediately
      // invalidated by its own version-check guard.
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
      // Refresh the sidebar conversation list so the just-ended session
      // appears immediately without requiring a manual "New Chat" press.
      setConvsRefreshKey((k) => k + 1);
      return;
    }
    if (currentStatus === 'disconnected') {
      // Topic limit check — only for brand-new sessions (no existing conversation)
      const isNewSession = !conversationIdRef.current;
      if (isNewSession && topic) {
        const count = conversations.filter((c) => c.topic_code === topic).length;
        if (count >= 5) {
          toast.error(t('va.sidebar.limitReached'));
          return;
        }
        // Brand-new topic session → queue a greeting once connected
        shouldGreetRef.current = true;
      }
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
  }, [
    clearTimers,
    conversations,
    persistSession,
    setConvsRefreshKey,
    setStatusSync,
    t,
    topic,
    ttsActiveRef,
  ]);

  // When we transition to "connected" and a greeting was queued (brand-new
  // topic session with no prior conversations), send the AI opening message.
  useEffect(() => {
    if (status !== 'connected') return;
    if (!shouldGreetRef.current) return;
    shouldGreetRef.current = false;
    void sendGreeting();
  }, [status, sendGreeting]);

  // Validate the initial topic code against the loaded DB topics. If the code
  // from the URL/sessionStorage doesn't match any active topic, clear it so
  // the user is not stuck with a ghost topic selection.
  useEffect(() => {
    if (!topic || allDbTopics.length === 0) return;
    const found = allDbTopics.some((tp) => tp.code === topic);
    if (!found) {
      setTopic(null);
      setCustomTopicLabel(null);
      setSubOption(null);
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('topic');
        window.history.replaceState({}, '', url.toString());
      } catch {
        /* ignore */
      }
    }
    // Only run when DB topics finish loading — don't run on every topic change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDbTopics]);

  // Fetch all conversations from DB for the sidebar; re-runs whenever
  // convsRefreshKey is bumped (e.g. after delete or new-session events).
  useEffect(() => {
    const session = getAuthSession();
    if (!session?.token) return;
    setConvsLoading(true);
    fetchConversations(session.token)
      .then(setConversations)
      .catch(() => {})
      .finally(() => setConvsLoading(false));
  }, [convsRefreshKey]);

  // When the page loads with a ?topic= but no ?session= (e.g. navigating from
  // the dashboard), automatically open the most recent DB conversation for that
  // topic so the user lands directly in context. Fires only once per mount.
  useEffect(() => {
    if (hasAutoLoadedRef.current) return;
    if (conversationIdRef.current) return; // already in a DB session
    if (!topic) return;
    if (conversations.length === 0) return; // wait for conversations to load

    hasAutoLoadedRef.current = true;

    const latest = conversations
      .filter((c) => c.topic_code === topic)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];

    if (latest) {
      const url = new URL(window.location.href);
      url.searchParams.set('session', latest.id);
      url.searchParams.set('topic', topic);
      window.location.assign(url.toString());
    }
  }, [conversations, topic]);

  // If a DB conversation_id was supplied via ?session=<uuid>, load its messages
  // from the backend on mount. The conversation is set to read-only view
  // (disconnected) so the user can review then start a new session.
  useEffect(() => {
    const convId = initialState.conversationId;
    if (!convId) return;
    const session = getAuthSession();
    if (!session?.token) return;

    function dbMsgToFrontend(m: MessageWithScoreOut, idx: number): Message {
      const isAgent = m.role === 'assistant';
      const mistakes: Mistake[] | undefined = m.score?.words.length
        ? m.score.words.flatMap((w) => {
            const err = w.error_type;
            const acc = Math.round(w.accuracy_score ?? 0);
            const phonemes = (w.phonemes ?? []).map((p) => ({
              phoneme: p.phoneme,
              accuracy_score: Math.round(p.accuracy_score ?? 0),
            }));
            const lowPhonemes = phonemes.filter((p) => p.accuracy_score < 80);
            const phonemeNote =
              lowPhonemes.length > 0
                ? ` Phonemes: ${lowPhonemes.map((p) => `${p.phoneme} ${p.accuracy_score}%`).join(', ')}`
                : '';
            if (err && err !== 'None') {
              const type = err === 'Mispronunciation' ? 'Pronunciation' : 'Fluency';
              return [
                {
                  wrong: w.word,
                  correct: w.word,
                  type: type as Mistake['type'],
                  note: `Accuracy ${acc}%${phonemeNote}`,
                  phonemes: lowPhonemes.length > 0 ? lowPhonemes : undefined,
                },
              ];
            }
            if (acc < 90 || lowPhonemes.length > 0) {
              return [
                {
                  wrong: w.word,
                  correct: w.word,
                  type: 'Pronunciation' as Mistake['type'],
                  note: `Accuracy ${acc}%${phonemeNote}`,
                  phonemes: lowPhonemes.length > 0 ? lowPhonemes : undefined,
                },
              ];
            }
            return [];
          })
        : undefined;
      return {
        id: idx + 1,
        role: isAgent ? 'agent' : 'user',
        text: m.text_content ?? '',
        timestamp: new Date(m.created_at),
        userAudioUrl: !isAgent ? (m.audio_url ?? undefined) : undefined,
        minioUrl: isAgent ? (m.assistant_audio_url ?? undefined) : undefined,
        assessmentStatus: m.score ? 'available' : 'unavailable',
        scoreDetails: m.score
          ? {
              overall: Math.round(m.score.overall_score ?? 0),
              pronunciation: Math.round(m.score.overall_score ?? 0),
              fluency: Math.round(m.score.fluency_score ?? 0),
              accuracy: Math.round(m.score.accuracy_score ?? 0),
              completeness:
                m.score.completeness_score != null
                  ? Math.round(m.score.completeness_score)
                  : undefined,
            }
          : undefined,
        mistakes,
      };
    }

    fetchMessagesWithScores(session.token, convId)
      .then((dbMessages) => {
        const loaded = dbMessages.map((m, idx) => dbMsgToFrontend(m, idx));
        if (loaded.length > 0) {
          msgCounterRef.current = loaded.length + 101;
          setMessages(loaded);
        }
      })
      .catch(() => {
        /* silently ignore — user can still start fresh */
      });
    // Run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Final unmount cleanup — flush in-flight timers and stream after the
  // session-persistence hook has saved the latest snapshot.
  useEffect(() => {
    return () => {
      clearTimers();
      clearLocalAudioUrls();
      releaseMediaStream();
    };
  }, [clearTimers, clearLocalAudioUrls, releaseMediaStream]);

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  // Load a DB conversation in-place (no full page reload): reset all local
  // state, restore conversationIdRef, update the URL, then fetch messages.
  const loadConversationInPlace = useCallback(
    (convId: string, topicCode: string | null) => {
      const authSession = getAuthSession();
      if (!authSession?.token) return;

      hasAutoLoadedRef.current = true;
      startNewSession({ stayDisconnected: true });
      // startNewSession clears conversationIdRef — restore it immediately.
      conversationIdRef.current = convId;
      if (topicCode) setTopic(topicCode);

      try {
        const url = new URL(window.location.href);
        url.searchParams.set('session', convId);
        if (topicCode) {
          url.searchParams.set('topic', topicCode);
        } else {
          url.searchParams.delete('topic');
        }
        window.history.replaceState({}, '', url.toString());
      } catch {
        /* ignore */
      }

      fetchMessagesWithScores(authSession.token, convId)
        .then((dbMessages) => {
          const loaded = dbMessages.map((m, idx): Message => {
            const isAgent = m.role === 'assistant';
            const mistakes: Mistake[] | undefined = m.score?.words.length
              ? m.score.words.flatMap((w) => {
                  const err = w.error_type;
                  const acc = Math.round(w.accuracy_score ?? 0);
                  const phonemes = (w.phonemes ?? []).map((p) => ({
                    phoneme: p.phoneme,
                    accuracy_score: Math.round(p.accuracy_score ?? 0),
                  }));
                  const lowPhonemes = phonemes.filter((p) => p.accuracy_score < 80);
                  const phonemeNote =
                    lowPhonemes.length > 0
                      ? ` Phonemes: ${lowPhonemes.map((p) => `${p.phoneme} ${p.accuracy_score}%`).join(', ')}`
                      : '';
                  if (err && err !== 'None') {
                    const type = err === 'Mispronunciation' ? 'Pronunciation' : 'Fluency';
                    return [
                      {
                        wrong: w.word,
                        correct: w.word,
                        type: type as Mistake['type'],
                        note: `Accuracy ${acc}%${phonemeNote}`,
                        phonemes: lowPhonemes.length > 0 ? lowPhonemes : undefined,
                      },
                    ];
                  }
                  if (acc < 90 || lowPhonemes.length > 0) {
                    return [
                      {
                        wrong: w.word,
                        correct: w.word,
                        type: 'Pronunciation' as Mistake['type'],
                        note: `Accuracy ${acc}%${phonemeNote}`,
                        phonemes: lowPhonemes.length > 0 ? lowPhonemes : undefined,
                      },
                    ];
                  }
                  return [];
                })
              : undefined;
            return {
              id: idx + 1,
              role: isAgent ? 'agent' : 'user',
              text: m.text_content ?? '',
              timestamp: new Date(m.created_at),
              userAudioUrl: !isAgent ? (m.audio_url ?? undefined) : undefined,
              minioUrl: isAgent ? (m.assistant_audio_url ?? undefined) : undefined,
              assessmentStatus: m.score ? 'available' : 'unavailable',
              scoreDetails: m.score
                ? {
                    overall: Math.round(m.score.overall_score ?? 0),
                    pronunciation: Math.round(m.score.overall_score ?? 0),
                    fluency: Math.round(m.score.fluency_score ?? 0),
                    accuracy: Math.round(m.score.accuracy_score ?? 0),
                    completeness:
                      m.score.completeness_score != null
                        ? Math.round(m.score.completeness_score)
                        : undefined,
                  }
                : undefined,
              mistakes,
            };
          });
          if (loaded.length > 0) {
            msgCounterRef.current = loaded.length + 101;
            setMessages(loaded);
          }
        })
        .catch(() => {
          /* silently ignore — user can still start fresh */
        });
    },
    [startNewSession, setTopic, setMessages],
  );

  const handleTopicSelect = useCallback(
    (code: string) => {
      setCustomTopicLabel(null);
      setSubOption(null);

      // Find the most recently created conversation for this topic
      const latest = conversations
        .filter((c) => c.topic_code === code)
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];

      if (latest) {
        loadConversationInPlace(latest.id, code);
      } else {
        // No existing conversation — show blank new chat for this topic
        hasAutoLoadedRef.current = false;
        startNewSession({ stayDisconnected: true });
        setTopic(code);
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('topic', code);
          url.searchParams.delete('session');
          window.history.replaceState({}, '', url.toString());
        } catch {
          /* ignore */
        }
      }
    },
    [conversations, loadConversationInPlace, startNewSession, setTopic],
  );

  const handleLogout = useCallback(() => {
    setShowLogoutConfirm(false);
    clearAuthSession();
    setCurrentUser(null);
    if (onLogout) onLogout();
    navigate('/', { replace: true });
  }, [navigate, onLogout]);

  const handleSendChat = useCallback(() => {
    if (chatInput.trim() && !agentTyping) sendChatMessage(chatInput);
  }, [agentTyping, chatInput, sendChatMessage]);

  return (
    <div
      data-va="root"
      className={`h-screen overflow-hidden bg-[#f5f7fa] text-gray-800 flex flex-col${isDark ? ' va-dark' : ''}`}
    >
      <VoiceAgentHeader
        isDark={isDark}
        toggleDark={toggleDark}
        currentUser={currentUser}
        showUserMenu={showUserMenu}
        onToggleUserMenu={() => setShowUserMenu((v) => !v)}
        onCloseUserMenu={() => setShowUserMenu(false)}
        onRequestLogout={() => {
          setShowUserMenu(false);
          setShowLogoutConfirm(true);
        }}
        onNavigateDashboard={() => navigate('/dashboard')}
        onNavigateSignIn={() => navigate('/')}
        onNavigateSignUp={() => navigate('/register')}
        onToggleSidebar={() => setShowSidebar((v) => !v)}
      />

      {/* Description bar */}
      <div
        data-va="descbar"
        className="flex items-center justify-between px-4 py-1.5 border-b border-gray-200 bg-[#f5f7fa]/80 text-xs text-gray-500"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-700">{t('va.descbar.label')}</span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-700">
            {customTopicLabel ??
              (topic
                ? (allDbTopics.find((tp) => tp.code === topic)?.title ?? topic)
                : 'Daily Conversation')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="button-mobile-panel"
            onClick={() => setShowLeftPanelMobile((v) => !v)}
            title={t('va.left.aiFeedback')}
            aria-label={t('va.left.aiFeedback')}
            className="md:hidden p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-700 hover:text-gray-400"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
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

      {/* Body row: persistent sidebar + main content */}
      <div className="flex flex-1 overflow-hidden relative">

      {/* ChatGPT-style persistent sidebar */}
      <ConversationSidebar
        open={showSidebar}
        onClose={() => setShowSidebar(false)}
        token={getAuthSession()?.token ?? null}
        topicCategories={topicCategories}
        conversations={conversations}
        loading={convsLoading || topicsLoading}
        activeConversationId={conversationIdRef.current}
        currentTopicCode={topic}
        onSelectTopic={handleTopicSelect}
        onSelectConversation={(id, topicCode) => {
          if (isConnected) persistSession();
          setShowSidebar(false);
          loadConversationInPlace(id, topicCode ?? null);
        }}
        onNewChat={(topicCode) => {
          if (isConnected) persistSession();
          hasAutoLoadedRef.current = true;
          setTopic(topicCode);
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('topic', topicCode);
            url.searchParams.delete('session');
            window.history.replaceState({}, '', url.toString());
          } catch {
            /* ignore */
          }
          startNewSession({ stayDisconnected: true });
          setConvsRefreshKey((k) => k + 1);
        }}
        onConversationDeleted={(id) => {
          setConversations((prev) => prev.filter((c) => c.id !== id));
        }}
        onToggleSidebar={() => setShowSidebar((v) => !v)}
      />

      {/* Main content */}
      <div data-va="content" className="flex flex-1 overflow-hidden relative">
        {/* Left panel: Audio & Video — drawer on mobile, persistent on md+ */}
        {showLeftPanelMobile && (
          <div
            className="md:hidden fixed inset-0 z-7000 bg-black/40"
            onClick={() => setShowLeftPanelMobile(false)}
          />
        )}
        <div
          data-va="left"
          className={`${
            showLeftPanelMobile ? 'fixed left-0 top-0 bottom-0 z-7001 w-72 shadow-2xl' : 'hidden'
          } md:relative md:z-auto md:w-[320px] md:flex md:shadow-none shrink-0 border-r border-gray-200 flex-col bg-white overflow-visible`}
        >
          <LeftAudioPanel
            gender={gender}
            onChangeGender={setGender}
            agentSpeaking={agentSpeaking}
            isConnected={isConnected}
            isConnecting={isConnecting}
            micDevices={micDevices}
            selectedMicId={selectedMicId}
            onSelectMic={setSelectedMicId}
            isRecording={isRecording}
            micEnabled={micEnabled}
            isSpeaking={isSpeaking}
            currentUser={currentUser}
          />

          <AiFeedbackPanel
            displayMsg={displayMsg}
            selectedMsg={selectedMsg}
            isAutoLatest={isAutoLatest}
            isConnected={isConnected}
            onShowLatest={() => setExpandedMsgId(null)}
            onPlayAudio={(id) => void playMessageAudio(id)}
          />

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
              <SelectDropdown value={language} options={LANGUAGES} onChange={setLanguage} />
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
              <SessionSummaryModal
                summary={sessionSummary}
                onDismiss={() => setSummaryDismissed(true)}
                onViewDashboard={() => {
                  persistSession();
                  navigate('/dashboard', {
                    state: { highlightSessionId: sessionIdRef.current },
                  });
                }}
                onNewSession={() => {
                  setSummaryDismissed(true);
                  startNewSession();
                }}
              />
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

            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const canReplay = msg.role === 'agent' || Boolean(msg.userAudioUrl);
              const expandable = isUser && !msg.typing;
              const replay = canReplay ? () => void playMessageAudio(msg.id) : undefined;

              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onReplay={replay}
                  expandable={expandable}
                  expanded={expandedMsgId === msg.id}
                  onToggleExpanded={
                    expandable
                      ? () => setExpandedMsgId((prev) => (prev === msg.id ? null : msg.id))
                      : undefined
                  }
                />
              );
            })}

            <div ref={chatBottomRef} />
          </div>

          <ChatInputBar
            inputRef={inputRef}
            isConnected={isConnected}
            isRecording={isRecording}
            isSpeaking={isSpeaking}
            micEnabled={micEnabled}
            agentTyping={agentTyping}
            chatInput={chatInput}
            onToggleMic={toggleMic}
            onChangeInput={setChatInput}
            onKeyDown={handleKeyDown}
            onSend={handleSendChat}
          />
        </div>
      </div>

      </div>{/* end body row */}

      {showHistory && (
        <HistorySidebar
          open={showHistory}
          onClose={() => setShowHistory(false)}
          token={getAuthSession()?.token ?? null}
          onSelectSession={(id) => {
            const url = new URL(window.location.href);
            url.searchParams.set('session', id);
            url.searchParams.delete('topic');
            window.location.assign(url.toString());
          }}
        />
      )}

      {showLogoutConfirm && (
        <LogoutConfirmModal onCancel={() => setShowLogoutConfirm(false)} onConfirm={handleLogout} />
      )}
    </div>
  );
}
