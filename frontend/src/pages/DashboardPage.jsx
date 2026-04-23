import { useEffect, useMemo, useRef, useState } from "react";
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

const TOPIC_CATEGORIES = [
  {
    name: "IELTS Speaking",
    desc: "Practise official IELTS-style speaking parts.",
    accent: "blue",
    topics: [
      { key: "IELTS Part 1",         icon: "🎤", title: "IELTS Part 1 — Intro",      desc: "Personal questions about you and familiar topics.",     level: "All levels" },
      { key: "IELTS Part 2",         icon: "📋", title: "IELTS Part 2 — Long turn",   desc: "Speak for 1-2 minutes from a cue card.",                level: "Intermediate+" },
      { key: "Academic Discussion",  icon: "🎓", title: "Academic Discussion",        desc: "Part 3 style — opinions, comparisons, abstract topics.", level: "Advanced" },
      { key: "Describe a person",    icon: "🧑", title: "Describe a Person",          desc: "Vocabulary for character, appearance, relationships.",  level: "Intermediate" },
      { key: "Describe a place",     icon: "🏞️", title: "Describe a Place",          desc: "City, country, landmark, favourite location.",          level: "Intermediate" },
    ],
  },
  {
    name: "Business & Career",
    desc: "Workplace English and professional speaking.",
    accent: "violet",
    topics: [
      { key: "Job Interview",     icon: "💼", title: "Job Interview",        desc: "Common questions and structured answers.",   level: "Intermediate+" },
      { key: "Office Meeting",    icon: "🗂️", title: "Office Meeting",      desc: "Discuss projects, share opinions, agree/disagree.", level: "Intermediate" },
      { key: "Presentations",     icon: "📊", title: "Presentations",        desc: "Open, structure, and close a short talk.",   level: "Advanced" },
      { key: "Negotiation",       icon: "🤝", title: "Negotiation",          desc: "Bargain politely, propose terms, reach agreement.", level: "Advanced" },
      { key: "Email & Phone",     icon: "📞", title: "Phone & Email Talk",   desc: "Professional phone calls and follow-ups.",   level: "Intermediate" },
    ],
  },
  {
    name: "Daily Life",
    desc: "Everyday situations you face all the time.",
    accent: "emerald",
    topics: [
      { key: "Daily Conversation", icon: "💬", title: "Daily Conversation", desc: "Hobbies, family, weekend plans, weather.",     level: "Beginner+" },
      { key: "Shopping",           icon: "🛍️", title: "Shopping",           desc: "Ask prices, compare items, return products.",  level: "Beginner" },
      { key: "Healthcare",         icon: "🏥", title: "Healthcare",          desc: "Doctor visits, symptoms, pharmacy talk.",      level: "Intermediate" },
      { key: "Family & Friends",   icon: "👨‍👩‍👧", title: "Family & Friends",    desc: "Relationships, gatherings, personal stories.", level: "Beginner+" },
      { key: "Hobbies",            icon: "🎨", title: "Hobbies & Interests", desc: "Talk about passions and free time activities.", level: "Beginner+" },
    ],
  },
  {
    name: "Travel & Culture",
    desc: "From booking flights to cross-cultural chats.",
    accent: "amber",
    topics: [
      { key: "Travel & Tourism",  icon: "✈️", title: "Travel & Tourism",   desc: "Booking, directions, holiday stories.",       level: "Beginner+" },
      { key: "Food & Restaurant", icon: "🍽️", title: "Food & Restaurant", desc: "Order, describe taste, ask about dishes.",    level: "Beginner+" },
      { key: "Hotel & Booking",   icon: "🏨", title: "Hotel & Booking",   desc: "Check-in, request services, handle problems.", level: "Intermediate" },
      { key: "Culture & Customs", icon: "🌏", title: "Culture & Customs", desc: "Compare traditions and cross-cultural topics.", level: "Advanced" },
      { key: "Airport English",   icon: "🛫", title: "Airport English",    desc: "Check-in, security, customs vocabulary.",      level: "Beginner+" },
    ],
  },
];

