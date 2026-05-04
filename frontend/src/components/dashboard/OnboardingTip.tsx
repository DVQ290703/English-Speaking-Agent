import { useEffect, useState } from 'react';

import { useT } from '../../i18n/LanguageContext';

const STORAGE_KEY = 'vt_onboarding_seen_v1';

export default function OnboardingTip() {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) setOpen(true);
    } catch {
      // noop
    }
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // noop
    }
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-9000 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={dismiss}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-md w-full p-6 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-linear-to-br from-blue-500 to-violet-600 text-white text-3xl mx-auto mb-4 shadow-md">
          🎙️
        </div>
        <h2 className="text-xl font-bold text-center text-gray-900 dark:text-slate-100 mb-2">
          {t('onboarding.title')}
        </h2>
        <p className="text-sm text-gray-600 dark:text-slate-400 text-center mb-5 leading-relaxed">
          {t('onboarding.body')}
        </p>
        <div className="flex justify-center gap-3 mb-5">
          <Step num="1" label={t('dash.empty.step1')} />
          <Arrow />
          <Step num="2" label={t('dash.empty.step2')} />
          <Arrow />
          <Step num="3" label={t('dash.empty.step3')} />
        </div>
        <button
          onClick={dismiss}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
        >
          {t('onboarding.cta')}
        </button>
      </div>
    </div>
  );
}

function Step({ num, label }: { num: string; label: string }) {
  return (
    <div className="flex flex-col items-center flex-1 min-w-0">
      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold mb-1.5">
        {num}
      </div>
      <p className="text-[11px] text-gray-600 dark:text-slate-400 text-center leading-tight">
        {label}
      </p>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center text-slate-300 dark:text-slate-600 -mt-3">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  );
}
