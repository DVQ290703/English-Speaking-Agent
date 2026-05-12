import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Key, Lock, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { changePasswordRequest, resetPasswordRequest } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { getAuthSession } from '../auth/tokenStorage';
import { useT } from '../i18n/useLanguage';

type PasswordPageMode = 'change' | 'reset';

interface ChangePasswordPageProps {
  mode?: PasswordPageMode;
}

const initialForm = {
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export default function ChangePasswordPage({ mode = 'change' }: ChangePasswordPageProps) {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    old: false,
    new: false,
    confirm: false,
  });
  const [form, setForm] = useState(initialForm);

  const isResetMode = mode === 'reset';
  const resetToken = searchParams.get('token')?.trim() ?? '';
  const hasResetToken = resetToken.length > 0;

  const toggleVisibility = (field: keyof typeof showPasswords) => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const updateField =
    (field: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (form.newPassword !== form.confirmPassword) {
      toast.error(t('auth.changePassword.error.mismatch'));
      return;
    }

    if (isResetMode && !hasResetToken) {
      toast.error(t('auth.changePassword.resetInvalidLink'));
      return;
    }

    setLoading(true);
    try {
      if (isResetMode) {
        await resetPasswordRequest({
          token: resetToken,
          new_password: form.newPassword,
        });
        toast.success(t('auth.changePassword.resetSuccess'));
        navigate('/login', { replace: true });
        return;
      }

      const session = getAuthSession();
      if (!session?.token) {
        toast.error('Please sign in again to change your password.');
        navigate('/login', { replace: true });
        return;
      }

      await changePasswordRequest({
        token: session.token,
        current_password: form.oldPassword,
        new_password: form.newPassword,
      });
      toast.success(t('auth.changePassword.success'));
      setForm(initialForm);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password update failed.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const title = isResetMode ? t('auth.changePassword.resetTitle') : t('auth.changePassword.title');
  const subtitle = isResetMode
    ? t('auth.changePassword.resetSubtitle')
    : t('auth.changePassword.subtitle');

  return (
    <div className="min-h-full bg-gray-50 dark:bg-slate-950 p-4 sm:p-8 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-blue-100/20 dark:shadow-none border border-gray-100 dark:border-slate-800 overflow-hidden">
          <div className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">{title}</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400">{subtitle}</p>
              </div>
            </div>

            {!isResetMode ? (
              <div className="mb-6 p-3 bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800 rounded-xl flex items-center gap-3">
                <div className="w-8 h-8 bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center text-gray-400 shadow-sm border border-gray-100 dark:border-slate-700">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">
                    {t('auth.changePassword.account')}
                  </p>
                  <p className="text-sm font-medium text-gray-700 dark:text-slate-200 truncate">
                    {user?.email || 'user@example.com'}
                  </p>
                </div>
              </div>
            ) : null}

            {isResetMode && !hasResetToken ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {t('auth.changePassword.resetInvalidLink')}
                </div>
                <Link
                  to="/forgot-password"
                  className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl shadow-lg shadow-blue-200 dark:shadow-none transition-all active:scale-[0.98]"
                >
                  {t('auth.changePassword.resetRequestNew')}
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t('auth.changePassword.backToLogin')}
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {!isResetMode ? (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                        {t('auth.changePassword.currentPassword')}
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type={showPasswords.old ? 'text' : 'password'}
                          value={form.oldPassword}
                          onChange={updateField('oldPassword')}
                          className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm dark:text-slate-200"
                          placeholder={t('auth.changePassword.placeholder.current')}
                          autoComplete="current-password"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => toggleVisibility('old')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                          aria-label={showPasswords.old ? 'Hide current password' : 'Show current password'}
                        >
                          {showPasswords.old ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="h-px bg-gray-100 dark:bg-slate-800 my-2" />
                  </>
                ) : null}

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('auth.changePassword.newPassword')}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPasswords.new ? 'text' : 'password'}
                      value={form.newPassword}
                      onChange={updateField('newPassword')}
                      className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm dark:text-slate-200"
                      placeholder={t('auth.changePassword.placeholder.new')}
                      autoComplete="new-password"
                      required
                      minLength={12}
                    />
                    <button
                      type="button"
                      onClick={() => toggleVisibility('new')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                      aria-label={showPasswords.new ? 'Hide new password' : 'Show new password'}
                    >
                      {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {t('auth.changePassword.confirmPassword')}
                  </label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      value={form.confirmPassword}
                      onChange={updateField('confirmPassword')}
                      className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm dark:text-slate-200"
                      placeholder={t('auth.changePassword.placeholder.confirm')}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => toggleVisibility('confirm')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                      aria-label={showPasswords.confirm ? 'Hide password confirmation' : 'Show password confirmation'}
                    >
                      {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-xl shadow-lg shadow-blue-200 dark:shadow-none transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : isResetMode ? (
                    t('auth.changePassword.resetSubmit')
                  ) : (
                    t('auth.changePassword.submit')
                  )}
                </button>

                <div className="pt-1">
                  <Link
                    to={isResetMode ? '/login' : '/dashboard'}
                    className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    {isResetMode ? t('auth.changePassword.backToLogin') : 'Back to dashboard'}
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
