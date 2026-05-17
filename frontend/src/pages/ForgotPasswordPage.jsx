import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { forgotPasswordRequest } from '../api/auth';
import { useT } from '../i18n/useLanguage';

export default function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [previewResetUrl, setPreviewResetUrl] = useState('');

  const normalizePreviewResetUrl = (url) => {
    if (!url) return '';

    try {
      const parsed = new URL(url);
      return `${window.location.origin}${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setApiError('');
    try {
      const data = await forgotPasswordRequest({ email: email.trim() });
      setPreviewResetUrl(normalizePreviewResetUrl(data.preview_reset_url || ''));
      setSubmitted(true);
    } catch (error) {
      setApiError(error.message || 'Failed to start password reset.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="grid-bg" aria-hidden="true" />
      <div className="orb orb-left" aria-hidden="true" />
      <div className="orb orb-right" aria-hidden="true" />

      <main className="login-layout">
        <section className="brand-panel">
          <p className="eyebrow">VOICE TRAINER</p>
          <h1>
            Speak with
            <br />
            <em>clarity, every day.</em>
          </h1>
          <p className="subtitle">
            Practice English speaking with guided prompts, pronunciation scoring, and instant voice
            feedback.
          </p>
          <ul className="feature-list">
            <li>Topic-based conversation drills</li>
            <li>Pronunciation assessment insights</li>
            <li>Cross-device learning history</li>
          </ul>
        </section>

        <section className="card-panel">
          <div className="card-header">
            {!submitted ? (
              <>
                <h2>{t('auth.forgotPassword.title')}</h2>
                <p>{t('auth.forgotPassword.desc')}</p>
              </>
            ) : (
              <>
                <h2>{t('auth.forgotPassword.checkEmail')}</h2>
                <p>
                  {t('auth.forgotPassword.sentTo')} {email}
                </p>
              </>
            )}
          </div>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="login-form">
              <label className="field">
                <span>{t('auth.forgotPassword.emailLabel')}</span>
                <div className="relative" style={{ marginTop: '0.5rem' }}>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  />
                </div>
              </label>

              <button
                type="submit"
                className="submit-btn"
                disabled={loading}
                style={{ marginTop: '1rem' }}
              >
                {loading ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('auth.forgotPassword.submit')}
                  </span>
                ) : (
                  t('auth.forgotPassword.submit')
                )}
              </button>

              {apiError ? <p className="error-msg">{apiError}</p> : null}
            </form>
          ) : (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Send className="w-8 h-8" />
              </div>
              <p className="text-sm text-gray-600 mb-2">
                {t('auth.forgotPassword.sentTo')}{' '}
                <span className="font-semibold text-gray-900">{email}</span>
              </p>
              <p className="text-xs text-gray-500 mb-6">
                {t('auth.forgotPassword.checkEmailHint')}
              </p>
              {previewResetUrl ? (
                <a
                  href={previewResetUrl}
                  className="submit-btn inline-flex items-center justify-center"
                  style={{ textDecoration: 'none', marginBottom: '1rem' }}
                >
                  Open reset page
                </a>
              ) : null}
              <button
                onClick={() => {
                  setSubmitted(false);
                  setPreviewResetUrl('');
                }}
                className="text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
              >
                {t('auth.forgotPassword.tryAgain')}
              </button>
            </div>
          )}

          <div className="switch-link mt-8">
            <p style={{ margin: 0 }}>
              <Link
                to="/login"
                className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t('auth.forgotPassword.backToLogin')}</span>
              </Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