const ACCENT_STYLES = {
  blue:    { card: "from-blue-50 to-blue-100 border-blue-200 hover:border-blue-400",       chip: "bg-blue-100 text-blue-700" },
  violet:  { card: "from-violet-50 to-violet-100 border-violet-200 hover:border-violet-400", chip: "bg-violet-100 text-violet-700" },
  emerald: { card: "from-emerald-50 to-emerald-100 border-emerald-200 hover:border-emerald-400", chip: "bg-emerald-100 text-emerald-700" },
  amber:   { card: "from-amber-50 to-amber-100 border-amber-200 hover:border-amber-400",   chip: "bg-amber-100 text-amber-700" },
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
    <div className="bg-white rounded-2xl border border-gray-200 px-6 py-5 flex items-center gap-4 shadow-sm">
      <div className="text-3xl leading-none">{icon}</div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function TopicCard({ topic, accent, onStart }) {
  const styles = ACCENT_STYLES[accent] || ACCENT_STYLES.blue;
  return (
    <button
      onClick={onStart}
      className={`shrink-0 w-65 snap-start text-left bg-linear-to-br ${styles.card} rounded-2xl border-2 p-5 transition-all hover:shadow-md hover:-translate-y-0.5 group`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl leading-none">{topic.icon}</span>
        <span className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm font-semibold">
          Start →
        </span>
      </div>
      <div className="text-base font-bold text-gray-900 mb-1.5">{topic.title}</div>
      <div className="text-sm text-gray-600 leading-relaxed mb-3 line-clamp-2 min-h-10">{topic.desc}</div>
      <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${styles.chip}`}>{topic.level}</span>
    </button>
  );
}

function CategoryTabsRow({ categories, onStart }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollerRef = useRef(null);
  const active = categories[activeIdx];
  const scroll = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 320, behavior: "smooth" });
  };
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTo({ left: 0, behavior: "smooth" });
  }, [activeIdx]);
  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {categories.map((cat, i) => (
            <button
              key={cat.name}
              onClick={() => setActiveIdx(i)}
              className={`whitespace-nowrap text-sm font-semibold px-4 py-2 rounded-full transition-colors ${
                activeIdx === i ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <button onClick={() => scroll(-1)} className="w-9 h-9 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-800 transition-colors flex items-center justify-center" aria-label="Scroll left">‹</button>
          <button onClick={() => scroll(1)} className="w-9 h-9 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-800 transition-colors flex items-center justify-center" aria-label="Scroll right">›</button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-3 px-1">{active.desc}</p>
      <div ref={scrollerRef} className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-thin pb-2 -mx-1 px-1">
        {active.topics.map((t) => (
          <TopicCard key={t.key} topic={t} accent={active.accent} onStart={() => onStart(t.key)} />
        ))}
      </div>
    </div>
  );
}

function SessionCard({ session, onView }) {
  const sc = scoreColor(session.avgScore);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
         onClick={onView}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl leading-none">{TOPIC_ICONS[session.topic] || "💬"}</span>
          <div>
            <div className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
              {session.topic}
            </div>
            <div className="text-sm text-gray-400 mt-0.5">{fmtDate(session.date)}</div>
          </div>
        </div>
        <span
          style={{ color: sc.color, background: sc.bg, border: `1px solid ${sc.border}` }}
          className="text-sm font-bold px-3 py-1 rounded-full"
        >
          {session.avgScore}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>⏱ {session.duration}</span>
        <span>💬 {session.messages} turns</span>
        <span>✏️ {session.corrections} fixes</span>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-sm text-blue-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          View transcript →
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); }}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
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

  const startSession = (topicKey) => {
    navigate(`/VoiceAgent?topic=${encodeURIComponent(topicKey)}`);
  };

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
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center">
            <span className="text-[11px] font-black text-white leading-none">VIN</span>
          </div>
          <span className="text-base font-semibold text-gray-800">IELTS Speaking Coach</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 hidden sm:block">{displayName}</span>
          <button
            onClick={() => navigate("/VoiceAgent")}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            + New Session
          </button>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">

        {/* Welcome */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Xin chào, {displayName.split(" ").slice(-1)[0]} 👋
          </h1>
          <p className="text-base text-gray-500 mt-2">Here's your learning progress and session history.</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-10">
          <StatCard icon="🎙️" label="Total sessions"     value={totalSessions}    sub="all time" />
          <StatCard icon="⭐" label="Average score"       value={avgScore}         sub="across all topics" />
          <StatCard icon="⏱"  label="Practice time"       value={`${totalMins} min`} sub="total" />
          <StatCard icon="🔥" label="Current streak"      value={`${streak} days`} sub="keep it up!" />
        </div>

        {/* Choose a topic */}
        <section className="mb-10">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Chọn chủ đề luyện tập</h2>
              <p className="text-sm text-gray-500 mt-1">Browse by category and pick what you want to practise today.</p>
            </div>
          </div>
          <CategoryTabsRow categories={TOPIC_CATEGORIES} onStart={startSession} />
        </section>

        {/* History section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Section header */}
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Session History</h2>
            <span className="text-sm text-gray-400">{filtered.length} sessions</span>
          </div>

          {/* Topic tabs */}
          <div className="px-6 py-4 border-b border-gray-100 flex gap-2 overflow-x-auto scrollbar-none">
            {TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`whitespace-nowrap text-sm font-medium px-4 py-2 rounded-full transition-colors ${
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
          <div className="p-6">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No sessions yet for this topic.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
          <div className="px-6 py-5 border-t border-gray-100 bg-linear-to-r from-blue-50 to-violet-50 flex items-center justify-between">
            <p className="text-sm text-gray-600">Ready to practise? Start a new session.</p>
            <button
              onClick={() => navigate("/VoiceAgent")}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
            >
              Start speaking →
            </button>
          </div>
        </div>

      </main>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fadeIn"
             onClick={() => setShowLogoutConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-sm w-full p-6"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-xl shrink-0">👋</div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Đăng xuất?</h3>
                <p className="text-sm text-gray-500 mt-1">Bạn có chắc muốn đăng xuất khỏi tài khoản không?</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowLogoutConfirm(false)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Hủy
              </button>
              <button onClick={() => { setShowLogoutConfirm(false); handleLogout(); }}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
