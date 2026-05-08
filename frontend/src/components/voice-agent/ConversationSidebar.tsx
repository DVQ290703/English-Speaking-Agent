import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  PanelLeft,
  PanelLeftClose,
  Plus,
  X,
} from 'lucide-react';

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { deleteConversation, type ConversationSummary } from '../../api/conversations';
import type { ApiCategory } from '../../api/topics';
import { useT } from '../../i18n/useLanguage';
import ConfirmModal from '../ui/ConfirmModal';

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

function ConvRow({
  c,
  isActive,
  isDeleting,
  onSelect,
  onDelete,
  deleteLabel,
}: {
  c: ConversationSummary;
  isActive: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  deleteLabel: string;
}) {
  const label = c.title || relativeTime(c.started_at);
  return (
    <div
      className={`group relative flex items-center rounded-lg cursor-pointer transition-colors pl-8 pr-2 py-1.5 mx-1 ${
        isActive
          ? 'bg-gray-200 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100'
          : 'hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-300'
      }`}
      onClick={() => {
        if (!isDeleting) onSelect();
      }}
    >
      <div className="flex-1 min-w-0 pr-1">
        <p className="text-xs truncate leading-tight">{label}</p>
      </div>
      <button
        onClick={onDelete}
        disabled={isDeleting}
        aria-label={deleteLabel}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 transition-opacity shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  token: string | null;
  topicCategories: ApiCategory[];
  conversations: ConversationSummary[];
  isTopicLimitReached: boolean;
  loading: boolean;
  activeConversationId: string | null;
  currentTopicCode: string | null;
  onSelectTopic: (code: string) => void;
  onSelectConversation: (id: string, topicCode: string | null) => void;
  onNewChat: (topicCode: string) => void;
  onConversationDeleted: (id: string) => void;
  onToggleSidebar: () => void;
};

export default function ConversationSidebar({
  open,
  onClose,
  token,
  topicCategories,
  conversations,
  isTopicLimitReached,
  loading,
  activeConversationId,
  currentTopicCode,
  onSelectTopic,
  onSelectConversation,
  onNewChat,
  onConversationDeleted,
  onToggleSidebar,
}: Props) {
  const t = useT();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [activeTopicView, setActiveTopicView] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(topicCategories.map((c) => c.code)),
  );

  const toggleCategory = (code: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  useEffect(() => {
    if (currentTopicCode) {
      setActiveTopicView(currentTopicCode);
    }
  }, [currentTopicCode]);

  const handleTopicClick = (code: string) => {
    onSelectTopic(code);
    setActiveTopicView(code);
  };

  const requestDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConversationToDelete(id);
  };

  const handleDelete = async () => {
    if (!token || !conversationToDelete) return;
    setDeletingId(conversationToDelete);
    try {
      await deleteConversation(token, conversationToDelete);
      onConversationDeleted(conversationToDelete);
      toast.success(t('va.sidebar.deleted'));
    } catch {
      toast.error(t('va.sidebar.deleteFailed'));
    } finally {
      setDeletingId(null);
      setConversationToDelete(null);
    }
  };

  const renderMainMenu = () => (
    <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <span className="text-xs text-gray-400 dark:text-slate-400">Loading…</span>
        </div>
      ) : (
        <>
          {topicCategories.map((cat) => {
            const isCategoryExpanded = expandedCategories.has(cat.code);
            return (
              <div key={cat.code} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.code)}
                  className="w-full flex items-center gap-1 px-3 pt-3 pb-1 text-left group"
                >
                  <span className="flex-1 text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider select-none">
                    {cat.title}
                  </span>
                  {isCategoryExpanded ? (
                    <ChevronDown className="w-3 h-3 text-gray-400 dark:text-slate-500 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-gray-400 dark:text-slate-500 shrink-0" />
                  )}
                </button>
                <div
                  className={`overflow-hidden transition-all duration-200 ease-in-out ${isCategoryExpanded ? 'max-h-250 opacity-100' : 'max-h-0 opacity-0'}`}
                >
                  {cat.topics.map((tp) => {
                    const count = conversations.filter((c) => c.topic_code === tp.code).length;
                    const isActive = currentTopicCode === tp.code;
                    const shouldHighlightLimit = !!(token && isTopicLimitReached && isActive);
                    return (
                      <button
                        key={tp.code}
                        type="button"
                        onClick={() => handleTopicClick(tp.code)}
                        className={`w-full group flex items-center gap-2 px-3 py-2 transition-colors text-left ${
                          isActive
                            ? 'bg-gray-200 dark:bg-slate-700/60 text-gray-900 dark:text-slate-100'
                            : 'hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300'
                        }`}
                      >
                        <MessageSquare className="w-4 h-4 shrink-0 text-gray-400 dark:text-slate-500 group-hover:dark:text-slate-400" />
                        <span className="flex-1 min-w-0 text-xs font-medium truncate">
                          {tp.title}
                        </span>
                        {token && count > 0 && (
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${shouldHighlightLimit ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-gray-200 dark:bg-slate-700/80 text-gray-500 dark:text-slate-400'}`}
                          >
                            {count}/5
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );

  const renderTopicView = (topicCode: string) => {
    const topic = topicCategories.flatMap((c) => c.topics).find((tp) => tp.code === topicCode);
    const topicConvs = conversations
      .filter((c) => c.topic_code === topicCode)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center gap-2 px-2 py-2 shrink-0 border-b border-gray-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTopicView(null)}
            aria-label="Back to topics"
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-gray-800 dark:text-slate-200 truncate">
            {topic?.title ?? topicCode}
          </span>
        </div>

        <div className="px-3 py-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (token && isTopicLimitReached) {
                toast.warning('Session limit reached. Please delete an existing session.');
                return;
              }
              onNewChat(topicCode);
            }}
            aria-disabled={!!(token && isTopicLimitReached)}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              token && isTopicLimitReached
                ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-600 cursor-not-allowed opacity-60'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            {t('va.sidebar.newChat')}
          </button>
        </div>

        {token && isTopicLimitReached && (
          <div className="mx-3 mb-1 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t('va.sidebar.limitWarningAlert')}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
          {!token ? (
            <div className="mx-3 mt-4 p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-gray-100 dark:border-slate-800 flex flex-col items-center gap-3 text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-900 dark:text-slate-100">Sign in to save chat history</p>
                <p className="text-[10px] text-gray-500 dark:text-slate-400 leading-relaxed">Your progress and conversations will be saved across devices.</p>
              </div>
              <button 
                onClick={() => navigate('/login')}
                className="w-full py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-bold hover:bg-blue-700 transition-all active:scale-95"
              >
                Sign in
              </button>
            </div>
          ) : topicConvs.length === 0 ? (
            <p className="px-4 py-3 text-[11px] text-gray-400 dark:text-slate-500 italic">
              {t('va.sidebar.emptyTopic')}
            </p>
          ) : (
            topicConvs.map((c) => (
              <ConvRow
                key={c.id}
                c={c}
                isActive={c.id === activeConversationId}
                isDeleting={deletingId === c.id}
                onSelect={() => {
                  onSelectConversation(c.id, c.topic_code ?? null);
                  onClose();
                }}
                onDelete={(e) => requestDelete(e, c.id)}
                deleteLabel={t('va.sidebar.delete')}
              />
            ))
          )}
        </div>
      </div>
    );
  };

  const bg = 'bg-[#f9f9f9] dark:bg-[#0b1426]';
  const border = 'border-gray-200 dark:border-slate-800';
  const btnCls =
    'p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors';

  return (
    <>
      {open && (
        <div
          className="md:hidden fixed inset-0 z-9998 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside
        className={`
        md:hidden fixed inset-y-0 left-0 z-9999 w-64 shadow-2xl
        flex flex-col ${bg} border-r ${border}
        transition-transform duration-200 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}
      >
        <div className="flex items-center justify-between px-3 py-3 shrink-0">
          <span className="text-sm font-semibold text-gray-800 dark:text-slate-200 select-none">
            {t('brand.name')}
          </span>
          <button type="button" onClick={onToggleSidebar} className={btnCls}>
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
        {activeTopicView ? renderTopicView(activeTopicView) : renderMainMenu()}
      </aside>

      <aside
        className={`
        hidden md:flex flex-col shrink-0 overflow-hidden
        ${bg} border-r ${border}
        transition-all duration-300 ease-in-out
        ${isOpen ? 'w-64' : 'w-12'}
      `}
      >
        <div className={`flex items-center shrink-0 h-12 transition-all duration-300 ${isOpen ? 'justify-between px-3 py-3' : 'justify-center py-3'}`}>
          <span className={`text-sm font-semibold text-gray-800 dark:text-slate-200 select-none whitespace-nowrap overflow-hidden transition-all duration-300 ${isOpen ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0'}`}>
            {t('brand.name')}
          </span>
          <button type="button" onClick={() => setIsOpen((p) => !p)} className={btnCls}>
            <PanelLeft className="w-4 h-4" />
          </button>
        </div>
        <div className={`flex flex-col flex-1 overflow-hidden ${isOpen ? '' : 'hidden'}`}>
          {activeTopicView ? renderTopicView(activeTopicView) : renderMainMenu()}
        </div>
      </aside>

      <ConfirmModal
        isOpen={!!conversationToDelete}
        onClose={() => setConversationToDelete(null)}
        onConfirm={() => void handleDelete()}
        title={t('va.sidebar.confirmDeleteTitle')}
        description={t('va.sidebar.confirmDelete')}
        confirmText={t('va.sidebar.delete')}
        cancelText={t('common.cancel')}
        isDestructive
        isLoading={!!deletingId}
      />
    </>
  );
}
