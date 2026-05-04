import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  deleteConversation,
  fetchConversations,
  type ConversationSummary,
} from '../../api/conversations';
import { useT } from '../../i18n/useLanguage';

const TOPIC_LABELS: Record<string, string> = {
  ielts_part1: 'IELTS Part 1',
  ielts_part2: 'IELTS Part 2',
  ielts_part3: 'IELTS Part 3',
  daily_conversation: 'Daily Conversation',
  job_interview: 'Job Interview',
  academic: 'Academic',
  travel: 'Travel',
  business: 'Business',
};

function topicLabel(c: ConversationSummary): string {
  if (c.topic_code) return TOPIC_LABELS[c.topic_code] ?? c.topic_code;
  if (c.title) return c.title;
  return 'Conversation';
}

type Props = {
  open: boolean;
  onClose: () => void;
  onSelectSession: (id: string) => void;
  token?: string | null;
  refreshKey?: number;
};

export default function HistorySidebar({
  open,
  onClose,
  onSelectSession,
  token,
  refreshKey = 0,
}: Props) {
  const t = useT();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!open || !token) return;
    fetchedRef.current = false;
  }, [open, token, refreshKey]);

  useEffect(() => {
    if (!open || !token || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    fetchConversations(token)
      .then((data) => setConversations(data))
      .catch(() => toast.error('Could not load history'))
      .finally(() => setLoading(false));
  }, [open, token, refreshKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleDelete = (id: string) => {
    if (!token) return;
    if (typeof window !== 'undefined' && !window.confirm(t('va.history.confirmDelete'))) return;
    deleteConversation(token, id)
      .then(() => {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        toast.success(t('va.history.deleted'));
      })
      .catch(() => toast.error('Could not delete conversation'));
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[8000] bg-black/40 backdrop-blur-sm transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-[8001] w-80 max-w-[88vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 shadow-2xl transform transition-transform duration-200 flex flex-col ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {t('va.history.title')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('va.history.count', { n: conversations.length })}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('va.history.close')}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm text-slate-400 dark:text-slate-500">Loading…</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center px-4 py-12">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('va.history.empty')}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {conversations.map((c) => {
                const date = (() => {
                  try {
                    return new Date(c.started_at).toLocaleString();
                  } catch {
                    return c.started_at;
                  }
                })();
                return (
                  <li
                    key={c.id}
                    className="group rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/60 bg-white dark:bg-slate-800/50 hover:bg-blue-50/50 dark:hover:bg-slate-800 transition-colors p-3"
                  >
                    <button
                      onClick={() => {
                        onSelectSession(c.id);
                        onClose();
                      }}
                      className="text-left w-full"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {topicLabel(c)}
                        </p>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            c.status === 'active'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{date}</p>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(c.id);
                      }}
                      aria-label={t('va.history.delete')}
                      className="mt-2 text-[11px] font-semibold text-red-500 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 rounded"
                    >
                      {t('va.history.delete')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
