import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { registerRequest } from "../api/auth";
import { saveAuthSession } from "../auth/tokenStorage";

const initialForm = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");

  const updateField = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Please enter your name.";
    if (!form.email.trim()) {
      errs.email = "Please enter your email.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = "Email format is invalid.";
    }
    if (!form.password) {
      errs.password = "Please enter a password.";
    } else if (form.password.length < 8) {
      errs.password = "Password must be at least 8 characters.";
    }
    if (!form.confirmPassword) {
      errs.confirmPassword = "Please confirm your password.";
    } else if (form.password !== form.confirmPassword) {
      errs.confirmPassword = "Passwords do not match.";
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    setApiError("");
    if (Object.keys(errs).length > 0) return;

    setIsSubmitting(true);
    try {
      const data = await registerRequest({
        name: form.name.trim(),
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

      navigate("/dashboard", { replace: true });
    } catch (error) {
      setApiError(error.message || "Registration failed. Please try again.");
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
            Start your<br />
            <em>learning journey.</em>
          </h1>
          <p className="subtitle">
            Create your free account and begin practising English speaking with real-time AI feedback, pronunciation scoring, and guided conversation drills.
          </p>
          <ul className="feature-list">
            <li>Personalised AI conversation partner</li>
            <li>Real-time grammar & fluency corrections</li>
            <li>Progress tracked across every session</li>
          </ul>
        </section>

        <section className="card-panel">
          <div className="card-header">
            <h2>Create account</h2>
            <p>Join thousands of learners improving every day.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="login-form">
            <label className="field">
              <span>Display name</span>
              <input
                type="text"
                placeholder="Nguyen Van A"
                value={form.name}
                onChange={updateField("name")}
                autoComplete="name"
              />
              {errors.name && <small>{errors.name}</small>}
            </label>

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={updateField("email")}
                autoComplete="email"
              />
              {errors.email && <small>{errors.email}</small>}
            </label>

            <label className="field">
              <span>Password</span>
              <div className="password-row">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={updateField("password")}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="toggle-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && <small>{errors.password}</small>}
            </label>

            <label className="field">
              <span>Confirm password</span>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Re-enter password"
                value={form.confirmPassword}
                onChange={updateField("confirmPassword")}
                autoComplete="new-password"
              />
              {errors.confirmPassword && <small>{errors.confirmPassword}</small>}
            </label>

            <button type="submit" className="submit-btn" disabled={isSubmitting}>
              {isSubmitting ? "Creating account..." : "Create account"}
            </button>

            {apiError && <p className="error-msg">{apiError}</p>}
          </form>

          <p className="switch-link">
            Already have an account?
            <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
              Sign in
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
