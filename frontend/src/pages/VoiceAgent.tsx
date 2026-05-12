import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent,
} from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Circle, Mic, Sparkles } from 'lucide-react';
import { toast } from 'sonner';



import { useAuth } from '../auth/AuthContext';
import { getAuthSession } from '../auth/tokenStorage';
import { fetchGrammarFeedback, assessPronunciation } from '../api/chat';
import { fetchForTopic, fetchMessagesWithScores } from '../api/conversations';
import type { MessageWithScoreOut, ConversationSummary } from '../api/conversations';
import {
  AiFeedbackPanel,
  ConversationSidebar,
  LeftAudioPanel,
  LogoutConfirmModal,
  MessageBubble,
  SessionSummaryModal,
} from '../components/voice-agent';
import VoiceRecorderComponent from '../components/voice-agent/VoiceRecorderComponent';
import type { Message, Mistake, SessionSummary } from '../components/voice-agent';
import {
  type Accent,
  type AuthUser,
  type ConnectionStatus,
  type Gender,
  type Language,
} from '../components/voice-agent/constants';
import { useTopics } from '../hooks/useTopics';
import { getInitialSessionState } from '../components/voice-agent/sessionRestore';
import { useLanguage } from '../i18n/useLanguage';
import useAgentAudio from '../hooks/useAgentAudio';
import useMicDevices from '../hooks/useMicDevices';
import useSendChatMessage from '../hooks/useSendChatMessage';
import useSessionPersistence from '../hooks/useSessionPersistence';
import { useDarkMode } from '../theme/useDarkMode';
import useAudioCapture from '@/hooks/useAudioCapture';

interface VoiceAgentProps {
  currentUser?: AuthUser | null;
  onLogout?: () => void;
}

function areMistakesEqual(a: Mistake[], b: Mistake[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.wrong !== y.wrong ||
      x.correct !== y.correct ||
      x.type !== y.type ||
      (x.note ?? '') !== (y.note ?? '')
    ) {
      return false;
    }
    const xp = x.phonemes ?? [];
    const yp = y.phonemes ?? [];
    if (xp.length !== yp.length) return false;
    for (let j = 0; j < xp.length; j++) {
      if (xp[j].phoneme !== yp[j].phoneme || xp[j].accuracy_score !== yp[j].accuracy_score) {
        return false;
      }
    }
  }
  return true;
}

function mapDbMessageToFrontend(m: MessageWithScoreOut, idx: number): Message {
  const isAgent = m.role === 'assistant';
  const mistakes: Mistake[] | undefined =
    m.score?.words && m.score.words.length
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
    backendMessageId: m.id,
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
          m.score.completeness_score != null ? Math.round(m.score.completeness_score) : undefined,
      }
      : undefined,
    mistakes,
  };
}

