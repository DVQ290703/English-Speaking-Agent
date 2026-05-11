import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, Lock, Eye, EyeOff, ShieldCheck, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '../i18n/useLanguage';
import { useAuth } from '../auth/AuthContext';

export default function ChangePasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    old: false,
    new: false,
    confirm: false,
  });

  const [form, setForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const toggleVisibility = (field: keyof typeof showPasswords) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (form.newPassword !== form.confirmPassword) {
      toast.error(t('auth.changePassword.error.mismatch'));
      return;
    }

    setLoading(true);
    // Simulating API call
    setTimeout(() => {
      setLoading(false);
      toast.success(t('auth.changePassword.success'));
      navigate('/dashboard');
    }, 1500);
  };

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
                <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">{t('auth.changePassword.title')}</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400">{t('auth.changePassword.subtitle')}</p>
              </div>
            </div>

            {/* Email Display Label */}
            <div className="mb-6 p-3 bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-800 rounded-xl flex items-center gap-3">
              <div className="w-8 h-8 bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center text-gray-400 shadow-sm border border-gray-100 dark:border-slate-700">
                <Mail className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">{t('auth.changePassword.account')}</p>
                <p className="text-sm font-medium text-gray-700 dark:text-slate-200 truncate">{user?.email || 'user@example.com'}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Old Password */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('auth.changePassword.currentPassword')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPasswords.old ? 'text' : 'password'}
                    value={form.oldPassword}
                    onChange={e => setForm({ ...form, oldPassword: e.target.value })}
                    className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm dark:text-slate-200"
                    placeholder={t('auth.changePassword.placeholder.current')}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => toggleVisibility('old')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                  >
                    {showPasswords.old ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="h-px bg-gray-100 dark:bg-slate-800 my-2" />

              {/* New Password */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('auth.changePassword.newPassword')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPasswords.new ? 'text' : 'password'}
                    value={form.newPassword}
                    onChange={e => setForm({ ...form, newPassword: e.target.value })}
                    className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm dark:text-slate-200"
                    placeholder={t('auth.changePassword.placeholder.new')}
                    required
                    minLength={12}
                  />
                  <button
                    type="button"
                    onClick={() => toggleVisibility('new')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                  >
                    {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  {t('auth.changePassword.confirmPassword')}
                </label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                    className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm dark:text-slate-200"
                    placeholder={t('auth.changePassword.placeholder.confirm')}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => toggleVisibility('confirm')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
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
                ) : (
                  t('auth.changePassword.submit')
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
