import { useEffect, useState } from 'react';

import { useT } from '../../i18n/LanguageContext';

export function useShortcutsToggle() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
      if (isEditable) return;
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { open, setOpen };
}

type Shortcut = { keys: string[]; descKey: string };

const SHORTCUTS: { sectionKey: string; items: Shortcut[] }[] = [
  {
    sectionKey: 'shortcuts.section.global',
    items: [
      { keys: ['?'], descKey: 'shortcuts.openCheatsheet' },
      { keys: ['Esc'], descKey: 'shortcuts.closeModal' },
    ],
  },
  {
    sectionKey: 'shortcuts.section.voice',
    items: [
      { keys: ['Space'], descKey: 'shortcuts.toggleMic' },
      { keys: ['Enter'], descKey: 'shortcuts.sendText' },
      { keys: ['M'], descKey: 'shortcuts.muteAgent' },
      { keys: ['R'], descKey: 'shortcuts.replayLast' },
    ],
  },
  {
    sectionKey: 'shortcuts.section.dashboard',
    items: [
      { keys: ['N'], descKey: 'shortcuts.newSession' },
      { keys: ['T'], descKey: 'shortcuts.toggleTheme' },
    ],
  },
];

export default function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-900">
          <div>
            <h2
              id="shortcuts-title"
              className="text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              {t('shortcuts.title')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('shortcuts.subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500"
            aria-label={t('common.close')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {SHORTCUTS.map((sec) => (
            <div key={sec.sectionKey}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                {t(sec.sectionKey)}
              </h3>
              <ul className="space-y-1.5">
                {sec.items.map((s) => (
                  <li
                    key={s.descKey}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {t(s.descKey)}
                    </span>
                    <span className="flex gap-1">
                      {s.keys.map((k) => (
                        <kbd
                          key={k}
                          className="px-2 py-0.5 text-xs font-mono font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-200 shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400 text-center">
          {t('shortcuts.hint')}
        </div>
      </div>
    </div>
  );
}
