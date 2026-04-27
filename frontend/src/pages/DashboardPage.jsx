import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogOut, Mic } from "lucide-react";

import { fetchMe } from "../api/auth";
import {
  getSessions,
  formatDuration,
  deleteSession,
  getStorageUsage,
  formatBytes,
  pruneOldestSessions,
} from "../api/sessionHistory";
import { clearAuthSession, getAuthSession } from "../auth/tokenStorage";
import { useT, useLanguage } from "../i18n/LanguageContext";
import LanguageToggle from "../i18n/LanguageToggle";

const MOCK_SESSIONS = [
  {
    id: 1,
    topic: "Daily Conversation",
    date: "2026-04-19",
    duration: "12 min",
    messages: 18,
    avgScore: 87,
    corrections: 3,
  },
  {
    id: 2,
    topic: "Job Interview",
    date: "2026-04-18",
    duration: "9 min",
    messages: 14,
    avgScore: 74,
    corrections: 7,
  },
  {
    id: 3,
    topic: "Academic Discussion",
    date: "2026-04-17",
    duration: "15 min",
    messages: 22,
    avgScore: 91,
    corrections: 2,
  },
  {
    id: 4,
    topic: "Daily Conversation",
    date: "2026-04-16",
    duration: "8 min",
    messages: 12,
    avgScore: 83,
    corrections: 5,
  },
  {
    id: 5,
    topic: "Travel & Tourism",
    date: "2026-04-15",
    duration: "11 min",
    messages: 16,
    avgScore: 78,
    corrections: 6,
  },
  {
    id: 6,
    topic: "Job Interview",
    date: "2026-04-14",
    duration: "13 min",
    messages: 20,
    avgScore: 82,
    corrections: 4,
  },
  {
    id: 7,
    topic: "Academic Discussion",
    date: "2026-04-13",
    duration: "17 min",
    messages: 26,
    avgScore: 88,
    corrections: 3,
  },
  {
    id: 8,
    topic: "Daily Conversation",
    date: "2026-04-12",
    duration: "7 min",
    messages: 10,
    avgScore: 79,
    corrections: 6,
  },
  {
    id: 9,
    topic: "Travel & Tourism",
    date: "2026-04-10",
    duration: "14 min",
    messages: 19,
    avgScore: 85,
    corrections: 4,
  },
  {
    id: 10,
    topic: "Job Interview",
    date: "2026-04-09",
    duration: "10 min",
    messages: 15,
    avgScore: 70,
    corrections: 9,
  },
];

const TOPICS = [
  "All",
  "Daily Conversation",
  "Job Interview",
  "Academic Discussion",
  "Travel & Tourism",
];

const TOPIC_ICONS = {
  "Daily Conversation": "💬",
  "Job Interview": "💼",
  "Academic Discussion": "🎓",
  "Travel & Tourism": "✈️",
};

