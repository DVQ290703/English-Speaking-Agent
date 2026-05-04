import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { deleteSession, formatDuration, getSessions } from '../../api/sessionHistory';
import { useT } from '../../i18n/LanguageContext';

type SessionEntry = {
  id: string;
  date: string;
  topic: string;
  avgScore: number;
  sentenceCount: number;
  durationMs: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelectSession: (id: string) => void;
  refreshKey?: number;
};

export default function HistorySidebar({ open, onClose, onSelectSession, refreshKey = 0 }: Props) {
  const t = useT();
  const [tick, setTick] = useState(0);
  const sessions: SessionEntry[] = useMemo(
    () =>
      (getSessions() as SessionEntry[]).map((s) => ({
        id: s.id,
        date: s.date,
        topic: s.topic ?? 'Conversation',
        avgScore: s.avgScore ?? 0,
        sentenceCount: s.sentenceCount ?? 0,
        durationMs: s.durationMs ?? 0,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, refreshKey, open],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleDelete = (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm(t('va.history.confirmDelete'))) return;
    deleteSession(id);
    setTick((n) => n + 1);
    toast.success(t('va.history.deleted'));
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
              {t('va.history.count', { n: sessions.length })}
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
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center px-4 py-12">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('va.history.empty')}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => {
                const date = (() => {
                  try {
                    return new Date(s.date).toLocaleString();
                  } catch {
                    return s.date;
                  }
                })();
                const band = (s.avgScore / 11.11).toFixed(1);
                return (
                  <li
                    key={s.id}
                    className="group rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500/60 bg-white dark:bg-slate-800/50 hover:bg-blue-50/50 dark:hover:bg-slate-800 transition-colors p-3"
                  >
                    <button
                      onClick={() => {
                        onSelectSession(s.id);
                        onClose();
                      }}
                      className="text-left w-full"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {s.topic}
                        </p>
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">
                          {band}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{date}</p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                        <span>💬 {t('va.history.sentences', { n: s.sentenceCount })}</span>
                        <span>⏱ {formatDuration(s.durationMs)}</span>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(s.id);
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
