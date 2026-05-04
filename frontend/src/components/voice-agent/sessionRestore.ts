import { DASHBOARD_TO_SUB_OPTION, DASHBOARD_TO_TOPIC_ID } from './constants';

export interface InitialSessionState {
  messages: never[];
  sessionId: string | null;
  conversationId: string | null;
  topic: string | null;
  customTopicLabel: string | null;
  subOption: string | null;
  nextMsgId: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isDbUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/**
 * One-shot restore that seeds VoiceAgent's initial state from URL params.
 *
 * - `?session=<UUID>` → load an existing DB conversation (messages fetched async)
 * - `?topic=<code>` / `sessionStorage.va_selected_topic` → start a new session
 *   for the given topic
 */
export function getInitialSessionState(): InitialSessionState {
  const fallback: InitialSessionState = {
    messages: [],
    sessionId: null,
    conversationId: null,
    topic: null,
    customTopicLabel: null,
    subOption: null,
    nextMsgId: 101,
  };

  try {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');

    if (sid && isDbUuid(sid)) {
      const topicParam = params.get('topic');
      return {
        messages: [],
        sessionId: null,
        conversationId: sid,
        topic: topicParam && !topicParam.includes(' ') ? topicParam : null,
        customTopicLabel: null,
        subOption: null,
        nextMsgId: 101,
      };
    }

    const raw = params.get('topic') || sessionStorage.getItem('va_selected_topic');
    if (raw) {
      sessionStorage.removeItem('va_selected_topic');
      let topic: string | null = null;
      let subOption: string | null = null;
      if (raw.includes(' ')) {
        const mappedId = DASHBOARD_TO_TOPIC_ID[raw];
        if (mappedId) {
          topic = mappedId;
          subOption = DASHBOARD_TO_SUB_OPTION[raw] ?? null;
        }
      } else {
        topic = raw;
        subOption = DASHBOARD_TO_SUB_OPTION[raw] ?? null;
      }
      return { messages: [], sessionId: null, conversationId: null, topic, customTopicLabel: null, subOption, nextMsgId: 101 };
    }
  } catch {
    /* ignore */
  }

  return fallback;
}
