// frontend/src/components/voice-agent/ConversationSidebar.tsx
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ArrowLeft, MessageSquarePlus, Trash2, X } from 'lucide-react';
import { TOPIC_CATEGORIES } from '../../constants/topics';
import { fetchForTopic, type ForTopicResponse } from '../../api/conversations';

interface ConversationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
  activeTopic: string | null;
  activeConversationId: string | null;
  token: string;
  onSelectConversation: (conversationId: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (conversationId: string) => void;
}

type SidebarView = 'browse' | 'topic-history';

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

export default function ConversationSidebar({
  isOpen,
  onClose,
  isDark,
  activeTopic,
  activeConversationId,
  token,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
}: ConversationSidebarProps) {
  const [view, setView] = useState<SidebarView>('browse');
  const [browseTopic, setBrowseTopic] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTopic) {
      setBrowseTopic(activeTopic);
      setView('topic-history');
    }
  }, [activeTopic]);

  const { data: topicData, isLoading } = useQuery<ForTopicResponse>({
    queryKey: ['for-topic', browseTopic],
    queryFn: () => fetchForTopic(token, browseTopic!),
    enabled: !!browseTopic && !!token,
  });

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
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} />
      )}

      {/* Panel */}
      <div
        className={`fixed md:relative z-40 md:z-auto top-0 left-0 h-full md:h-auto w-72 md:w-64 lg:w-72 flex flex-col border-r shrink-0 transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${base}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-inherit">
          {view === 'topic-history' ? (
            <button
              onClick={() => setView('browse')}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${isDark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <span className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              Topics
            </span>
          )}
          {/* Mobile close */}
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded text-gray-500 hover:text-gray-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
          {view === 'browse' ? (
            /* Browse view: categories accordion */
            <div>
              {TOPIC_CATEGORIES.map(category => {
                const isExpanded = expandedCategory === category.name;
                return (
                  <div key={category.name}>
                    {/* Category header */}
                    <button
                      onClick={() => setExpandedCategory(isExpanded ? null : category.name)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm font-semibold transition-colors ${isDark ? 'text-gray-200 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      <span>{category.name}</span>
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 shrink-0" />
                        : <ChevronRight className="w-4 h-4 shrink-0" />
                      }
                    </button>

                    {/* Topic rows */}
                    {isExpanded && (
                      <div className="ml-2">
                        {category.topics.map(topic => {
                          const isActive = topic.id === activeTopic;
                          return (
                            <button
                              key={topic.id}
                              onClick={() => {
                                setBrowseTopic(topic.id);
                                setView('topic-history');
                              }}
                              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg mx-1 my-0.5 text-sm transition-colors ${isActive ? itemActive : itemBase}`}
                              style={{ width: 'calc(100% - 8px)' }}
                            >
                              <span className="text-base shrink-0">{topic.icon}</span>
                              <span className="truncate text-[13px]">{topic.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Topic-history view */
            <div className="px-2">
              {/* Topic title */}
              {topicData && (
                <div className={`px-2 py-2 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {topicData.topic_title}
                </div>
              )}

              {/* New Chat button */}
              <div className="px-1 pb-2">
                {topicData?.limit_reached ? (
                  <div
                    title="Max 5 sessions reached — delete one first"
                    className="w-full"
                  >
                    <button
                      disabled
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium opacity-50 cursor-not-allowed bg-gray-400 text-white"
                    >
                      <MessageSquarePlus className="w-4 h-4" />
                      New Chat
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={onNewChat}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    New Chat
                  </button>
                )}
              </div>

              {/* Loading state */}
              {isLoading && (
                <p className={`text-xs text-center mt-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  Loading...
                </p>
              )}

              {/* Conversation list */}
              {!isLoading && topicData && topicData.conversations.length === 0 && (
                <div className="text-center mt-6 px-2">
                  <p className={`text-xs mb-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    No history yet — start a new chat.
                  </p>
                  <button
                    onClick={onNewChat}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors mx-auto ${isDark ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    New Chat
                  </button>
                </div>
              )}

              {!isLoading && topicData && topicData.conversations.map(conv => {
                const isActive = conv.id === activeConversationId;
                const isDeleting = deletingId === conv.id;

                return (
                  <div key={conv.id} className="my-0.5">
                    {isDeleting ? (
                      /* Confirm delete row */
                      <div className={`rounded-lg px-3 py-2 mx-1 ${isDark ? 'bg-red-900/30 border border-red-700/40' : 'bg-red-50 border border-red-200'}`}>
                        <p className={`text-xs mb-2 font-medium ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                          Delete this session?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              onDeleteConversation(conv.id);
                              setDeletingId(null);
                            }}
                            className="flex-1 px-2 py-1 rounded text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Normal conversation row */
                      <div
                        className={`flex items-center gap-1 rounded-lg mx-1 transition-colors ${isActive ? itemActive : itemBase}`}
                        style={{ width: 'calc(100% - 8px)' }}
                      >
                        <button
                          onClick={() => {
                            onSelectConversation(conv.id);
                            onClose();
                          }}
                          className="flex-1 text-left px-3 py-2 min-w-0"
                        >
                          <div className="truncate font-medium text-[13px]">
                            {conv.title ?? `Session ${conv.session_number}`}
                          </div>
                          <div className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            {relativeTime(conv.updated_at)}
                          </div>
                        </button>
                        {!isActive && (
                          <button
                            onClick={() => setDeletingId(conv.id)}
                            className={`p-1.5 mr-1 rounded transition-colors shrink-0 ${isDark ? 'text-gray-600 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
                            title="Delete session"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
