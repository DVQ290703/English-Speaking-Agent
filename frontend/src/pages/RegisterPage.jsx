import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { registerRequest } from '../api/auth';
import { saveAuthSession } from '../auth/tokenStorage';
import Spinner from '../components/ui/Spinner';
import { useT } from '../i18n/LanguageContext';

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------
const registerSchema = z
  .object({
    display_name: z
      .string()
      .min(1, 'Please enter your display name.')
      .max(50, 'Display name must be 50 characters or fewer.'),
    email: z.string().min(1, 'Please enter your email.').email('Email format is invalid.'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .max(128, 'Password is too long.'),
    confirmPassword: z.string().min(1, 'Please confirm your password.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

// ---------------------------------------------------------------------------
// Password strength
// ---------------------------------------------------------------------------
function getStrength(pw) {
  if (!pw) return null;
  if (pw.length < 8) return 'weak';
  let score = 0;
  if (/[a-z]/.test(pw)) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 2) return 'medium';
  return 'strong';
}

const STRENGTH_META = {
  weak: { label: 'Weak', bars: 1, color: 'bg-red-500', text: 'text-red-500' },
  medium: { label: 'Medium', bars: 2, color: 'bg-amber-400', text: 'text-amber-500' },
  strong: { label: 'Strong', bars: 3, color: 'bg-emerald-500', text: 'text-emerald-600' },
};

function PasswordStrengthBar({ password }) {
  const strength = useMemo(() => getStrength(password), [password]);
  if (!strength) return null;
  const meta = STRENGTH_META[strength];

  return (
    <div className="mt-1.5 space-y-1">
      {/* 3-segment bar */}
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < meta.bars ? meta.color : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      {/* Label */}
      <p className={`text-xs font-semibold flex items-center gap-1 ${meta.text}`}>
        {strength === 'strong' && (
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {meta.label} password
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eye toggle icon
// ---------------------------------------------------------------------------
function EyeIcon({ open }) {
  return open ? (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const initialForm = {
  display_name: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const t = useT();
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');

  const updateField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const validate = () => {
    const result = registerSchema.safeParse(form);
    if (result.success) return {};
    const errs = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if (key && !errs[key]) errs[key] = issue.message;
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    setApiError('');
    if (Object.keys(errs).length > 0) return;

    setIsSubmitting(true);
    try {
      const data = await registerRequest({
        display_name: form.display_name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      saveAuthSession({
        token: data.access_token,
        expiresIn: data.expires_in,
        user: data.user,
        remembered: false,
        loggedAt: Date.now(),
      });
      toast.success(t('toast.accountCreated'));
      navigate('/dashboard', { replace: true });
    } catch (error) {
      const msg = error.message || t('toast.registerFailed');
      setApiError(msg);
    } finally {
      setIsSubmitting(false);
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
            Start your
            <br />
            <em>learning journey.</em>
          </h1>
          <p className="subtitle">
            Create your free account and begin practising English speaking with real-time AI
            feedback, pronunciation scoring, and guided conversation drills.
          </p>
          <ul className="feature-list">
            <li>Personalised AI conversation partner</li>
            <li>Real-time grammar &amp; fluency corrections</li>
            <li>Progress tracked across every session</li>
          </ul>
        </section>

        <section className="card-panel">
          <div className="card-header">
            <h2>Create account</h2>
            <p>Join thousands of learners improving every day.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="login-form">
            {/* Display name */}
            <label className="field">
              <span>Display name</span>
              <input
                type="text"
                placeholder="Nguyen Van A"
                value={form.display_name}
                onChange={updateField('display_name')}
                autoComplete="name"
              />
              {errors.display_name && <small>{errors.display_name}</small>}
            </label>

            {/* Email */}
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={updateField('email')}
                autoComplete="email"
              />
              {errors.email && <small>{errors.email}</small>}
            </label>

            {/* Password */}
            <div className="field">
              <label>
                <span>Password</span>
                <div className="password-row">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={form.password}
                    onChange={updateField('password')}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="toggle-btn"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon open={!showPassword} />
                  </button>
                </div>
              </label>
              {/* Strength bar — shown whenever user has typed something */}
              <PasswordStrengthBar password={form.password} />
              {errors.password && <small>{errors.password}</small>}
            </div>

            {/* Confirm password */}
            <label className="field">
              <span>Confirm password</span>
              <div className="password-row">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  value={form.confirmPassword}
                  onChange={updateField('confirmPassword')}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="toggle-btn"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={!showConfirmPassword} />
                </button>
              </div>
              {errors.confirmPassword && <small>{errors.confirmPassword}</small>}
            </label>

            <button type="submit" className="submit-btn" disabled={isSubmitting}>
              {isSubmitting ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Spinner size={14} color="#fff" />
                  {t('auth.creatingAccount')}
                </span>
              ) : (
                'Create account'
              )}
            </button>

            {apiError && <p className="error-msg">{apiError}</p>}
          </form>

          <p className="switch-link">
            Already have an account?{' '}
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigate('/');
              }}
            >
              Sign in
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