const TOPIC_CATEGORIES = [
  {
    name: "IELTS Speaking",
    desc: "Practise official IELTS-style speaking parts.",
    accent: "blue",
    topics: [
      {
        key: "IELTS Part 1",
        icon: "🎤",
        title: "IELTS Part 1 — Intro",
        desc: "Personal questions about you and familiar topics.",
        level: "All levels",
      },
      {
        key: "IELTS Part 2",
        icon: "📋",
        title: "IELTS Part 2 — Long turn",
        desc: "Speak for 1-2 minutes from a cue card.",
        level: "Intermediate+",
      },
      {
        key: "Academic Discussion",
        icon: "🎓",
        title: "Academic Discussion",
        desc: "Part 3 style — opinions, comparisons, abstract topics.",
        level: "Advanced",
      },
      {
        key: "Describe a person",
        icon: "🧑",
        title: "Describe a Person",
        desc: "Vocabulary for character, appearance, relationships.",
        level: "Intermediate",
      },
      {
        key: "Describe a place",
        icon: "🏞️",
        title: "Describe a Place",
        desc: "City, country, landmark, favourite location.",
        level: "Intermediate",
      },
    ],
  },
  {
    name: "Business & Career",
    desc: "Workplace English and professional speaking.",
    accent: "violet",
    topics: [
      {
        key: "Job Interview",
        icon: "💼",
        title: "Job Interview",
        desc: "Common questions and structured answers.",
        level: "Intermediate+",
      },
      {
        key: "Office Meeting",
        icon: "🗂️",
        title: "Office Meeting",
        desc: "Discuss projects, share opinions, agree/disagree.",
        level: "Intermediate",
      },
      {
        key: "Presentations",
        icon: "📊",
        title: "Presentations",
        desc: "Open, structure, and close a short talk.",
        level: "Advanced",
      },
      {
        key: "Negotiation",
        icon: "🤝",
        title: "Negotiation",
        desc: "Bargain politely, propose terms, reach agreement.",
        level: "Advanced",
      },
      {
        key: "Email & Phone",
        icon: "📞",
        title: "Phone & Email Talk",
        desc: "Professional phone calls and follow-ups.",
        level: "Intermediate",
      },
    ],
  },
  {
    name: "Daily Life",
    desc: "Everyday situations you face all the time.",
    accent: "emerald",
    topics: [
      {
        key: "Daily Conversation",
        icon: "💬",
        title: "Daily Conversation",
        desc: "Hobbies, family, weekend plans, weather.",
        level: "Beginner+",
      },
      {
        key: "Shopping",
        icon: "🛍️",
        title: "Shopping",
        desc: "Ask prices, compare items, return products.",
        level: "Beginner",
      },
      {
        key: "Healthcare",
        icon: "🏥",
        title: "Healthcare",
        desc: "Doctor visits, symptoms, pharmacy talk.",
        level: "Intermediate",
      },
      {
        key: "Family & Friends",
        icon: "👨‍👩‍👧",
        title: "Family & Friends",
        desc: "Relationships, gatherings, personal stories.",
        level: "Beginner+",
      },
      {
        key: "Hobbies",
        icon: "🎨",
        title: "Hobbies & Interests",
        desc: "Talk about passions and free time activities.",
        level: "Beginner+",
      },
    ],
  },
  {
    name: "Travel & Culture",
    desc: "From booking flights to cross-cultural chats.",
    accent: "amber",
    topics: [
      {
        key: "Travel & Tourism",
        icon: "✈️",
        title: "Travel & Tourism",
        desc: "Booking, directions, holiday stories.",
        level: "Beginner+",
      },
      {
        key: "Food & Restaurant",
        icon: "🍽️",
        title: "Food & Restaurant",
        desc: "Order, describe taste, ask about dishes.",
        level: "Beginner+",
      },
      {
        key: "Hotel & Booking",
        icon: "🏨",
        title: "Hotel & Booking",
        desc: "Check-in, request services, handle problems.",
        level: "Intermediate",
      },
      {
        key: "Culture & Customs",
        icon: "🌏",
        title: "Culture & Customs",
        desc: "Compare traditions and cross-cultural topics.",
        level: "Advanced",
      },
      {
        key: "Airport English",
        icon: "🛫",
        title: "Airport English",
        desc: "Check-in, security, customs vocabulary.",
        level: "Beginner+",
      },
    ],
  },
];

const ACCENT_STYLES = {
  blue: {
    card: "from-blue-50 to-blue-100 border-blue-200 hover:border-blue-400",
    chip: "bg-blue-100 text-blue-700",
  },
  violet: {
    card: "from-violet-50 to-violet-100 border-violet-200 hover:border-violet-400",
    chip: "bg-violet-100 text-violet-700",
  },
  emerald: {
    card: "from-emerald-50 to-emerald-100 border-emerald-200 hover:border-emerald-400",
    chip: "bg-emerald-100 text-emerald-700",
  },
  amber: {
    card: "from-amber-50 to-amber-100 border-amber-200 hover:border-amber-400",
    chip: "bg-amber-100 text-amber-700",
  },
};

function scoreColor(s) {
  if (s >= 85)
    return {
      color: "#15803d",
      bg: "rgba(34,197,94,0.10)",
      border: "rgba(34,197,94,0.30)",
    };
  if (s >= 70)
    return {
      color: "#b45309",
      bg: "rgba(245,158,11,0.10)",
      border: "rgba(245,158,11,0.30)",
    };
  return {
    color: "#c2410c",
    bg: "rgba(249,115,22,0.10)",
    border: "rgba(249,115,22,0.30)",
  };
}

