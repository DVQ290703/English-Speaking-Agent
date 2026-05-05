import { Component, type ErrorInfo, type ReactNode } from 'react';

import { useT } from '../i18n/useLanguage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const t = useT();
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f7fa] dark:bg-slate-950 px-6 py-10">
      <div className="max-w-md w-full text-center bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm p-8">
        <div className="text-5xl mb-4" aria-hidden="true">
          ⚠️
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">
          {t('error.title')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">{t('error.body')}</p>
        {error?.message && (
          <pre className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-500/10 rounded-lg p-3 mb-6 overflow-auto text-left whitespace-pre-wrap break-words">
            {error.message}
          </pre>
        )}
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t('error.retry')}
          </button>
          <button
            type="button"
            onClick={() => {
              onReset();
              if (typeof window !== 'undefined') window.location.reload();
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            {t('error.reload')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ErrorBoundary;