export default function VoiceAgent({ currentUser: initialUser = null, onLogout }: VoiceAgentProps) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useOutletContext<{
    sidebarOpen: boolean;
    setSidebarOpen: (v: boolean) => void;
    toggleSidebar: () => void;
  }>();
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const [isDark] = useDarkMode();
  const { isAuthenticated, logout } = useAuth();

  const [currentUser] = useState<AuthUser | null>(() => {
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
  const [gender, setGender] = useState<Gender>('Male');
  const [accent, setAccent] = useState<Accent>('US');
  const [language] = useState<Language>('English');

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


  const { micDevices, selectedMicId, selectedMicIdRef, setSelectedMicId, refreshMicDevicesRef } =
    useMicDevices();

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';
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
  const [grammarErrors, setGrammarErrors] = useState<Mistake[]>([]);
  const [grammarCorrectedSentence, setGrammarCorrectedSentence] = useState('');
  const [isGrammarLoading, setIsGrammarLoading] = useState(false);

  const [showLeftPanelMobile, setShowLeftPanelMobile] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isTopicLimitReached, setIsTopicLimitReached] = useState(false);
  const [convsLoading, setConvsLoading] = useState(false);
  // True while fetching message history for an existing conversation (soft load,
  // no full page reload). Drives the inline spinner inside the messages area.
  const [historyLoading, setHistoryLoading] = useState(false);
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
  const grammarSyncReqRef = useRef(0);
  const grammarAbortRef = useRef<AbortController | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  // True while the user is replaying a stored message — suppresses the
  // "your turn to speak" toast that would otherwise fire when agentSpeaking
  // flips false (same transition as a real new agent reply).
  const isReplayingRef = useRef(false);
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

  // No-op stubs — VoiceRecorderComponent manages its own mic lifecycle now.
  const noopSetMicEnabled = useCallback((_: boolean) => { }, []);
  const noopUserMicIntentRef = useRef(false);
  const { mediaStreamRef, startUserAudioCapture, stopUserAudioCapture, releaseMediaStream } =
    useAudioCapture(selectedMicIdRef);

  const {
    ttsActiveRef,
    localAudioUrlsRef,
    audioBlobsRef,
    playAgentAudio,
    playMessageAudio,
    trimLocalAudioUrls,
    clearLocalAudioUrls,
    stopAllAudio,
  } = useAgentAudio({
    setMicEnabled: noopSetMicEnabled,
    setAgentSpeaking,
    languageRef,
    genderRef,
    userMicIntentRef: noopUserMicIntentRef,
    messagesRef,
    timersRef,
  });

  // Global keyboard shortcuts:
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
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showLogoutConfirm, showUserMenu]);

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

  const category = new URLSearchParams(window.location.search).get('categories');

  const { sendChatMessage } = useSendChatMessage({
    messages,
    topic,
    category,
    subOption,
    gender,
    accent,
    language,
    agentTyping,
    conversationIdRef,
    msgCounterRef,
    timersRef,
    localAudioUrlsRef,
    audioBlobsRef,
    inputRef,
    trimLocalAudioUrls,
    playAgentAudio,
    setMessages,
    setGrammarErrors,
    setGrammarCorrectedSentence,
    setIsGrammarLoading,
    setExpandedMsgId,
    setChatInput,
    setAgentTyping,
    setAgentSpeaking,
    setMicEnabled: noopSetMicEnabled,
  });

  const handleReplayMessage = useCallback(
    (id: number) => {
      isReplayingRef.current = true;
      void playMessageAudio(id);
    },
    [playMessageAudio],
  );

  // Toast notification when it's the user's turn to speak (after agent finishes talking).
  // Suppressed when agentSpeaking flips false due to a replay — not a new response.
  useEffect(() => {
    if (agentSpeaking) return;
    if (isReplayingRef.current) {
      isReplayingRef.current = false;
      return;
    }
    if (isConnected && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'agent' && !agentTyping) {
        toast.info(t('va.toast.yourTurn'), {
          position: 'top-center',
          duration: 2500,
        });
      }
    }
  }, [agentSpeaking, isConnected, messages, t, agentTyping]);

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
    conversationIdRef,
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
      setGrammarErrors([]);
      setGrammarCorrectedSentence('');
      setIsGrammarLoading(false);
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
      stopAllAudio();
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
        if (isTopicLimitReached) {
          toast.error(t('va.sidebar.limitReached'));
          return;
        }
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
    isTopicLimitReached,
    persistSession,
    setConvsRefreshKey,
    setStatusSync,
    t,
    topic,
    ttsActiveRef,
    stopAllAudio,
  ]);

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
  }, [allDbTopics, topic]);

  // Fetch topic conversations from DB for the sidebar; re-runs whenever
  // convsRefreshKey is bumped or selected topic changes.
  useEffect(() => {
    const session = getAuthSession();
    if (!session?.token) return;
    if (!topic) {
      setConversations([]);
      setIsTopicLimitReached(false);
      return;
    }

    setConvsLoading(true);
    fetchForTopic(session.token, topic)
      .then((data) => {
        setConversations(
          data.conversations.map((c) => ({
            id: c.id,
            title: c.title,
            status: c.status,
            started_at: c.started_at,
            ended_at: null,
            topic_id: null,
            topic_code: data.topic_code,
            cleared_at: null,
          })),
        );
        setIsTopicLimitReached(Boolean(data.limit_reached));
      })
      .catch(() => { })
      .finally(() => setConvsLoading(false));
  }, [convsRefreshKey, topic]);

  // If a DB conversation_id was supplied via ?session=<uuid>, load its messages
  // from the backend on mount. The conversation is set to read-only view
  // (disconnected) so the user can review then start a new session.
  useEffect(() => {
    const convId = initialState.conversationId;
    if (!convId) return;
    const session = getAuthSession();
    if (!session?.token) return;

    fetchMessagesWithScores(session.token, convId)
      .then((dbMessages) => {
        const loaded = dbMessages.map((m, idx) => mapDbMessageToFrontend(m, idx));
        if (loaded.length > 0) {
          msgCounterRef.current = loaded.length + 101;
          setMessages(loaded);
        }
      })
      .catch(() => {
        /* silently ignore — user can still start fresh */
      });
    // Run only once on mount
  }, [initialState.conversationId]);

  // Final unmount cleanup — flush in-flight timers and stream after the
  // session-persistence hook has saved the latest snapshot.
  useEffect(() => {
    return () => {
      clearTimers();
      clearLocalAudioUrls();
    };
  }, [clearTimers, clearLocalAudioUrls]);


  // Load a DB conversation in-place (no full page reload): reset all local
  // state, restore conversationIdRef, update the URL, then fetch messages.
  const loadConversationInPlace = useCallback(
    (convId: string, topicCode: string | null) => {
      const authSession = getAuthSession();
      if (!authSession?.token) return;

      hasAutoLoadedRef.current = true;
      stopAllAudio();
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

      setHistoryLoading(true);
      fetchMessagesWithScores(authSession.token, convId)
        .then((dbMessages) => {
          const loaded = dbMessages.map((m, idx): Message => mapDbMessageToFrontend(m, idx));
          if (loaded.length > 0) {
            msgCounterRef.current = loaded.length + 101;
            setMessages(loaded);
          }
        })
        .catch(() => {
          /* silently ignore — user can still start fresh */
        })
        .finally(() => setHistoryLoading(false));
    },
    [startNewSession, setTopic, setMessages, stopAllAudio],
  );

  // When the page loads with a ?topic= but no ?session= (e.g. navigating from
  // the dashboard), automatically open the most recent DB conversation for that
  // topic so the user lands directly in context. Fires only once per mount.
  useEffect(() => {
    // 1. If we've already performed an auto-load for this session/topic switch,
    // or if we are already in an active session, don't do anything.
    if (convsLoading || hasAutoLoadedRef.current) return;
    if (conversationIdRef.current) return;

    // 2. We need a topic and we must wait for the conversations list to finish loading.
    if (!topic || convsLoading || conversations.length === 0) return;

    // 3. Filter conversations to ensure they belong to the current topic.
    // This is crucial because 'conversations' might still hold data from the previous topic
    // for a few frames during the transition.
    const topicConvs = conversations.filter((c) => c.topic_code === topic);
    if (topicConvs.length === 0) return;

    // 4. Find the most recent conversation.
    const sorted = [...topicConvs].sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    );
    const latest = sorted[0];

    if (latest) {
      // 5. Mark as auto-loaded and trigger the load.
      hasAutoLoadedRef.current = true;
      loadConversationInPlace(latest.id, topic);
    }
  }, [conversations, topic, convsLoading, loadConversationInPlace]);

  const handleTopicSelect = useCallback(
    (code: string) => {
      if (code === topic) return; // Already on this topic

      setCustomTopicLabel(null);
      setSubOption(null);

      // Clear stale conversations so the sidebar and auto-load logic don't see old data.
      setConversations([]);
      // Reset auto-load flag so the useEffect can pick up the latest for the NEW topic.
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
    },
    [topic, setTopic, startNewSession],
  );

  // Keep grammar feedback bound to the currently selected sentence.
  // On sentence change: use local grammar mistakes immediately, then refresh
  // from Grammar API via message_id to stay accurate with DB-stored data.
  useEffect(() => {
    grammarAbortRef.current?.abort();

    if (!displayMsg || displayMsg.role !== 'user') {
      setIsGrammarLoading(false);
      return;
    }

    // Skip network fetch if grammar was already loaded for this message
    if (displayMsg.grammarChecked) {
      const cached = displayMsg.mistakes?.filter((m) => m.type === 'Grammar') ?? [];
      setGrammarErrors(cached);
      setIsGrammarLoading(false);
      return;
    }

    const localGrammar = (displayMsg.mistakes ?? []).filter((m) => m.type === 'Grammar');
    if (localGrammar.length > 0) {
      setGrammarErrors(localGrammar);
    }

    const backendId = displayMsg.backendMessageId;
    const session = getAuthSession();
    if (!backendId || !session?.token) {
      setIsGrammarLoading(false);
      return;
    }

    const controller = new AbortController();
    grammarAbortRef.current = controller;
    const reqId = ++grammarSyncReqRef.current;
    setIsGrammarLoading(true);
    void fetchGrammarFeedback(session.token, backendId, controller.signal)
      .then((data) => {
        if (reqId !== grammarSyncReqRef.current) return;

        const mapped = (data.errors ?? []).map((item) => ({
          wrong: (item.original ?? item.original_text ?? item.wrong ?? '—').trim() || '—',
          correct: (item.corrected ?? item.corrected_text ?? item.correct ?? '—').trim() || '—',
          type: 'Grammar' as const,
          note: (item.explanation ?? item.note ?? '').trim() || undefined,
        }));

        setGrammarErrors((prev) => (areMistakesEqual(prev, mapped) ? prev : mapped));
        setGrammarCorrectedSentence((prev) =>
          prev === (data.corrected_sentence ?? '') ? prev : (data.corrected_sentence ?? ''),
        );

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== displayMsg.id) return msg;
            const nonGrammar = (msg.mistakes ?? []).filter((m) => m.type !== 'Grammar');
            const nextMistakes = [...nonGrammar, ...mapped];
            const currentMistakes = msg.mistakes ?? [];
            if (areMistakesEqual(currentMistakes, nextMistakes)) {
              return msg;
            }
            return {
              ...msg,
              mistakes: nextMistakes,
            };
          }),
        );
      })
      .catch((err) => {
        if (reqId !== grammarSyncReqRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Keep the currently shown grammar results to avoid flicker.
      })
      .finally(() => {
        if (reqId !== grammarSyncReqRef.current) return;
        setIsGrammarLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [displayMsg, setMessages]);

  const handleLogout = useCallback(() => {
    setShowLogoutConfirm(false);
    if (onLogout) onLogout();
    logout();
  }, [logout, onLogout]);

  const handleSendChat = useCallback(() => {
    if (chatInput.trim() && !agentTyping) sendChatMessage(chatInput);
  }, [agentTyping, chatInput, sendChatMessage]);

  const onSendRecording = useCallback(
    (blob: Blob) => {
      void sendChatMessage('', blob);
    },
    [sendChatMessage],
  );

  return (
    <div
      data-va="root"
      className={`h-full overflow-hidden bg-[#f5f7fa] text-gray-800 flex flex-col${isDark ? ' va-dark' : ''}`}
    >

      {/* Description bar */}
      {(topic || customTopicLabel) && (
        <div
          data-va="descbar"
          className="flex items-center justify-between px-4 py-1.5 border-b border-gray-200 bg-[#f5f7fa]/80 text-xs text-gray-500"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700">{t('va.descbar.label')}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-700">
              {customTopicLabel ??
                (topic ? (allDbTopics.find((tp) => tp.code === topic)?.title ?? topic) : '')}
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
              className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${isConnected
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
      )}

      {/* Body row: persistent sidebar + main content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ChatGPT-style persistent sidebar */}
        <ConversationSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          token={getAuthSession()?.token ?? null}
          topicCategories={topicCategories}
          conversations={conversations}
          isTopicLimitReached={isTopicLimitReached}
          loading={convsLoading || topicsLoading}
          activeConversationId={conversationIdRef.current}
          currentTopicCode={topic}
          onSelectTopic={handleTopicSelect}
          onSelectConversation={(id, topicCode) => {
            if (isConnected) persistSession();
            setSidebarOpen(false);
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
            setIsTopicLimitReached(false);
          }}
          onToggleSidebar={toggleSidebar}
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
            className={`${showLeftPanelMobile ? 'fixed left-0 top-0 bottom-0 z-7001 w-72 shadow-2xl' : 'hidden'
              } md:relative md:z-auto md:w-[320px] md:flex md:shadow-none shrink-0 border-r border-gray-200 flex-col bg-white overflow-visible`}
          >
            <LeftAudioPanel
              gender={gender}
              onChangeGender={setGender}
              accent={accent}
              onChangeAccent={setAccent}
              agentSpeaking={agentSpeaking}
              isConnected={isConnected}
              isConnecting={isConnecting}
              micDevices={micDevices}
              selectedMicId={selectedMicId}
              onSelectMic={setSelectedMicId}
              currentUser={currentUser}
            />

            <AiFeedbackPanel
              displayMsg={displayMsg}
              selectedMsg={selectedMsg}
              isAutoLatest={isAutoLatest}
              isConnected={isConnected}
              grammarErrors={grammarErrors}
              grammarCorrectedSentence={grammarCorrectedSentence}
              isGrammarLoading={isGrammarLoading}
              isPronunciationLoading={displayMsg?.assessmentStatus === 'pending'}
              onShowLatest={() => setExpandedMsgId(null)}
              onPlayAudio={(id) => handleReplayMessage(id)}
            />

            <div className="h-3" />
          </div>

          {/* Right panel: Conversation transcript */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
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
            </div>

            {/* Messages area */}
            <div
              data-va="messages"
              className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-4 scrollbar-thin"
            >
              {/* Soft loading spinner while fetching existing conversation history */}
              {historyLoading && (
                <div className="h-full flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin" />
                  <p className="text-gray-400 dark:text-slate-500 text-xs">
                    {t('va.history.loading')}
                  </p>
                </div>
              )}

              {/* Conditional empty state / welcome screen */}
              {!historyLoading && status === 'disconnected' && messages.length === 0 && (
                <>
                  {!isAuthenticated ? (
                    /* Welcome Screen for Guests (PLG) */
                    <div className="h-full flex flex-col items-center justify-center text-center gap-6 max-w-md mx-auto animate-in fade-in zoom-in duration-500">
                      <div className="w-24 h-24 rounded-4xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-2xl shadow-gray-200 dark:shadow-black/20 overflow-hidden border border-gray-100 dark:border-slate-700">
                        <img
                          src="/audio-waves.png"
                          alt="Logo"
                          className="w-full h-full object-cover p-4"
                        />
                      </div>
                      <div className="space-y-3">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100 tracking-tight">
                          {t('va.welcome.title')}
                        </h2>
                        <p className="text-gray-500 dark:text-slate-400 text-sm leading-relaxed">
                          {t('va.welcome.subtitle')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Standard Empty State for Logged-in Users */
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                      <div className="w-16 h-16 rounded-2xl bg-gray-50 dark:bg-slate-800/50 flex items-center justify-center mb-4">
                        <Mic className="w-8 h-8 text-gray-300 dark:text-slate-600" />
                      </div>
                      <p className="text-gray-400 dark:text-slate-500 text-sm">
                        {t('va.history.empty')}
                      </p>
                    </div>
                  )}
                </>
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
                    <Sparkles className="w-6 h-6 text-blue-400" />
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
                const replay = canReplay ? () => handleReplayMessage(msg.id) : undefined;

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

            <VoiceRecorderComponent
              inputRef={inputRef}
              isConnected={isConnected}
              agentTyping={agentTyping}
              chatInput={chatInput}
              selectedMicId={selectedMicId}
              onChangeInput={setChatInput}
              onKeyDown={handleKeyDown}
              onSendText={handleSendChat}
              onSendRecording={onSendRecording}
              isAuthenticated={isAuthenticated}
            />
            {!isAuthenticated && (
              <div className="px-4 py-6 border-t border-gray-100 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm">
                <div className="max-w-lg mx-auto flex flex-col items-center gap-4 p-6 bg-linear-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-900 rounded-2xl border border-blue-100/50 dark:border-slate-700/50 shadow-lg shadow-blue-500/5 dark:shadow-black/10 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">
                      {t('va.guest.title')}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {t('va.guest.subtitle')}
                    </p>
                  </div>
                  <div className="flex gap-3 w-full sm:w-auto">
                    <button
                      onClick={() => navigate('/login')}
                      className="flex-1 sm:min-w-28 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-500/10 active:scale-95 whitespace-nowrap"
                    >
                      {t('common.signIn')}
                    </button>
                    <button
                      onClick={() => navigate('/register')}
                      className="flex-1 sm:min-w-28 px-6 py-2 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-slate-700 rounded-lg text-sm font-bold hover:bg-blue-50 dark:hover:bg-slate-700 transition-all active:scale-95 whitespace-nowrap"
                    >
                      {t('common.signUp')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* end body row */}

      {showLogoutConfirm && (
        <LogoutConfirmModal onCancel={() => setShowLogoutConfirm(false)} onConfirm={handleLogout} />
      )}
    </div>
  );
}
