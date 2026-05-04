import { MessageSquare, SquarePen, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { deleteConversation, type ConversationSummary } from '../../api/conversations';
import { useT } from '../../i18n/LanguageContext';
import { TOPIC_ID_TO_DB_CODES, type TopicId } from './constants';

const DB_TOPIC_LABELS: Record<string, string> = {
  daily_conversation: 'Daily Conversation',
  ielts_part1: 'IELTS Part 1',
  ielts_part2: 'IELTS Part 2',
  ielts_part3: 'IELTS Part 3',
  academic: 'Academic Discussion',
  travel: 'Travel & Tourism',
  job_interview: 'Job Interview',
  business_meeting: 'Business Meeting',
};

function topicLabel(c: ConversationSummary): string {
  if (c.topic_code) return DB_TOPIC_LABELS[c.topic_code] ?? c.topic_code;
  if (c.title) return c.title;
  return 'Conversation';
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

type Group = 'today' | 'yesterday' | 'week' | 'older';

function getGroup(dateStr: string): Group {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days <= 7) return 'week';
  return 'older';
}

type Props = {
  open: boolean;
  onClose: () => void;
  token: string | null;
  conversations: ConversationSummary[];
  loading: boolean;
  activeConversationId: string | null;
  currentTopicId: TopicId | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onConversationDeleted: (id: string) => void;
};

export default function ConversationSidebar({
  open,
  onClose,
  token,
  conversations,
  loading,
  activeConversationId,
  currentTopicId,
  onSelectConversation,
  onNewChat,
  onConversationDeleted,
}: Props) {
  const t = useT();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const topicDbCodes = currentTopicId ? (TOPIC_ID_TO_DB_CODES[currentTopicId] ?? []) : [];
  const topicCount = topicDbCodes.length
    ? conversations.filter((c) => c.topic_code && topicDbCodes.includes(c.topic_code)).length
    : 0;
  const isTopicLimitReached = topicDbCodes.length > 0 && topicCount >= 5;

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!token) return;
    if (!window.confirm(t('va.sidebar.confirmDelete'))) return;
    setDeletingId(id);
    try {
      await deleteConversation(token, id);
      onConversationDeleted(id);
      toast.success(t('va.sidebar.deleted'));
    } catch {
      toast.error('Could not delete conversation');
    } finally {
      setDeletingId(null);
    }
  };

  const groups: { key: Group; label: string; items: ConversationSummary[] }[] = [
    { key: 'today', label: t('va.sidebar.today'), items: [] },
    { key: 'yesterday', label: t('va.sidebar.yesterday'), items: [] },
    { key: 'week', label: t('va.sidebar.thisWeek'), items: [] },
    { key: 'older', label: t('va.sidebar.older'), items: [] },
  ];
  for (const c of conversations) {
    const g = getGroup(c.started_at);
    groups.find((x) => x.key === g)!.items.push(c);
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-[8000] bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
      )}

      {/* Drawer */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-[8001] flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 shadow-2xl transition-transform duration-250 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100 dark:border-slate-700 shrink-0">
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            disabled={isTopicLimitReached}
            title={t('va.sidebar.newChat')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isTopicLimitReached
                ? 'opacity-40 cursor-not-allowed text-gray-400 dark:text-slate-500'
                : 'text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-600'
            }`}
          >
            <SquarePen className="w-3.5 h-3.5" />
            {t('va.sidebar.newChat')}
          </button>

          <button
            onClick={onClose}
            title="Close"
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Topic limit warning */}
        {isTopicLimitReached && (
          <div className="mx-3 mt-2 px-2 py-1.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
            {t('va.sidebar.limitReached')}
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <span className="text-xs text-gray-400 dark:text-slate-500">Loading…</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <MessageSquare className="w-7 h-7 text-gray-200 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-gray-400 dark:text-slate-500">{t('va.sidebar.empty')}</p>
            </div>
          ) : (
            groups
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.key} className="mb-1">
                  <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">
                    {g.label}
                  </p>
                  {g.items.map((c) => {
                    const isActive = c.id === activeConversationId;
                    const isDeleting = deletingId === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`group relative flex items-center mx-2 rounded-lg cursor-pointer transition-colors px-2 py-2 ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300'
                        }`}
                        onClick={() => {
                          if (!isDeleting) {
                            onSelectConversation(c.id);
                            onClose();
                          }
                        }}
                      >
                        <div className="flex-1 min-w-0 pr-1">
                          <p className="text-xs font-medium truncate leading-tight">
                            {topicLabel(c)}
                          </p>
                          <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                            {relativeTime(c.started_at)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => void handleDelete(e, c.id)}
                          disabled={isDeleting}
                          aria-label={t('va.sidebar.delete')}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-opacity shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))
          )}
        </div>
      </aside>
    </>
  );
}
