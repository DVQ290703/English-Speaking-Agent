// frontend/src/components/voice-agent/ConversationSidebar.tsx
import { MessageSquarePlus, X } from 'lucide-react';
import { useT } from '../../i18n/LanguageContext';
import type { ConversationSummary } from '../../api/conversations';
import { TOPICS_FLAT } from '../../constants/topics';

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onNewChat: () => void;
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
}

type DateBucket = 'Today' | 'Yesterday' | 'This Week' | 'Older';

function getBucket(dateStr: string): DateBucket {
  const d = new Date(dateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const weekStart = new Date(todayStart.getTime() - 6 * 86_400_000);
  if (d >= todayStart) return 'Today';
  if (d >= yesterdayStart) return 'Yesterday';
  if (d >= weekStart) return 'This Week';
  return 'Older';
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function topicTitle(topicCode: string | null): string {
  if (!topicCode) return 'General Chat';
  const found = TOPICS_FLAT.find(t => t.id === topicCode);
  return found?.label ?? topicCode;
}

export default function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelect,
  onNewChat,
  isOpen,
  onClose,
  isDark,
}: ConversationSidebarProps) {
  const t = useT();

  const grouped = conversations.reduce<Record<DateBucket, ConversationSummary[]>>(
    (acc, conv) => {
      const bucket = getBucket(conv.started_at);
      acc[bucket].push(conv);
      return acc;
    },
    { Today: [], Yesterday: [], 'This Week': [], Older: [] }
  );

  const buckets: DateBucket[] = ['Today', 'Yesterday', 'This Week', 'Older'];

  const bucketLabel: Record<DateBucket, string> = {
    Today: t('va.sidebar.today'),
    Yesterday: t('va.sidebar.yesterday'),
    'This Week': t('va.sidebar.thisWeek'),
    Older: t('va.sidebar.older'),
  };

  const base = isDark
    ? 'bg-gray-900 border-gray-700 text-gray-100'
    : 'bg-[#f5f7fa] border-gray-200 text-gray-900';

  const itemBase = isDark
    ? 'hover:bg-gray-800 text-gray-300'
    : 'hover:bg-gray-100 text-gray-700';

  const itemActive = isDark
    ? 'bg-blue-900/50 text-blue-300 border border-blue-700/50'
    : 'bg-blue-50 text-blue-700 border border-blue-200';

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={`
          fixed md:relative z-40 md:z-auto
          top-0 left-0 h-full md:h-auto
          w-72 md:w-64 lg:w-72
          flex flex-col border-r shrink-0
          transition-transform duration-200
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${base}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-inherit">
          <button
            onClick={onNewChat}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${isDark ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
          >
            <MessageSquarePlus className="w-4 h-4" />
            {t('va.sidebar.newChat')}
          </button>
          {/* Mobile close */}
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded text-gray-500 hover:text-gray-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
          {conversations.length === 0 && (
            <p className={`text-xs text-center mt-8 px-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {t('va.sidebar.noHistory')}
            </p>
          )}

          {buckets.map(bucket => {
            const items = grouped[bucket];
            if (items.length === 0) return null;
            return (
              <div key={bucket} className="mb-2">
                <div className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  {bucketLabel[bucket]}
                </div>
                {items.map(conv => {
                  const isActive = conv.id === activeConversationId;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => onSelect(conv.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg mx-1 my-0.5 transition-colors text-sm ${isActive ? itemActive : itemBase}`}
                      style={{ width: 'calc(100% - 8px)' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            conv.status === 'active' ? 'bg-green-400' : 'bg-gray-400'
                          }`}
                        />
                        <span className="truncate font-medium text-[13px]">
                          {topicTitle(conv.topic_code)}
                        </span>
                      </div>
                      <div className={`text-[10px] mt-0.5 pl-3.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        {relativeTime(conv.started_at)}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
