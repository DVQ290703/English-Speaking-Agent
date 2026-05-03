import { getSession as getSessionHistory } from '../../api/sessionHistory';
import { DASHBOARD_TO_SUB_OPTION, DASHBOARD_TO_TOPIC_ID, type TopicId } from './constants';
import type { Message } from './MessageBubble';

export interface InitialSessionState {
  messages: Message[];
  sessionId: string | null;
  topic: TopicId | null;
  customTopicLabel: string | null;
  subOption: string | null;
  nextMsgId: number;
}

/**
 * One-shot restore that pulls the active session out of localStorage (when
 * `?session=` is present in the URL) and falls back to topic-driven new
 * sessions seeded from `?topic=` or `sessionStorage.va_selected_topic`.
 *
 * Persisted `blob:` user-audio URLs are dropped because they are invalid
 * after a page reload; in-memory `Blob`s also can't survive a reload.
 */
export function getInitialSessionState(): InitialSessionState {
  const fallback: InitialSessionState = {
    messages: [],
    sessionId: null,
    topic: null,
    customTopicLabel: null,
    subOption: null,
    nextMsgId: 101,
  };

  let messages: Message[] = [];
  let sessionId: string | null = null;
  let restoredTopic: TopicId | null = null;

  try {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');
    if (sid) {
      const saved = getSessionHistory(sid);
      if (saved) {
        messages = ((saved.messages as Message[]) ?? []).map((m) => {
          const ts =
            m.timestamp instanceof Date
              ? m.timestamp
              : new Date(m.timestamp as unknown as string | number);
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
        sessionId = sid;
        restoredTopic = (saved.topicKey as TopicId | null) ?? null;
      }
    }
  } catch {}

  // Compute the next message id counter. Math.max(...spread) returns
  // -Infinity on an empty array and silently ignores non-numeric IDs
  // mapped to 0; reduce keeps things explicit and skips non-finite IDs.
  const maxId = messages.reduce((max, m) => {
    const id = typeof m.id === 'number' ? m.id : Number(m.id);
    return Number.isFinite(id) && id > 0 ? Math.max(max, id) : max;
  }, 100);
  const nextMsgId = maxId + 1;

  let topic: TopicId | null = null;
  let customTopicLabel: string | null = null;
  let subOption: string | null = null;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('session') && restoredTopic) {
      return {
        messages,
        sessionId,
        topic: restoredTopic,
        customTopicLabel: null,
        subOption: null,
        nextMsgId,
      };
    }
    const raw = params.get('topic') || sessionStorage.getItem('va_selected_topic');
    if (raw) {
      sessionStorage.removeItem('va_selected_topic');
      const mappedId = DASHBOARD_TO_TOPIC_ID[raw];
      if (mappedId) {
        topic = mappedId;
        subOption = DASHBOARD_TO_SUB_OPTION[raw] ?? null;
      } else {
        customTopicLabel = raw;
        subOption = raw;
      }
    }
  } catch {
    return { ...fallback, messages, sessionId, nextMsgId };
  }

  return { messages, sessionId, topic, customTopicLabel, subOption, nextMsgId };
}
