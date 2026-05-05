import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Mic } from 'lucide-react';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Legend,
} from 'recharts';

import { fetchMe } from '../api/auth';
import { fetchConversationStats } from '../api/conversations';
import { clearAuthSession, getAuthSession } from '../auth/tokenStorage';
import BadgesCard from '../components/dashboard/BadgesCard';
import OnboardingTip from '../components/dashboard/OnboardingTip';
import CountUp from '../components/ui/CountUp';
import Skeleton from '../components/ui/Skeleton';
import { useTopics } from '../hooks/useTopics';
import { useT } from '../i18n/useLanguage';
import LanguageToggle from '../i18n/LanguageToggle';
import { computeBadges, computePeriodDelta } from '../lib/gamification';
import ThemeToggle from '../theme/ThemeToggle';
import { useDarkMode } from '../theme/useDarkMode';

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0m';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? (s > 0 ? `${m}m ${s}s` : `${m}m`) : `${s}s`;
}

const ACCENT_STYLES = {
  blue: {
    card: 'from-blue-50 to-blue-100 border-blue-200 hover:border-blue-400',
    chip: 'bg-blue-100 text-blue-700',
  },
  violet: {
    card: 'from-violet-50 to-violet-100 border-violet-200 hover:border-violet-400',
    chip: 'bg-violet-100 text-violet-700',
  },
  emerald: {
    card: 'from-emerald-50 to-emerald-100 border-emerald-200 hover:border-emerald-400',
    chip: 'bg-emerald-100 text-emerald-700',
  },
  amber: {
    card: 'from-amber-50 to-amber-100 border-amber-200 hover:border-amber-400',
    chip: 'bg-amber-100 text-amber-700',
  },
};

function StatCard({ icon, label, value, sub }) {
  const isNum = typeof value === 'number' && Number.isFinite(value);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 px-6 py-5 flex items-center gap-4 shadow-sm dark:shadow-black/30 transition-all hover:shadow-md hover:-translate-y-0.5 dark:hover:shadow-black/40">
      <div className="text-3xl leading-none">{icon}</div>
      <div>
        <div className="text-2xl font-bold text-gray-900 dark:text-slate-100 tabular-nums">
          {isNum ? <CountUp value={value} /> : value}
        </div>
        <div className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

const ACCENT_DARK = {
  blue: {
    card: 'dark:from-blue-950/40 dark:to-blue-900/30 dark:border-blue-900/60 dark:hover:border-blue-500',
    chip: 'dark:bg-blue-900/50 dark:text-blue-200',
  },
  violet: {
    card: 'dark:from-violet-950/40 dark:to-violet-900/30 dark:border-violet-900/60 dark:hover:border-violet-500',
    chip: 'dark:bg-violet-900/50 dark:text-violet-200',
  },
  emerald: {
    card: 'dark:from-emerald-950/40 dark:to-emerald-900/30 dark:border-emerald-900/60 dark:hover:border-emerald-500',
    chip: 'dark:bg-emerald-900/50 dark:text-emerald-200',
  },
  amber: {
    card: 'dark:from-amber-950/40 dark:to-amber-900/30 dark:border-amber-900/60 dark:hover:border-amber-500',
    chip: 'dark:bg-amber-900/50 dark:text-amber-200',
  },
};

// Icons and accents for API topic codes
const API_TOPIC_ICON = {
  daily_conversation: '💬',
  travel: '✈️',
  job_interview: '💼',
  business_meeting: '🗂️',
  academic: '🎓',
  ielts_part1: '🎤',
  ielts_part2: '📋',
  ielts_part3: '🧠',
};
const API_CAT_ACCENT = {
  ielts: 'blue',
  business: 'violet',
  daily: 'emerald',
};
// Map API difficulty_level (lowercase) → i18n key suffix
const DIFFICULTY_TO_LEVEL = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

function TopicCard({ topic, accent, onStart }) {
  const t = useT();
  const styles = ACCENT_STYLES[accent] || ACCENT_STYLES.blue;
  const darkStyles = ACCENT_DARK[accent] || ACCENT_DARK.blue;
  // API-driven topics have .title / .desc set directly; hardcoded ones use i18n keys
  const displayTitle = topic.title ?? t(`topic.${topic.key}.title`);
  const displayDesc = topic.desc ?? t(`topic.${topic.key}.desc`);
  const levelKey = DIFFICULTY_TO_LEVEL[topic.level] ?? topic.level;
  return (
    <button
      onClick={onStart}
      className={`shrink-0 w-65 snap-start text-left bg-linear-to-br ${styles.card} ${darkStyles.card} rounded-2xl border-2 p-5 transition-all duration-200 hover:shadow-md dark:hover:shadow-black/40 hover:-translate-y-0.5 hover:scale-[1.02] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl leading-none">{topic.icon}</span>
        <span className="text-blue-600 dark:text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity text-sm font-semibold">
          {t('common.start')} →
        </span>
      </div>
      <div className="text-base font-bold text-gray-900 dark:text-slate-100 mb-1.5">
        {displayTitle}
      </div>
      <div className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed mb-3 line-clamp-2 min-h-10">
        {displayDesc}
      </div>
      {levelKey && (
        <span
          className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${styles.chip} ${darkStyles.chip}`}
        >
          {t(`level.${levelKey}`)}
        </span>
      )}
    </button>
  );
}

