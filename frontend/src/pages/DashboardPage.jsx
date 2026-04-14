import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchMe } from "../api/auth";
import { clearAuthSession, getAuthSession } from "../auth/tokenStorage";
import VoiceAgent from "./VoiceAgent";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const session = useMemo(() => getAuthSession(), []);

  useEffect(() => {
    if (!session?.token) {
      navigate("/", { replace: true });
      return;
    }

    fetchMe(session.token)
      .then((user) => setProfile(user))
      .catch(() => {
        clearAuthSession();
        setError("Session expired. Please sign in again.");
        navigate("/", { replace: true });
      });
  }, [navigate, session]);

  const handleLogout = () => {
    clearAuthSession();
    navigate("/", { replace: true });
  };

  if (error) {
    return (
      <div className="page-shell">
        <main className="dashboard-shell">
          <div className="dashboard-card">
            <h1>Session error</h1>
            <p className="error-msg">{error}</p>
            <button className="submit-btn" onClick={() => navigate("/", { replace: true })}>
              Back to login
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-shell">
        <main className="dashboard-shell">
          <div className="dashboard-card">
            <h1>Loading your workspace...</h1>
            <p className="empty-state">Preparing the chat interface after sign-in.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <VoiceAgent
      currentUser={{
        name: profile.display_name || profile.email || "User",
        email: profile.email || "",
      }}
      onLogout={handleLogout}
    />
  );
}