function fmtDate(str, lang) {
  const d = new Date(str);
  const locale = lang === "en" ? "en-US" : "vi-VN";
  return d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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
  const t = useT();
  const styles = ACCENT_STYLES[accent] || ACCENT_STYLES.blue;
  return (
    <button
      onClick={onStart}
      className={`shrink-0 w-65 snap-start text-left bg-linear-to-br ${styles.card} rounded-2xl border-2 p-5 transition-all hover:shadow-md hover:-translate-y-0.5 group`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl leading-none">{topic.icon}</span>
        <span className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm font-semibold">
          {t("common.start")} →
        </span>
      </div>
      <div className="text-base font-bold text-gray-900 mb-1.5">
        {t(`topic.${topic.key}.title`)}
      </div>
      <div className="text-sm text-gray-600 leading-relaxed mb-3 line-clamp-2 min-h-10">
        {t(`topic.${topic.key}.desc`)}
      </div>
      <span
        className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${styles.chip}`}
      >
        {t(`level.${topic.level}`)}
      </span>
    </button>
  );
}

function CategoryTabsRow({ categories, onStart }) {
  const t = useT();
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollerRef = useRef(null);
  const active = categories[activeIdx];
  const scroll = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 320, behavior: "smooth" });
  };
  useEffect(() => {
    if (scrollerRef.current)
      scrollerRef.current.scrollTo({ left: 0, behavior: "smooth" });
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
                activeIdx === i
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t(`category.${cat.name}.name`)}
            </button>
          ))}
        </div>
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => scroll(-1)}
            className="w-9 h-9 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-800 transition-colors flex items-center justify-center"
            aria-label={t("dash.topics.scrollLeft")}
          >
            ‹
          </button>
          <button
            onClick={() => scroll(1)}
            className="w-9 h-9 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-800 transition-colors flex items-center justify-center"
            aria-label={t("dash.topics.scrollRight")}
          >
            ›
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-3 px-1">
        {t(`category.${active.name}.desc`)}
      </p>
      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-thin pb-2 -mx-1 px-1"
      >
        {active.topics.map((t) => (
          <TopicCard
            key={t.key}
            topic={t}
            accent={active.accent}
            onStart={() => onStart(t.key)}
          />
        ))}
      </div>
    </div>
  );
}

function SessionCard({ session, onView, onDelete, highlight = false }) {
  const t = useT();
  const { lang } = useLanguage();
  const sc = scoreColor(session.avgScore);
  const topicTitle =
    t(`topic.${session.topic}.title`) === `topic.${session.topic}.title`
      ? session.topic
      : t(`topic.${session.topic}.title`);
  return (
    <div
      id={`session-card-${session.id}`}
      className={`relative bg-white rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group ${
        highlight
          ? "session-card-highlight border-blue-400"
          : "border-gray-200 hover:border-blue-200"
      }`}
      onClick={onView}
    >
      {highlight && (
        <span
          className="absolute -top-2 left-4 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-600 text-white shadow-sm animate-fadeIn"
        >
          {t("dash.session.justSaved")}
        </span>
      )}
      {session.isReal && onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(t("dash.session.deleteConfirm"))) {
              onDelete();
            }
          }}
          aria-label={t("dash.session.deleteAria")}
          title={t("dash.session.deleteAria")}
          className="absolute top-3 right-3 w-7 h-7 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all z-10"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      )}

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl leading-none">
            {TOPIC_ICONS[session.topic] || "💬"}
          </span>
          <div>
            <div className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
              {topicTitle}
            </div>
            <div className="text-sm text-gray-400 mt-0.5">
              {fmtDate(session.date, lang)}
            </div>
          </div>
        </div>
        <span
          style={{
            color: sc.color,
            background: sc.bg,
            border: `1px solid ${sc.border}`,
          }}
          className={`text-sm font-bold px-3 py-1 rounded-full ${
            session.isReal && onDelete
              ? "group-hover:opacity-0 transition-opacity"
              : ""
          }`}
        >
          {session.avgScore}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>⏱ {session.duration}</span>
        <span>💬 {t("dash.session.turns", { n: session.messages })}</span>
        <span>✏️ {t("dash.session.fixes", { n: session.corrections })}</span>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-sm text-blue-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          {t("dash.session.viewTranscript")}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          {t("common.replay")}
        </button>
      </div>
    </div>
  );
}

function StorageUsageBar({ tick, onCleanup }) {
  const t = useT();
  const usage = useMemo(() => getStorageUsage(), [tick]);
  const [confirming, setConfirming] = useState(false);

  if (usage.sessionCount === 0) return null;

  const isCritical = usage.percent >= 80;
  const isWarning = usage.percent >= 50 && usage.percent < 80;
  const barColor = isCritical
    ? "bg-red-500"
    : isWarning
      ? "bg-amber-500"
      : "bg-emerald-500";
  const cardBorder = isCritical
    ? "border-red-200 bg-red-50/50"
    : isWarning
      ? "border-amber-200 bg-amber-50/50"
      : "border-gray-200 bg-white";

  const handlePrune = () => {
    if (!confirming) {
      setConfirming(true);
      window.setTimeout(() => setConfirming(false), 4000);
      return;
    }
    pruneOldestSessions(0.5);
    setConfirming(false);
    onCleanup?.();
  };

  return (
    <div
      className={`mb-10 rounded-xl border ${cardBorder} px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
            {isCritical ? t("dash.storage.full") : t("dash.storage.usage")}
          </span>
          <span className="text-xs text-gray-500 tabular-nums">
            {formatBytes(usage.bytes)} •{" "}
            {t("dash.storage.sessionsCount", {
              n: usage.sessionCount,
              max: usage.max,
            })}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-500`}
            style={{ width: `${Math.max(2, usage.percent)}%` }}
          />
        </div>
        {isCritical && (
          <p className="text-[11px] text-red-600 mt-1.5">
            {t("dash.storage.fullNote")}
          </p>
        )}
      </div>
      {usage.sessionCount > 1 && (
        <button
          type="button"
          onClick={handlePrune}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            confirming
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {confirming
            ? t("dash.storage.confirmCleanup", {
                n: Math.floor(usage.sessionCount / 2),
              })
            : t("dash.storage.cleanup")}
        </button>
      )}
    </div>
  );
}

export default function DashboardPage({ demoMode = false }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  const [highlightId, setHighlightId] = useState(
    () => location.state?.highlightSessionId ?? null,
  );
  const session = useMemo(() => getAuthSession(), []);

  useEffect(() => {
    if (!highlightId) return;
    setActiveTab("All");
    setSearchQuery("");
    if (location.state?.highlightSessionId) {
      window.history.replaceState({}, "");
    }
    const scrollTimer = window.setTimeout(() => {
      const el = document.getElementById(`session-card-${highlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 80);
    const clearTimer = window.setTimeout(() => setHighlightId(null), 4200);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId]);

  const realSessions = useMemo(() => {
    return getSessions().map((s, idx) => ({
      id: s.id ?? `real_${idx}`,
      topic: s.topic,
      date: s.date,
      duration: formatDuration(s.durationMs ?? 0),
      messages: s.sentenceCount ?? 0,
      avgScore: s.avgScore ?? 0,
      corrections: s.corrections ?? 0,
      isReal: true,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyTick]);

  useEffect(() => {
    const onFocus = () => setHistoryTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const allSessions = useMemo(
    () => [...realSessions, ...MOCK_SESSIONS],
    [realSessions],
  );

  useEffect(() => {
    if (demoMode) {
      setProfile({ display_name: "Demo User", email: "demo@example.com" });
      return;
    }
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
  }, [navigate, session, demoMode]);

  const handleLogout = () => {
    clearAuthSession();
    navigate("/", { replace: true });
  };

  const startSession = (topicKey) => {
    navigate(`/VoiceAgent?topic=${encodeURIComponent(topicKey)}`);
  };

  const filtered = useMemo(() => {
    const byTab =
      activeTab === "All"
        ? allSessions
        : allSessions.filter((s) => s.topic === activeTab);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter((s) => {
      const dateStr = (() => {
        try {
          return new Date(s.date).toLocaleDateString().toLowerCase();
        } catch {
          return String(s.date).toLowerCase();
        }
      })();
      return (
        (s.topic || "").toLowerCase().includes(q) ||
        dateStr.includes(q) ||
        String(s.avgScore ?? "").includes(q)
      );
    });
  }, [allSessions, activeTab, searchQuery]);

  const totalSessions = allSessions.length;
  const avgScore = totalSessions
    ? Math.round(
        allSessions.reduce((a, s) => a + s.avgScore, 0) / totalSessions,
      )
    : 0;
  const totalMins = allSessions.reduce(
    (a, s) => a + (parseInt(s.duration) || 0),
    0,
  );
  const streak = 7;

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium"
            onClick={() => navigate("/", { replace: true })}
          >
            {t("dash.error.back")}
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">
          {t("dash.loading")}
        </div>
      </div>
    );
  }

  const displayName =
    profile.display_name || profile.email || t("dash.fallbackName");

  return (
    <div className="min-h-screen bg-[#f5f7fa] text-gray-900">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center">
            <span className="text-[11px] font-black text-white leading-none">
              VIN
            </span>
          </div>
          <span className="text-base font-semibold text-gray-800">
            {t("brand.name")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <div className="relative">
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-lg px-2.5 py-1 transition-colors"
              title={displayName}
            >
              <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
                {displayName?.[0]?.toUpperCase() ?? "?"}
              </div>
              <span className="text-xs text-gray-700 hidden sm:inline">{displayName}</span>
              <svg
                className={`w-3 h-3 text-gray-500 transition-transform ${showUserMenu ? "rotate-180" : ""}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-gray-200 shadow-lg z-40 overflow-hidden animate-fadeIn">
                  <div className="px-3 py-2.5 border-b border-gray-100">
                    <div className="text-sm font-semibold text-gray-900 truncate">{displayName}</div>
                    <div className="text-xs text-gray-500 truncate">{profile?.email}</div>
                  </div>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate("/VoiceAgent");
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                      <Mic className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-medium">{t("dash.newSession")}</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowLogoutConfirm(true);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors border-t border-gray-100"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="ml-1">{t("common.signOut")}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Welcome */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
            {t("dash.greeting", {
              name: displayName.split(" ").slice(-1)[0],
            })}
          </h1>
          <p className="text-base text-gray-500 mt-2">{t("dash.subtitle")}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-6">
          <StatCard
            icon="🎙️"
            label={t("dash.stats.totalSessions")}
            value={totalSessions}
            sub={t("dash.stats.totalSessions.sub")}
          />
          <StatCard
            icon="⭐"
            label={t("dash.stats.avgScore")}
            value={avgScore}
            sub={t("dash.stats.avgScore.sub")}
          />
          <StatCard
            icon="⏱"
            label={t("dash.stats.practice")}
            value={t("dash.stats.minutes", { n: totalMins })}
            sub={t("dash.stats.practice.sub")}
          />
          <StatCard
            icon="🔥"
            label={t("dash.stats.streak")}
            value={t("dash.stats.streak.value", { n: streak })}
            sub={t("dash.stats.streak.sub")}
          />
        </div>

        <StorageUsageBar
          tick={historyTick}
          onCleanup={() => setHistoryTick((t) => t + 1)}
        />


        {/* Choose a topic */}
        <section className="mb-10">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {t("dash.topics.title")}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {t("dash.topics.subtitle")}
              </p>
            </div>
          </div>
          <CategoryTabsRow
            categories={TOPIC_CATEGORIES}
            onStart={startSession}
          />
        </section>

        {/* History section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Section header */}
          <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-gray-900">
                {t("dash.history.title")}
              </h2>
              <span className="text-sm text-gray-400">
                {t("dash.history.count", { n: filtered.length })}
              </span>
            </div>
            <div className="relative w-full sm:w-72">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("dash.history.searchPlaceholder")}
                className="w-full pl-9 pr-9 py-2 text-sm rounded-full border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-colors bg-gray-50 placeholder:text-gray-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label={t("dash.history.clearSearch")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Topic tabs */}
          <div className="px-6 py-4 border-b border-gray-100 flex gap-2 overflow-x-auto scrollbar-none">
            {TOPICS.map((tab) => {
              const tabLabel =
                tab === "All"
                  ? t("dash.history.tabAll")
                  : t(`topic.${tab}.title`) === `topic.${tab}.title`
                    ? tab
                    : t(`topic.${tab}.title`);
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`whitespace-nowrap text-sm font-medium px-4 py-2 rounded-full transition-colors ${
                    activeTab === tab
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {tab !== "All" && TOPIC_ICONS[tab]} {tabLabel}
                </button>
              );
            })}
          </div>

          {/* Cards grid */}
          <div className="p-6">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                {t("dash.history.empty")}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filtered.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    highlight={s.id === highlightId}
                    onView={() => {
                      if (s.isReal) {
                        navigate(
                          `/VoiceAgent?session=${encodeURIComponent(s.id)}`,
                        );
                      } else {
                        navigate("/VoiceAgent");
                      }
                    }}
                    onDelete={
                      s.isReal
                        ? () => {
                            deleteSession(s.id);
                            setHistoryTick((t) => t + 1);
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer CTA */}
          <div className="px-6 py-5 border-t border-gray-100 bg-linear-to-r from-blue-50 to-violet-50 flex items-center justify-between">
            <p className="text-sm text-gray-600">{t("dash.history.cta")}</p>
            <button
              onClick={() => navigate("/VoiceAgent")}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
            >
              {t("dash.history.startSpeaking")}
            </button>
          </div>
        </div>
      </main>

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fadeIn"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-xl shrink-0">
                👋
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {t("dash.logout.title")}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {t("dash.logout.body")}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleLogout();
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
              >
                {t("dash.logout.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