function CategoryTabsRow({ categories, onStart }) {
  const t = useT();
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollerRef = useRef(null);
  const scroll = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
  }, [activeIdx]);
  if (categories.length === 0) return null;
  const active = categories[activeIdx];
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
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
            >
              {cat.displayName ?? t(`category.${cat.name}.name`)}
            </button>
          ))}
        </div>
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => scroll(-1)}
            className="w-9 h-9 rounded-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-500 dark:text-slate-300 hover:text-gray-800 dark:hover:text-white transition-colors flex items-center justify-center"
            aria-label={t('dash.topics.scrollLeft')}
          >
            ‹
          </button>
          <button
            onClick={() => scroll(1)}
            className="w-9 h-9 rounded-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-500 dark:text-slate-300 hover:text-gray-800 dark:hover:text-white transition-colors flex items-center justify-center"
            aria-label={t('dash.topics.scrollRight')}
          >
            ›
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-3 px-1">
        {active.displayDesc ?? t(`category.${active.name}.desc`)}
      </p>
      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-thin pb-2 -mx-1 px-1"
      >
        {active.topics.map((t) => (
          <TopicCard key={t.key} topic={t} accent={active.accent} onStart={() => onStart(t.key)} />
        ))}
      </div>
    </div>
  );
}

// Convert 0-100 pronunciation score → IELTS Band 0-9 (stepped, official mapping)
function toBand(score) {
  if (score >= 97) return 9.0;
  if (score >= 93) return 8.5;
  if (score >= 89) return 8.0;
  if (score >= 85) return 7.5;
  if (score >= 80) return 7.0;
  if (score >= 75) return 6.5;
  if (score >= 70) return 6.0;
  if (score >= 65) return 5.5;
  if (score >= 60) return 5.0;
  if (score >= 55) return 4.5;
  if (score >= 50) return 4.0;
  if (score >= 45) return 3.5;
  if (score >= 40) return 3.0;
  return 2.5;
}

