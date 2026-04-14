import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { loginRequest } from "../api/auth";
import { saveAuthSession } from "../auth/tokenStorage";

const initialForm = {
  email: "",
  password: "",
  rememberMe: true,
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");

  const updateField = (field) => (event) => {
    const value = field === "rememberMe" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.email.trim()) {
      nextErrors.email = "Please enter your email.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nextErrors.email = "Email format is invalid.";
    }

    if (!form.password) {
      nextErrors.password = "Please enter your password.";
    } else if (form.password.length < 8) {
      nextErrors.password = "Password must have at least 8 characters.";
    }

    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = validate();
    setErrors(nextErrors);
    setApiError("");

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await loginRequest({
        email: form.email.trim(),
        password: form.password,
      });

      saveAuthSession({
        token: data.access_token,
        expiresIn: data.expires_in,
        user: data.user,
        remembered: form.rememberMe,
        loggedAt: Date.now(),
      });

      navigate("/dashboard", { replace: true });
    } catch (error) {
      setApiError(error.message || "Login failed");
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
          <h1>Speak with clarity, every day.</h1>
          <p className="subtitle">
            Practice English speaking with guided prompts, pronunciation scoring, and instant voice feedback.
          </p>
          <ul className="feature-list">
            <li>Topic-based conversation drills</li>
            <li>Pronunciation assessment insights</li>
            <li>Cross-device learning history</li>
          </ul>
        </section>

        <section className="card-panel">
          <div className="card-header">
            <h2>Welcome back</h2>
            <p>Sign in to continue your speaking journey.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="login-form">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={updateField("email")}
                autoComplete="email"
              />
              {errors.email ? <small>{errors.email}</small> : null}
            </label>

            <label className="field">
              <span>Password</span>
              <div className="password-row">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={updateField("password")}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="toggle-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {errors.password ? <small>{errors.password}</small> : null}
            </label>

            <div className="form-row">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.rememberMe}
                  onChange={updateField("rememberMe")}
                />
                <span>Remember me</span>
              </label>
              <a href="#">Forgot password?</a>
            </div>

            <button type="submit" className="submit-btn" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>

            {apiError ? <p className="error-msg">{apiError}</p> : null}
          </form>
        </section>
      </main>
    </div>
  );
}
