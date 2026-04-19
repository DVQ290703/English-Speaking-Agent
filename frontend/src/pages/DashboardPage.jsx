import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchMe } from "../api/auth";
import { clearAuthSession, getAuthSession } from "../auth/tokenStorage";

const MOCK_SESSIONS = [
  { id: 1,  topic: "Daily Conversation",  date: "2026-04-19", duration: "12 min", messages: 18, avgScore: 87, corrections: 3 },
  { id: 2,  topic: "Job Interview",        date: "2026-04-18", duration: "9 min",  messages: 14, avgScore: 74, corrections: 7 },
  { id: 3,  topic: "Academic Discussion",  date: "2026-04-17", duration: "15 min", messages: 22, avgScore: 91, corrections: 2 },
  { id: 4,  topic: "Daily Conversation",  date: "2026-04-16", duration: "8 min",  messages: 12, avgScore: 83, corrections: 5 },
  { id: 5,  topic: "Travel & Tourism",    date: "2026-04-15", duration: "11 min", messages: 16, avgScore: 78, corrections: 6 },
  { id: 6,  topic: "Job Interview",        date: "2026-04-14", duration: "13 min", messages: 20, avgScore: 82, corrections: 4 },
  { id: 7,  topic: "Academic Discussion",  date: "2026-04-13", duration: "17 min", messages: 26, avgScore: 88, corrections: 3 },
  { id: 8,  topic: "Daily Conversation",  date: "2026-04-12", duration: "7 min",  messages: 10, avgScore: 79, corrections: 6 },
  { id: 9,  topic: "Travel & Tourism",    date: "2026-04-10", duration: "14 min", messages: 19, avgScore: 85, corrections: 4 },
  { id: 10, topic: "Job Interview",        date: "2026-04-09", duration: "10 min", messages: 15, avgScore: 70, corrections: 9 },
];

const TOPICS = ["All", "Daily Conversation", "Job Interview", "Academic Discussion", "Travel & Tourism"];

const TOPIC_ICONS = {
  "Daily Conversation":  "💬",
  "Job Interview":       "💼",
  "Academic Discussion": "🎓",
  "Travel & Tourism":    "✈️",
};

function scoreColor(s) {
  if (s >= 85) return { color: "#15803d", bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.30)" };
  if (s >= 70) return { color: "#b45309", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)" };
  return        { color: "#c2410c", bg: "rgba(249,115,22,0.10)", border: "rgba(249,115,22,0.30)" };
}

function fmtDate(str) {
  const d = new Date(str);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex items-center gap-4 shadow-sm">
      <div className="text-2xl leading-none">{icon}</div>
      <div>
        <div className="text-xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
        {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function SessionCard({ session, onView }) {
  const sc = scoreColor(session.avgScore);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
         onClick={onView}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{TOPIC_ICONS[session.topic] || "💬"}</span>
          <div>
            <div className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
              {session.topic}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{fmtDate(session.date)}</div>
          </div>
        </div>
        <span
          style={{ color: sc.color, background: sc.bg, border: `1px solid ${sc.border}` }}
          className="text-xs font-bold px-2.5 py-0.5 rounded-full"
        >
          {session.avgScore}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>⏱ {session.duration}</span>
        <span>💬 {session.messages} turns</span>
        <span>✏️ {session.corrections} fixes</span>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-blue-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          View transcript →
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); }}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Replay
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage({ demoMode = false }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [error, setError]     = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const session = useMemo(() => getAuthSession(), []);

  useEffect(() => {
    if (demoMode) { setProfile({ display_name: "Demo User", email: "demo@example.com" }); return; }
    if (!session?.token) { navigate("/", { replace: true }); return; }
    fetchMe(session.token)
      .then((user) => setProfile(user))
      .catch(() => {
        clearAuthSession();
        setError("Session expired. Please sign in again.");
        navigate("/", { replace: true });
      });
  }, [navigate, session, demoMode]);

  const handleLogout = () => { clearAuthSession(); navigate("/", { replace: true }); };

  const filtered = activeTab === "All"
    ? MOCK_SESSIONS
    : MOCK_SESSIONS.filter((s) => s.topic === activeTab);

  const totalSessions = MOCK_SESSIONS.length;
  const avgScore = Math.round(MOCK_SESSIONS.reduce((a, s) => a + s.avgScore, 0) / totalSessions);
  const totalMins = MOCK_SESSIONS.reduce((a, s) => a + parseInt(s.duration), 0);
  const streak = 7;

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
          <p className="text-gray-600 mb-4">{error}</p>
          <button className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium" onClick={() => navigate("/", { replace: true })}>
            Back to login
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">Loading your workspace...</div>
      </div>
    );
  }

  const displayName = profile.display_name || profile.email || "Learner";

  return (
    <div className="min-h-screen bg-[#f5f7fa] text-gray-900">

      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded-sm flex items-center justify-center">
            <span className="text-[10px] font-black text-white leading-none">VIN</span>
          </div>
          <span className="text-sm font-semibold text-gray-800">IELTS Speaking Coach</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 hidden sm:block">{displayName}</span>
          <button
            onClick={() => navigate("/VoiceAgent")}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-1.5 rounded-xl transition-colors"
          >
            + New Session
          </button>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Xin chào, {displayName.split(" ").slice(-1)[0]} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-1">Here's your learning progress and session history.</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard icon="🎙️" label="Total sessions"     value={totalSessions}    sub="all time" />
          <StatCard icon="⭐" label="Average score"       value={avgScore}         sub="across all topics" />
          <StatCard icon="⏱"  label="Practice time"       value={`${totalMins} min`} sub="total" />
          <StatCard icon="🔥" label="Current streak"      value={`${streak} days`} sub="keep it up!" />
        </div>

        {/* History section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Section header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Session History</h2>
            <span className="text-xs text-gray-400">{filtered.length} sessions</span>
          </div>

          {/* Topic tabs */}
          <div className="px-5 py-3 border-b border-gray-100 flex gap-2 overflow-x-auto scrollbar-none">
            {TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`whitespace-nowrap text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  activeTab === t
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t !== "All" && TOPIC_ICONS[t]} {t}
              </button>
            ))}
          </div>

          {/* Cards grid */}
          <div className="p-5">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No sessions yet for this topic.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    onView={() => navigate("/VoiceAgent")}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer CTA */}
          <div className="px-5 py-4 border-t border-gray-100 bg-linear-to-r from-blue-50 to-violet-50 flex items-center justify-between">
            <p className="text-xs text-gray-500">Ready to practise? Start a new session.</p>
            <button
              onClick={() => navigate("/VoiceAgent")}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-1.5 rounded-xl transition-colors"
            >
              Start speaking →
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}