function bandColor(band) {
  if (band >= 7.5) return { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' };
  if (band >= 6.5) return { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' };
  if (band >= 5.5) return { color: '#d97706', bg: '#fffbeb', border: '#fde68a' };
  return { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
}

function BandTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const band = payload[0].value;
  const bc = bandColor(band);
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg dark:shadow-black/40 px-3 py-2.5 text-sm min-w-[130px]">
      <p className="text-gray-400 dark:text-slate-400 text-xs mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: bc.color }}
        >
          Band
        </span>
        <span className="text-xl font-black" style={{ color: bc.color }}>
          {band.toFixed(1)}
        </span>
      </div>
      {payload[0].payload.topic && (
        <p className="text-gray-400 dark:text-slate-400 text-xs mt-1 truncate max-w-[150px]">
          {payload[0].payload.topic}
        </p>
      )}
    </div>
  );
}

const ScoreTrendChart = memo(function ScoreTrendChart({ sessions, onStart, dark = false }) {
  const t = useT();
  const [tab, setTab] = useState('line');
  // Theme-aware chart palette so axes/grid stay legible in dark mode.
  const axisFill = dark ? '#94a3b8' : '#94a3b8';
  const gridStroke = dark ? '#1e293b' : '#f0f0f0';
  const radarGrid = dark ? '#334155' : '#e2e8f0';
  const radarTickFill = dark ? '#cbd5e1' : '#64748b';
  const dotStrokeColor = dark ? '#0f172a' : '#fff';

  const chartData = useMemo(() => {
    const sorted = [...sessions]
      .filter((s) => s.avgScore > 0)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    return sorted.map((s) => ({
      label: (() => {
        try {
          const d = new Date(s.date);
          return `${d.getDate()}/${d.getMonth() + 1}`;
        } catch {
          return s.date;
        }
      })(),
      band: toBand(s.avgScore),
      topic: s.topic,
      scores: s.scores ?? null,
    }));
  }, [sessions]);

  // Radar: average sub-scores across all sessions that have them
  const radarData = useMemo(() => {
    const withScores = sessions.filter((s) => s.scores);
    if (withScores.length === 0) return null;
    const avg = (key) => {
      const vals = withScores.map((s) => s.scores[key] ?? 0).filter((v) => v > 0);
      return vals.length ? Math.round(vals.reduce((a, v) => a + v, 0) / vals.length) : 0;
    };
    return [
      { axis: t('dash.chart.radar.pronunciation'), value: toBand(avg('pronunciation')) },
      { axis: t('dash.chart.radar.fluency'), value: toBand(avg('fluency')) },
      { axis: t('dash.chart.radar.accuracy'), value: toBand(avg('accuracy')) },
    ];
  }, [sessions, t]);

  const latestBand = chartData.length ? chartData[chartData.length - 1].band : null;
  const prevBand = chartData.length > 1 ? chartData[chartData.length - 2].band : null;
  const trend =
    latestBand !== null && prevBand !== null ? +(latestBand - prevBand).toFixed(1) : null;
  // Median band — robust to outliers (1 session điểm thấp không kéo cả nhóm xuống)
  const medianBand = chartData.length
    ? (() => {
        const sorted = chartData.map((d) => d.band).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        return +med.toFixed(1);
      })()
    : 0;
  const avgBand = medianBand;
  const avgBandColor = bandColor(avgBand);

  // Y-axis ticks: IELTS bands 3.0 … 9.0 step 0.5 — only show whole + .5
  const yTicks = [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];

  if (chartData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm dark:shadow-black/30 p-8 sm:p-10">
        <div className="max-w-md mx-auto text-center">
          <div className="text-5xl mb-3">📈</div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-2">
            {t('dash.chart.emptyTitle')}
          </h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
            {t('dash.chart.emptyBody')}
          </p>
          {/* 3-step visual */}
          <div className="flex items-center justify-between max-w-sm mx-auto mb-6 px-2">
            {[
              { n: '1', emoji: '🎯', key: 'dash.empty.step1' },
              { n: '2', emoji: '🎙️', key: 'dash.empty.step2' },
              { n: '3', emoji: '📊', key: 'dash.empty.step3' },
            ].map((s, i, arr) => (
              <div key={s.n} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100 dark:from-blue-500/20 dark:to-violet-500/20 flex items-center justify-center text-2xl mb-1.5 shadow-sm">
                    {s.emoji}
                  </div>
                  <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-300 leading-tight">
                    {t(s.key)}
                  </p>
                </div>
                {i < arr.length - 1 && (
                  <div className="text-slate-300 dark:text-slate-600 -mt-5 px-1">→</div>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onStart}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors w-full sm:w-auto"
            >
              {t('dash.chart.emptyBtn')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm dark:shadow-black/30 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">
            {t('dash.chart.title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {t('dash.chart.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Band badge */}
          <div className="text-right">
            <div className="text-xs text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">
              {t('dash.chart.avgLabel')}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black" style={{ color: avgBandColor.color }}>
                {avgBand.toFixed(1)}
              </span>
              <span className="text-xs text-gray-400 dark:text-slate-500 font-medium">
                {t('dash.chart.band')}
              </span>
            </div>
          </div>
          {trend !== null && (
            <div
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold ${trend >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-500/15 text-red-500 dark:text-red-300'}`}
            >
              <span>{trend >= 0 ? '▲' : '▼'}</span>
              <span>
                {Math.abs(trend)} {t('dash.chart.pts')}
              </span>
            </div>
          )}
          {/* Tab toggle */}
          <div className="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden text-xs font-semibold">
            <button
              onClick={() => setTab('line')}
              className={`px-3 py-1.5 transition-colors ${tab === 'line' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
            >
              {t('dash.chart.tabLine')}
            </button>
            {radarData && (
              <button
                onClick={() => setTab('radar')}
                className={`px-3 py-1.5 transition-colors ${tab === 'radar' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
              >
                {t('dash.chart.tabRadar')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Compare mode banner */}
      {tab === 'line' &&
        (() => {
          const periodSize = Math.max(2, Math.min(7, Math.floor(sessions.length / 2)));
          const cmp = computePeriodDelta(sessions, periodSize);
          if (!cmp) return null;
          const deltaRounded = +cmp.delta.toFixed(1);
          let label;
          let tone;
          if (deltaRounded > 0) {
            label = t('dash.chart.delta.up', { n: deltaRounded.toFixed(1) });
            tone =
              'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30';
          } else if (deltaRounded < 0) {
            label = t('dash.chart.delta.down', { n: deltaRounded.toFixed(1) });
            tone =
              'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30';
          } else {
            label = t('dash.chart.delta.same');
            tone =
              'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
          }
          return (
            <div className="px-6 pt-4 pb-1 flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${tone}`}>
                {deltaRounded > 0 ? '▲' : deltaRounded < 0 ? '▼' : '●'} {label}
              </span>
              <span className="text-xs text-gray-400 dark:text-slate-500">
                {t('dash.chart.thisPeriod')} {cmp.current.toFixed(1)} · {t('dash.chart.lastPeriod')}{' '}
                {cmp.previous.toFixed(1)}
              </span>
            </div>
          );
        })()}

      {/* Charts */}
      <div className="px-4 pt-6 pb-2">
        {tab === 'line' && (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 8, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: axisFill }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[3, 9]}
                ticks={yTicks}
                tick={{ fontSize: 11, fill: axisFill }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => (v % 1 === 0 ? `${v}.0` : `${v}`)}
              />
              <Tooltip content={<BandTooltip />} />
              {/* Target band reference lines */}
              <ReferenceLine
                y={6.5}
                stroke="#f59e0b"
                strokeDasharray="5 3"
                strokeWidth={1.5}
                label={{
                  value: 'B 6.5',
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill: '#f59e0b',
                }}
              />
              <ReferenceLine
                y={7.0}
                stroke="#16a34a"
                strokeDasharray="5 3"
                strokeWidth={1.5}
                label={{
                  value: 'B 7.0',
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill: '#16a34a',
                }}
              />
              <Line
                type="monotone"
                dataKey="band"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={({ cx, cy, payload }) => {
                  const bc = bandColor(payload.band);
                  return (
                    <circle
                      key={`dot-${cx}-${cy}`}
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill={bc.color}
                      stroke={dotStrokeColor}
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{ r: 7, fill: '#2563eb', stroke: dotStrokeColor, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {tab === 'radar' && radarData && (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData} margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                <PolarGrid stroke={radarGrid} />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fontSize: 12, fill: radarTickFill, fontWeight: 600 }}
                />
                <Radar
                  name={t('dash.chart.radar.label')}
                  dataKey="value"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
                <Legend
                  formatter={() => t('dash.chart.radar.label')}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12, color: radarTickFill }}
                />
                <Tooltip
                  formatter={(v) => [`${Number(v).toFixed(1)} Band`, '']}
                  contentStyle={
                    dark
                      ? {
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: 12,
                          color: '#e2e8f0',
                        }
                      : undefined
                  }
                  itemStyle={dark ? { color: '#e2e8f0' } : undefined}
                  labelStyle={dark ? { color: '#cbd5e1' } : undefined}
                />
              </RadarChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-400 dark:text-slate-500 -mt-2 mb-2">
              {t('dash.chart.radar.note')}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-950/40 dark:to-violet-950/40 flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-slate-400">
          {t('dash.chart.sessionCount', { n: chartData.length })}
        </p>
        <button
          onClick={onStart}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
        >
          {t('dash.chart.practiceBtn')}
        </button>
      </div>
    </div>
  );
});

export default function DashboardPage() {
  const t = useT();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [apiSessions, setApiSessions] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [dark, toggleDark] = useDarkMode();
  const session = useMemo(() => getAuthSession(), []);

  const { categories: apiCategories, loading: topicsLoading } = useTopics();
  const displayCategories = useMemo(() => {
    if (apiCategories.length === 0) return [];
    return apiCategories.map((cat) => ({
      name: cat.code,
      displayName: cat.title,
      displayDesc: null,
      accent: API_CAT_ACCENT[cat.code] ?? 'amber',
      topics: cat.topics.map((tp) => ({
        key: tp.code,
        icon: API_TOPIC_ICON[tp.code] ?? '📝',
        // title and desc come directly from API (no i18n keys needed)
        title: tp.title,
        desc: tp.description ?? '',
        level: tp.difficulty_level ?? '',
      })),
    }));
  }, [apiCategories]);

  const loadStats = useCallback(async () => {
    if (!session?.token) return;
    try {
      const data = await fetchConversationStats(session.token);
      setApiSessions(data);
    } catch {
      // keep existing data on failure
    } finally {
      setStatsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const onFocus = () => {
      void loadStats();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadStats]);

  const allSessions = useMemo(() => {
    return apiSessions.map((s) => ({
      id: s.id,
      topic: s.topic,
      date: s.started_at,
      duration: formatDuration(s.duration_ms ?? 0),
      durationMs: s.duration_ms ?? 0,
      messages: s.user_message_count ?? 0,
      avgScore: Math.round(s.avg_score ?? 0),
      corrections: 0,
      scores:
        s.scores &&
        (s.scores.pronunciation != null || s.scores.fluency != null || s.scores.accuracy != null)
          ? s.scores
          : null,
    }));
  }, [apiSessions]);

  useEffect(() => {
    if (!session?.token) {
      navigate('/', { replace: true });
      return;
    }
    // Use locally stored user info if present to avoid an unnecessary API hit
    if (session.user) {
      setProfile(session.user);
      return;
    }
    fetchMe(session.token)
      .then((user) => setProfile(user))
      .catch(() => {
        clearAuthSession();
        setError('Session expired. Please sign in again.');
        navigate('/', { replace: true });
      });
  }, [navigate, session]);

  const handleLogout = () => {
    clearAuthSession();
    toast.success(t('toast.signedOut'));
    navigate('/', { replace: true });
  };

  const startSession = (topicKey) => {
    // Navigate to VoiceAgent with the topic code. VoiceAgent will automatically
    // load the most recent DB conversation for this topic (if any exists).
    navigate(`/VoiceAgent?topic=${encodeURIComponent(topicKey)}`);
  };

  const handleChartStart = useCallback(() => {
    navigate('/VoiceAgent');
  }, [navigate]);

  const totalSessions = allSessions.length;
  const avgScore = totalSessions
    ? Math.round(allSessions.reduce((a, s) => a + s.avgScore, 0) / totalSessions)
    : 0;
  // Use durationMs directly to avoid parsing the formatted string.
  const totalMins = Math.round(allSessions.reduce((a, s) => a + (s.durationMs ?? 0), 0) / 60000);
  // Compute the current day-streak: count consecutive days (newest first)
  // that have at least one session, stopping at the first gap.
  const streak = useMemo(() => {
    if (allSessions.length === 0) return 0;
    const daySet = new Set(
      allSessions
        .map((s) => {
          try {
            return new Date(s.date).toDateString();
          } catch {
            return null;
          }
        })
        .filter(Boolean),
    );
    let count = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      if (daySet.has(d.toDateString())) {
        count++;
      } else if (count > 0) {
        break;
      }
    }
    return count;
  }, [allSessions]);

  if (error) {
    return (
      <div className={dark ? 'dark' : ''}>
        <div className="min-h-screen bg-[#f5f7fa] dark:bg-slate-950 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-8 text-center shadow-sm">
            <p className="text-gray-600 dark:text-slate-300 mb-4">{error}</p>
            <button
              className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium"
              onClick={() => navigate('/', { replace: true })}
            >
              {t('dash.error.back')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={dark ? 'dark' : ''}>
        <div className="min-h-screen bg-[#f5f7fa] dark:bg-slate-950">
          <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Skeleton className="w-7 h-7" rounded="md" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-8 w-32" rounded="lg" />
          </header>
          <main className="max-w-6xl mx-auto px-6 py-10">
            <Skeleton className="h-9 w-72 mb-3" />
            <Skeleton className="h-4 w-96 mb-10" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-10">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24" rounded="2xl" />
              ))}
            </div>
            <Skeleton className="h-7 w-48 mb-5" />
            <div className="flex gap-4 mb-10 overflow-hidden">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-44 w-65 shrink-0" rounded="2xl" />
              ))}
            </div>
            <Skeleton className="h-72 w-full" rounded="2xl" />
            <span className="sr-only">{t('dash.loading')}</span>
          </main>
        </div>
      </div>
    );
  }

  const displayName = profile.display_name || profile.email || t('dash.fallbackName');

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-[#f5f7fa] dark:bg-slate-950 text-gray-900 dark:text-slate-100">
        {/* Top bar */}
        <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center">
              <span className="text-[11px] font-black text-white leading-none">VIN</span>
            </div>
            <span className="text-base font-semibold text-gray-800 dark:text-slate-100">
              {t('brand.name')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <ThemeToggle dark={dark} onToggle={toggleDark} />
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="flex items-center gap-1.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg px-2.5 py-1 transition-colors"
                title={displayName}
              >
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
                  {displayName?.[0]?.toUpperCase() ?? '?'}
                </div>
                <span className="text-xs text-gray-700 dark:text-slate-200 hidden sm:inline">
                  {displayName}
                </span>
                <svg
                  className={`w-3 h-3 text-gray-500 dark:text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
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
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-lg dark:shadow-black/50 z-40 overflow-hidden animate-fadeIn">
                    <div className="px-3 py-2.5 border-b border-gray-100 dark:border-slate-800">
                      <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">
                        {displayName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400 truncate">
                        {profile?.email}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        navigate('/VoiceAgent');
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors"
                    >
                      <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                        <Mic className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium">{t('dash.newSession')}</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        setShowLogoutConfirm(true);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-2 transition-colors border-t border-gray-100 dark:border-slate-800"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span className="ml-1">{t('common.signOut')}</span>
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
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-slate-100">
              {t('dash.greeting', {
                name: displayName.split(' ').slice(-1)[0],
              })}
            </h1>
            <p className="text-base text-gray-500 dark:text-slate-400 mt-2">{t('dash.subtitle')}</p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mb-6">
            {statsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 px-6 py-5 shadow-sm"
                >
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))
            ) : (
              <>
                <StatCard
                  icon="🎙️"
                  label={t('dash.stats.totalSessions')}
                  value={totalSessions}
                  sub={t('dash.stats.totalSessions.sub')}
                />
                <StatCard
                  icon="⭐"
                  label={t('dash.stats.avgScore')}
                  value={avgScore}
                  sub={t('dash.stats.avgScore.sub')}
                />
                <StatCard
                  icon="⏱"
                  label={t('dash.stats.practice')}
                  value={t('dash.stats.minutes', { n: totalMins })}
                  sub={t('dash.stats.practice.sub')}
                />
                <StatCard
                  icon="🔥"
                  label={t('dash.stats.streak')}
                  value={t('dash.stats.streak.value', { n: streak })}
                  sub={t('dash.stats.streak.sub')}
                />
              </>
            )}
          </div>

          {/* Choose a topic */}
          <section className="mb-10">
            <div className="flex items-end justify-between mb-5">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">
                  {t('dash.topics.title')}
                </h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                  {t('dash.topics.subtitle')}
                </p>
              </div>
            </div>
            {topicsLoading && apiCategories.length === 0 ? (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="shrink-0 w-52 h-40 rounded-2xl" />
                ))}
              </div>
            ) : (
              <CategoryTabsRow categories={displayCategories} onStart={startSession} />
            )}
          </section>

          {/* Badges / achievements */}
          <BadgesCard badges={computeBadges(allSessions)} />

          {/* Score trend chart */}
          <ScoreTrendChart sessions={allSessions} dark={dark} onStart={handleChartStart} />
        </main>

        {/* First-time tip overlay */}
        <OnboardingTip />

        {showLogoutConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fadeIn"
            onClick={() => setShowLogoutConfirm(false)}
          >
            <div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-sm w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-xl shrink-0">
                  👋
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">
                    {t('dash.logout.title')}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    {t('dash.logout.body')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    handleLogout();
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
                >
                  {t('dash.logout.confirm')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
