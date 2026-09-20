import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  LineChart as LineChartIcon, TrendingUp, Users, PlayCircle, FileText, DollarSign,
  Activity, Award, GraduationCap, BookOpen, AlertCircle, Filter, RefreshCw,
  UserPlus, CreditCard, Bell, Info,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { supabase } from '../../supabaseClient';
import AdminUndergraduatePerformance from './AdminUndergraduatePerformance';

/**
 * Analytics & Reports — the admin command centre.
 *
 * Six views: Overview, User & Platform Activity, Revenue & Premium, and one per
 * portal. Undergraduate hosts the existing `AdminUndergraduatePerformance`
 * component rather than a rewritten copy, and adds the semester breakdown that
 * component does not compute.
 *
 * Every figure is a real query result. Where the database has no source for a
 * metric, the card says "Not tracked" / "Unavailable" — it never shows 0, which
 * would be indistinguishable from a real zero.
 *
 * Attempt tables are NOT interchangeable and are never mixed:
 *   UTME           utme_attempts       -> utme_subjects
 *   Post-UTME      post_utme_attempts  -> post_utme_exams
 *   Undergraduate  cbt_attempts        -> cbt_exams -> courses (for semester)
 *   Revenue        payments            (status = 'successful'; failed = anything else)
 *   Premium        profiles.premium_status — written as 'Active' by
 *                  /api/payments/verify. A registration alone never counts.
 *
 * Metrics with NO data source in the current schema (reported on screen, not
 * invented): account deletions, login/last-seen activity.
 */

type AnalyticsTab = 'overview' | 'activity' | 'revenue' | 'utme' | 'post-utme' | 'undergraduate';
type RangeKey = 'all' | '7d' | '30d' | '90d';

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: 'all', label: 'All time', days: null },
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
];

/** Every value `profiles.premium_status` holds for a CURRENTLY premium user. */
const PREMIUM_STATUSES = ['Active', 'Premium', 'Pro'];

/** The one status `/api/payments/verify` writes for a completed payment. */
const SUCCESSFUL_PAYMENT_STATUS = 'successful';

const CHART_TOOLTIP_STYLE = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: 12,
} as const;

const CHART_COLORS = ['#38bdf8', '#f59e0b', '#a855f7', '#10b981', '#f43f5e'];

function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.toLocaleString('en-US', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`;
}

function naira(value: number) {
  return `₦${Math.round(value).toLocaleString()}`;
}

function relativeTime(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

interface ProfileRow {
  created_at: string | null;
  premium_status: string | null;
  role: string | null;
  portal: string | null;
  /** Written by /api/payments/verify alongside premium_status = 'Active'. */
  payment_date: string | null;
}

interface PaymentRow {
  amount: number | string | null;
  status: string | null;
  created_at: string | null;
  plan: string | null;
}

/** One sitting, normalised across the three portal attempt tables. */
interface Attempt {
  score: number | null;
  at: Date | null;
  completed: boolean;
  group: string;
  studentKey: string;
}

interface RankedItem { title: string; count: number; }

/**
 * Tallies rows against a lookup table. Selects only the foreign key column
 * rather than whole rows.
 */
async function topByJoinedCount(
  countTable: string,
  countFkColumn: string,
  lookupTable: string,
  lookupTitleColumn: string,
  limit = 5,
): Promise<RankedItem[]> {
  if (!supabase) return [];
  const { data: countRows, error: countErr } = await supabase.from(countTable).select(countFkColumn);
  if (countErr || !countRows) return [];

  const tally = new Map<string, number>();
  for (const row of (countRows as unknown as Record<string, any>[])) {
    const key = row[countFkColumn];
    if (!key) continue;
    tally.set(key, (tally.get(key) || 0) + 1);
  }
  if (tally.size === 0) return [];

  const ids = Array.from(tally.keys());
  const { data: lookupRows, error: lookupErr } = await supabase
    .from(lookupTable)
    .select(`id, ${lookupTitleColumn}`)
    .in('id', ids);
  if (lookupErr || !lookupRows) return [];

  return (lookupRows as unknown as Record<string, any>[])
    .map(row => ({ title: row[lookupTitleColumn], count: tally.get(row.id) || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function KpiCard({
  title, value, note, icon: Icon, color, bg, isLoading, unavailable = false,
}: {
  title: string; value: string; note: string; icon: any; color: string; bg: string;
  isLoading: boolean; unavailable?: boolean;
}) {
  return (
    <div className="bg-[#0f172a]/80 backdrop-blur-md border border-slate-800 rounded-3xl p-6 relative overflow-hidden group hover:border-slate-700 transition-colors">
      <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:scale-110 transition-transform duration-500">
        <Icon size={64} className={color} />
      </div>
      <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center mb-4 relative z-10`}>
        <Icon size={24} className={color} />
      </div>
      <h3 className="text-sm font-semibold text-slate-400 relative z-10 mb-1">{title}</h3>
      <div className="flex items-end gap-3 relative z-10">
        <span className={`font-display font-bold break-all ${unavailable ? 'text-xl text-slate-500' : 'text-3xl text-white'}`}>
          {isLoading ? '—' : value}
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-2 relative z-10">{isLoading ? '' : note}</p>
    </div>
  );
}

function Panel({
  title, icon: Icon, iconClass, action, children,
}: {
  title: string; icon: any; iconClass: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0f172a]/80 backdrop-blur-md border border-slate-800 rounded-3xl p-6">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Icon className={iconClass} size={20} /> {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function ChartFrame({
  title, icon: Icon, iconClass, note, isLoading, isEmpty, emptyMessage, height = 'h-72', children,
}: {
  title: string; icon: any; iconClass: string; note?: string; isLoading: boolean;
  isEmpty: boolean; emptyMessage: string; height?: string; children: React.ReactNode;
}) {
  return (
    <div className={`bg-[#0f172a]/80 backdrop-blur-md border border-slate-800 rounded-3xl p-6 ${height} flex flex-col`}>
      <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
        <Icon size={18} className={iconClass} /> {title}
        {note && <span className="text-[10px] text-slate-500 font-normal ml-auto">{note}</span>}
      </h3>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Loading…</div>
      ) : isEmpty ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm text-center px-4">
          {emptyMessage}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">{children as any}</ResponsiveContainer>
      )}
    </div>
  );
}

/** Rows for a simple, honest "this cannot be measured" panel. */
function UnavailableNote({ items }: { items: { label: string; reason: string }[] }) {
  return (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.label} className="p-3 rounded-xl bg-[#020617]/50 border border-slate-800/50">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-300">{item.label}</span>
            <span className="text-xs text-slate-500 font-medium shrink-0">Not tracked</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">{item.reason}</p>
        </div>
      ))}
    </div>
  );
}

const SCORE_BUCKETS = [
  { label: '0–39%', min: 0, max: 39 },
  { label: '40–59%', min: 40, max: 59 },
  { label: '60–79%', min: 60, max: 79 },
  { label: '80–100%', min: 80, max: 100 },
];

/**
 * Shared UTME/Post-UTME performance view — same facts, different source table.
 */
function PortalPerformancePanel({
  portalLabel, accentText, attempts, isLoading, groupLabel,
}: {
  portalLabel: string;
  accentText: string;
  attempts: Attempt[];
  isLoading: boolean;
  groupLabel: string;
}) {
  const completed = attempts.filter(a => a.completed);
  const scored = completed.filter(a => a.score !== null && !Number.isNaN(a.score));
  const avgScore = scored.length
    ? Math.round(scored.reduce((s, a) => s + Number(a.score), 0) / scored.length)
    : 0;
  const students = new Set(attempts.map(a => a.studentKey).filter(Boolean)).size;

  const distribution = SCORE_BUCKETS.map(b => ({
    range: b.label,
    count: scored.filter(a => Number(a.score) >= b.min && Number(a.score) <= b.max).length,
  }));

  const byGroup = useMemo(() => {
    const map = new Map<string, { attempts: number; scoreSum: number; scored: number }>();
    for (const a of completed) {
      const key = a.group || 'Unspecified';
      if (!map.has(key)) map.set(key, { attempts: 0, scoreSum: 0, scored: 0 });
      const entry = map.get(key)!;
      entry.attempts += 1;
      if (a.score !== null && !Number.isNaN(a.score)) {
        entry.scoreSum += Number(a.score);
        entry.scored += 1;
      }
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        attempts: v.attempts,
        avg: v.scored ? Math.round(v.scoreSum / v.scored) : null,
      }))
      .sort((a, b) => b.attempts - a.attempts);
  }, [completed]);

  const recent = useMemo(
    () =>
      [...attempts]
        .filter(a => a.at)
        .sort((a, b) => (b.at as Date).getTime() - (a.at as Date).getTime())
        .slice(0, 8),
    [attempts],
  );

  if (isLoading) {
    return <div className="py-24 text-center text-slate-500 text-sm">Loading {portalLabel} analytics…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
        <KpiCard title="Total Sittings" value={attempts.length.toLocaleString()} note="Started, including unfinished" icon={PlayCircle} color={accentText} bg="bg-blue-500/10" isLoading={false} />
        <KpiCard title="Completed" value={completed.length.toLocaleString()} note={`${attempts.length ? Math.round((completed.length / attempts.length) * 100) : 0}% completion rate`} icon={Activity} color="text-emerald-400" bg="bg-emerald-500/10" isLoading={false} />
        <KpiCard title="Participants" value={students.toLocaleString()} note="Distinct students" icon={Users} color="text-purple-400" bg="bg-purple-500/10" isLoading={false} />
        <KpiCard title="Average Score" value={scored.length ? `${avgScore}%` : '—'} note={scored.length ? `Across ${scored.length} scored sitting${scored.length === 1 ? '' : 's'}` : 'No scored sittings in range'} icon={Award} color="text-amber-400" bg="bg-amber-500/10" isLoading={false} />
        <KpiCard title="Avg per Sitting" value={scored.length ? `${Math.round(scored.length / Math.max(1, students))}` : '—'} note="Scored sittings per participant" icon={TrendingUp} color="text-indigo-400" bg="bg-indigo-500/10" isLoading={false} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartFrame
          title="Score Distribution"
          icon={TrendingUp}
          iconClass={accentText}
          isLoading={false}
          isEmpty={scored.length === 0}
          emptyMessage="No scored sittings in this range."
        >
          <BarChart data={distribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="range" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
            <Bar dataKey="count" name="Sittings" radius={[6, 6, 0, 0]}>
              {distribution.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartFrame>

        <Panel title={`${groupLabel} Activity`} icon={FileText} iconClass={accentText}>
          {byGroup.length === 0 ? (
            <p className="text-sm text-slate-500">No completed sittings in this range.</p>
          ) : (
            <div className="space-y-2 max-h-[230px] overflow-y-auto pr-1">
              {byGroup.map(row => (
                <div
                  key={row.name}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#020617]/50 border border-slate-800/50 gap-3"
                >
                  <span className="text-sm font-medium text-slate-200 truncate">{row.name}</span>
                  <span className="text-xs text-slate-400 font-mono shrink-0">
                    {row.attempts} sitting{row.attempts === 1 ? '' : 's'}
                    {row.avg !== null ? ` · avg ${row.avg}%` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title={`Recent ${portalLabel} Activity`} icon={Activity} iconClass={accentText}>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">No sittings recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((a, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-xl bg-[#020617]/50 border border-slate-800/50 gap-3"
              >
                <span className="text-sm text-slate-200 truncate">{a.group || 'Unspecified'}</span>
                <span className="text-xs text-slate-400 shrink-0 flex items-center gap-3">
                  <span>{a.completed ? 'Completed' : 'In progress'}</span>
                  {a.score !== null && <span className="font-mono">{Math.round(Number(a.score))}%</span>}
                  <span className="text-slate-500">{relativeTime(a.at)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function Analytics() {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');
  const [range, setRange] = useState<RangeKey>('all');

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [topExams, setTopExams] = useState<RankedItem[]>([]);
  const [platformCounts, setPlatformCounts] = useState<{
    announcements: number | null;
    enrollments: number | null;
    savedMaterials: number | null;
    materials: number | null;
    questions: number | null;
    utmeCompleted: number | null;
    postCompleted: number | null;
    ugCompleted: number | null;
    utmeQuestions: number | null;
    postQuestions: number | null;
    postExams: number | null;
    ugCourses: number | null;
  }>({
    announcements: null, enrollments: null, savedMaterials: null, materials: null,
    questions: null, utmeCompleted: null, postCompleted: null, ugCompleted: null,
    utmeQuestions: null, postQuestions: null, postExams: null, ugCourses: null,
  });
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);

  const [utmeAttempts, setUtmeAttempts] = useState<Attempt[]>([]);
  const [postUtmeAttempts, setPostUtmeAttempts] = useState<Attempt[]>([]);
  const [semesterActivity, setSemesterActivity] = useState<{ semester: string; attempts: number; avg: number | null }[]>([]);
  const [portalsRequested, setPortalsRequested] = useState(false);
  const [isLoadingPortals, setIsLoadingPortals] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- Loaders (each independently callable, so realtime refresh is cheap) ----

  const loadCore = useCallback(async () => {
    if (!supabase) return;
    const [profileRes, paymentRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('created_at, premium_status, role, portal, payment_date')
        .order('created_at', { ascending: true }),
      supabase
        .from('payments')
        .select('amount, status, created_at, plan')
        .order('created_at', { ascending: true }),
    ]);

    if (profileRes.error) {
      setLoadError(profileRes.error.message);
    } else {
      setLoadError(null);
      setProfiles((profileRes.data as ProfileRow[]) || []);
    }
    // A missing or empty payments table must not blank the dashboard.
    setPayments((paymentRes.data as PaymentRow[]) || []);
    setIsLoading(false);
  }, []);

  const loadCounts = useCallback(async () => {
    const sb = supabase;
    if (!sb) return;

    const countOf = async (table: string, apply?: (q: any) => any) => {
      let q = sb.from(table).select('id', { count: 'exact', head: true });
      if (apply) q = apply(q);
      const { count, error } = await q;
      return error ? null : count ?? 0;
    };

    const [
      exams, announcements, enrollments, savedMaterials, materials, questions,
      utmeCompleted, postCompleted, ugCompleted,
      utmeQuestions, postQuestions, postExams, ugCourses,
    ] = await Promise.all([
      topByJoinedCount('cbt_attempts', 'exam_id', 'cbt_exams', 'title'),
      countOf('announcements'),
      countOf('course_enrollments'),
      countOf('saved_materials'),
      countOf('materials', q => q.eq('is_published', true)),
      countOf('cbt_questions'),
      countOf('utme_attempts', q => q.eq('status', 'completed')),
      countOf('post_utme_attempts', q => q.eq('status', 'completed')),
      countOf('cbt_attempts', q => q.eq('status', 'completed')),
      countOf('utme_questions'),
      countOf('post_utme_questions'),
      countOf('post_utme_exams'),
      countOf('courses', q => q.eq('portal', 'Undergraduate')),
    ]);

    setTopExams(exams);
    setPlatformCounts({
      announcements, enrollments, savedMaterials, materials, questions,
      utmeCompleted, postCompleted, ugCompleted,
      utmeQuestions, postQuestions, postExams, ugCourses,
    });
    setIsLoadingActivity(false);
  }, []);

  /** UTME + Post-UTME sittings + the Undergraduate semester breakdown. */
  const loadPortals = useCallback(async () => {
    const sb = supabase;
    if (!sb) return;

    const [utmeRes, postRes, ugCourseRes, ugAttemptRes] = await Promise.all([
      sb.from('utme_attempts')
        .select('score, percentage, status, created_at, student_id, utme_subjects(name)')
        .order('created_at', { ascending: false }),
      sb.from('post_utme_attempts')
        .select('score, status, end_time, start_time, user_id, post_utme_exams(title, subject)')
        .order('start_time', { ascending: false }),
      // Undergraduate courses carry the semester; cbt_exams does not, so the
      // semester of an attempt is resolved through its course code.
      sb.from('courses').select('course_code, semester').eq('portal', 'Undergraduate'),
      sb.from('cbt_attempts')
        .select('score, status, end_time, started_at, cbt_exams(course_code)')
        .order('end_time', { ascending: false }),
    ]);

    setUtmeAttempts(
      ((utmeRes.data as any[]) || []).map(a => ({
        score: a.score ?? a.percentage ?? null,
        at: a.created_at ? new Date(a.created_at) : null,
        completed: a.status === 'completed',
        group: a.utme_subjects?.name || 'Unspecified',
        studentKey: a.student_id || '',
      })),
    );

    setPostUtmeAttempts(
      ((postRes.data as any[]) || []).map(a => ({
        score: a.score ?? null,
        at: (a.end_time || a.start_time) ? new Date(a.end_time || a.start_time) : null,
        completed: a.status === 'completed',
        group: a.post_utme_exams?.subject || a.post_utme_exams?.title || 'Unspecified',
        studentKey: a.user_id || '',
      })),
    );

    // Semester rollup from real attempts, matched by course code.
    const semesterByCode = new Map<string, string>();
    for (const c of ((ugCourseRes.data as any[]) || [])) {
      if (c.course_code && c.semester) semesterByCode.set(c.course_code, c.semester);
    }
    const rollup = new Map<string, { attempts: number; scoreSum: number; scored: number }>();
    for (const a of ((ugAttemptRes.data as any[]) || [])) {
      if (a.status !== 'completed') continue;
      const semester = semesterByCode.get(a.cbt_exams?.course_code);
      if (!semester) continue;
      if (!rollup.has(semester)) rollup.set(semester, { attempts: 0, scoreSum: 0, scored: 0 });
      const entry = rollup.get(semester)!;
      entry.attempts += 1;
      if (a.score !== null && a.score !== undefined) {
        entry.scoreSum += Number(a.score);
        entry.scored += 1;
      }
    }
    setSemesterActivity(
      Array.from(rollup.entries())
        .map(([semester, v]) => ({
          semester,
          attempts: v.attempts,
          avg: v.scored ? Math.round(v.scoreSum / v.scored) : null,
        }))
        .sort((a, b) => a.semester.localeCompare(b.semester)),
    );

    setIsLoadingPortals(false);
  }, []);

  useEffect(() => { loadCore(); }, [loadCore]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  // Portal + semester data is the only row-level load, so it is held back until
  // a tab that needs it is actually opened.
  useEffect(() => {
    if (activeTab !== 'utme' && activeTab !== 'post-utme' && activeTab !== 'undergraduate') return;
    if (portalsRequested) return;
    setPortalsRequested(true);
    loadPortals();
  }, [activeTab, portalsRequested, loadPortals]);

  /**
   * Freshness. Subscribes to the tables the dashboard reads and re-runs the
   * relevant loader when any of them change — so a registration, a premium
   * activation, a payment or a finished sitting shows up without a manual
   * reload. Debounced, because a single payment can touch several tables at
   * once and we do not want to re-query per event.
   */
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      loadCore();
      loadCounts();
      if (portalsRequested) loadPortals();
    }, 1500);
  }, [loadCore, loadCounts, loadPortals, portalsRequested]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('admin_analytics_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'utme_attempts' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_utme_attempts' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cbt_attempts' }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [scheduleRefresh]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadCore(), loadCounts(), portalsRequested ? loadPortals() : Promise.resolve()]);
    setIsRefreshing(false);
  };

  // --- Derived ---------------------------------------------------------------

  const rangeStart = useMemo(() => {
    const days = RANGES.find(r => r.key === range)?.days ?? null;
    if (days === null) return null;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return d;
  }, [range]);

  const inRange = useCallback(
    (d: Date | null) => !rangeStart || (d !== null && d >= rangeStart),
    [rangeStart],
  );

  const filteredProfiles = useMemo(
    () => profiles.filter(p => inRange(p.created_at ? new Date(p.created_at) : null)),
    [profiles, inRange],
  );

  const successfulPayments = useMemo(
    () => payments.filter(p => p.status === SUCCESSFUL_PAYMENT_STATUS),
    [payments],
  );
  // Anything recorded that did not succeed. Counted and disclosed separately —
  // never added to revenue.
  const unsuccessfulPayments = useMemo(
    () => payments.filter(p => p.status && p.status !== SUCCESSFUL_PAYMENT_STATUS),
    [payments],
  );

  const paymentsInRange = useMemo(
    () => successfulPayments.filter(p => inRange(p.created_at ? new Date(p.created_at) : null)),
    [successfulPayments, inRange],
  );

  const revenue = paymentsInRange.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const allTimeRevenue = successfulPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const signupTrend = useMemo(() => {
    const buckets = new Map<string, { month: string; students: number; premium: number }>();
    for (const p of profiles) {
      if (!p.created_at) continue;
      const key = monthKey(p.created_at);
      if (!buckets.has(key)) buckets.set(key, { month: key, students: 0, premium: 0 });
      const bucket = buckets.get(key)!;
      bucket.students += 1;
      if (p.premium_status && PREMIUM_STATUSES.includes(p.premium_status)) bucket.premium += 1;
    }
    return Array.from(buckets.values());
  }, [profiles]);

  const revenueTrend = useMemo(() => {
    const buckets = new Map<string, { month: string; revenue: number; transactions: number }>();
    for (const p of successfulPayments) {
      if (!p.created_at) continue;
      const key = monthKey(p.created_at);
      if (!buckets.has(key)) buckets.set(key, { month: key, revenue: 0, transactions: 0 });
      const bucket = buckets.get(key)!;
      bucket.revenue += Number(p.amount) || 0;
      bucket.transactions += 1;
    }
    return Array.from(buckets.values());
  }, [successfulPayments]);

  const totalUsers = profiles.length;
  const premiumUsers = profiles.filter(
    p => p.premium_status && PREMIUM_STATUSES.includes(p.premium_status),
  ).length;
  const premiumRate = totalUsers ? Math.round((premiumUsers / totalUsers) * 1000) / 10 : 0;

  /**
   * Most recent premium activations, sorted by the date the payment was
   * recorded — NOT by signup date, which is a different event and would
   * misreport when someone actually became premium.
   */
  const recentPremium = useMemo(
    () =>
      profiles
        .filter(
          p =>
            p.premium_status &&
            PREMIUM_STATUSES.includes(p.premium_status) &&
            p.payment_date,
        )
        .sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)))
        .slice(0, 8),
    [profiles],
  );

  const totalCompletedSittings =
    (platformCounts.utmeCompleted ?? 0) +
    (platformCounts.postCompleted ?? 0) +
    (platformCounts.ugCompleted ?? 0);

  /** Sittings per portal, for the comparison chart. Null counts are omitted. */
  const portalComparison = useMemo(() => {
    const rows = [
      { portal: 'UTME', completed: platformCounts.utmeCompleted },
      { portal: 'Post-UTME', completed: platformCounts.postCompleted },
      { portal: 'Undergraduate', completed: platformCounts.ugCompleted },
    ];
    return rows.filter(r => r.completed !== null) as { portal: string; completed: number }[];
  }, [platformCounts]);

  const tabs: { id: AnalyticsTab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'activity', label: 'User & Platform Activity', icon: UserPlus },
    { id: 'revenue', label: 'Revenue & Premium', icon: CreditCard },
    { id: 'utme', label: 'UTME Performance', icon: Award },
    { id: 'post-utme', label: 'Post-UTME Performance', icon: BookOpen },
    { id: 'undergraduate', label: 'Undergraduate Performance', icon: GraduationCap },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-7xl mx-auto"
    >
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white mb-2 flex items-center gap-3">
            <LineChartIcon className="text-indigo-400" size={28} /> Analytics &amp; Reports
          </h1>
          <p className="text-sm font-body text-slate-400">
            Platform usage, revenue and student performance across all three portals. Updates live.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {activeTab !== 'undergraduate' && (
            <>
              <Filter size={16} className="text-slate-500 shrink-0" />
              <select
                value={range}
                onChange={(e) => setRange(e.target.value as RangeKey)}
                className="bg-[#0f172a] border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {RANGES.map(r => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </>
          )}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Refresh analytics"
            className="p-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-xl transition-colors"
          >
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <tab.icon size={18} /> {tab.label}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* OVERVIEW                                                          */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 sm:gap-6">
            <KpiCard title="Total Users" value={totalUsers.toLocaleString()} note="All registered accounts" icon={Users} color="text-emerald-400" bg="bg-emerald-500/10" isLoading={isLoading} />
            <KpiCard title="New Signups" value={filteredProfiles.length.toLocaleString()} note={RANGES.find(r => r.key === range)?.label || ''} icon={UserPlus} color="text-blue-400" bg="bg-blue-500/10" isLoading={isLoading} />
            <KpiCard title="Premium Users" value={premiumUsers.toLocaleString()} note={`${premiumRate}% conversion`} icon={Award} color="text-amber-400" bg="bg-amber-500/10" isLoading={isLoading} />
            <KpiCard title="Revenue" value={naira(revenue)} note={`${paymentsInRange.length} successful transaction${paymentsInRange.length === 1 ? '' : 's'}`} icon={DollarSign} color="text-emerald-400" bg="bg-emerald-500/10" isLoading={isLoading} />
            <KpiCard title="CBT Sittings" value={totalCompletedSittings.toLocaleString()} note="Completed, all three portals" icon={PlayCircle} color="text-purple-400" bg="bg-purple-500/10" isLoading={isLoadingActivity} />
            <KpiCard title="Active Users" value="Not tracked" note="No login or last-seen column exists on profiles" icon={Activity} color="text-slate-400" bg="bg-slate-500/10" isLoading={false} unavailable />
          </div>

          {loadError && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-4 rounded-2xl flex items-start gap-3">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <p className="text-sm">Could not load user data: {loadError}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartFrame
              title="Student & Premium Growth"
              icon={TrendingUp}
              iconClass="text-emerald-400"
              note="all time"
              isLoading={isLoading}
              isEmpty={signupTrend.length === 0}
              emptyMessage="No signups recorded yet."
            >
              <AreaChart data={signupTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="studentsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="premiumGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="students" name="New Students" stroke="#10b981" fill="url(#studentsGradient)" strokeWidth={2} />
                <Area type="monotone" dataKey="premium" name="Premium" stroke="#f59e0b" fill="url(#premiumGradient)" strokeWidth={2} />
              </AreaChart>
            </ChartFrame>

            <ChartFrame
              title="Revenue Trend"
              icon={DollarSign}
              iconClass="text-emerald-400"
              note={`${naira(allTimeRevenue)} all time`}
              isLoading={isLoading}
              isEmpty={revenueTrend.length === 0}
              emptyMessage="No successful payments recorded yet. Transactions appear once /api/payments/verify records one."
            >
              <BarChart data={revenueTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: any) => [naira(Number(v)), 'Revenue']} />
                <Bar dataKey="revenue" name="Revenue" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartFrame>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartFrame
              title="Completed Sittings by Portal"
              icon={PlayCircle}
              iconClass="text-purple-400"
              isLoading={isLoadingActivity}
              isEmpty={portalComparison.length === 0}
              emptyMessage="No completed sittings recorded yet."
              height="h-64"
            >
              <BarChart data={portalComparison} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="portal" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="completed" name="Completed" radius={[6, 6, 0, 0]}>
                  {portalComparison.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartFrame>

            <Panel title="Most Attempted CBT" icon={FileText} iconClass="text-rose-400">
              <div className="space-y-3">
                {isLoadingActivity ? (
                  <p className="text-sm text-slate-500">Loading…</p>
                ) : topExams.length === 0 ? (
                  <p className="text-sm text-slate-500">No attempts recorded yet.</p>
                ) : topExams.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[#020617]/50 border border-slate-800/50 gap-3">
                    <span className="text-sm font-medium text-slate-200 truncate">{item.title}</span>
                    <span className="text-xs text-slate-400 font-mono shrink-0">{item.count} attempts</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* USER & PLATFORM ACTIVITY                                          */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'activity' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <KpiCard title="New Signups" value={filteredProfiles.length.toLocaleString()} note={RANGES.find(r => r.key === range)?.label || ''} icon={UserPlus} color="text-blue-400" bg="bg-blue-500/10" isLoading={isLoading} />
            <KpiCard title="Course Enrollments" value={platformCounts.enrollments === null ? 'Unavailable' : platformCounts.enrollments.toLocaleString()} note="Rows in course_enrollments" icon={GraduationCap} color="text-emerald-400" bg="bg-emerald-500/10" isLoading={isLoadingActivity} unavailable={platformCounts.enrollments === null} />
            <KpiCard title="Materials Saved" value={platformCounts.savedMaterials === null ? 'Unavailable' : platformCounts.savedMaterials.toLocaleString()} note="Students bookmarking materials" icon={BookOpen} color="text-amber-400" bg="bg-amber-500/10" isLoading={isLoadingActivity} unavailable={platformCounts.savedMaterials === null} />
            <KpiCard title="Announcements" value={platformCounts.announcements === null ? 'Unavailable' : platformCounts.announcements.toLocaleString()} note="Published to the platform" icon={Bell} color="text-purple-400" bg="bg-purple-500/10" isLoading={isLoadingActivity} unavailable={platformCounts.announcements === null} />
          </div>

          <ChartFrame
            title="Sign-ups Over Time"
            icon={UserPlus}
            iconClass="text-blue-400"
            note="all time"
            isLoading={isLoading}
            isEmpty={signupTrend.length === 0}
            emptyMessage="No signups recorded yet."
          >
            <BarChart data={signupTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="students" name="New Students" fill="#38bdf8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartFrame>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="Recent Registrations" icon={UserPlus} iconClass="text-blue-400">
              {isLoading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : filteredProfiles.length === 0 ? (
                <p className="text-sm text-slate-500">No registrations in this range.</p>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {[...filteredProfiles]
                    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
                    .slice(0, 8)
                    .map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[#020617]/50 border border-slate-800/50 gap-3">
                        <span className="text-sm text-slate-200 truncate">
                          {p.portal || 'Unknown portal'}
                          <span className="text-slate-500"> · {p.role || 'Student'}</span>
                        </span>
                        <span className="text-xs text-slate-500 shrink-0">
                          {relativeTime(p.created_at ? new Date(p.created_at) : null)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </Panel>

            <Panel title="Feature Usage" icon={Activity} iconClass="text-emerald-400">
              <div className="space-y-3">
                {[
                  { label: 'Published materials', value: platformCounts.materials },
                  { label: 'Undergraduate CBT questions', value: platformCounts.questions },
                  { label: 'UTME questions', value: platformCounts.utmeQuestions },
                  { label: 'Post-UTME questions', value: platformCounts.postQuestions },
                  { label: 'Post-UTME papers', value: platformCounts.postExams },
                  { label: 'Undergraduate courses', value: platformCounts.ugCourses },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between p-3 rounded-xl bg-[#020617]/50 border border-slate-800/50 gap-3">
                    <span className="text-sm text-slate-300 truncate">{row.label}</span>
                    <span className="text-sm text-slate-100 font-mono shrink-0">
                      {isLoadingActivity ? '…' : row.value === null ? 'unavailable' : row.value}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <Panel title="Not Measurable From Current Data" icon={Info} iconClass="text-slate-400">
            <UnavailableNote
              items={[
                {
                  label: 'Account deletions',
                  reason: 'No deleted_at / is_deleted column exists on profiles, and no deletion event is written to audit_logs.',
                },
                {
                  label: 'Login & last-seen activity',
                  reason: 'profiles has no last_login / last_seen column; sessions are not recorded.',
                },
                {
                  label: 'Active users over time',
                  reason: 'Would require the login data above. Differentiating an active from an inactive account is not possible today.',
                },
              ]}
            />
          </Panel>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* REVENUE & PREMIUM                                                 */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
            <KpiCard title="Total Revenue" value={naira(allTimeRevenue)} note="Successful payments only" icon={DollarSign} color="text-emerald-400" bg="bg-emerald-500/10" isLoading={isLoading} />
            <KpiCard title="Successful Transactions" value={successfulPayments.length.toLocaleString()} note={`${naira(successfulPayments.length ? allTimeRevenue / successfulPayments.length : 0)} average`} icon={CreditCard} color="text-blue-400" bg="bg-blue-500/10" isLoading={isLoading} />
            <KpiCard
              title="Failed / Other"
              value={payments.length === 0 ? 'No records' : unsuccessfulPayments.length.toLocaleString()}
              note={unsuccessfulPayments.length ? 'Excluded from revenue' : 'No unsuccessful payments recorded'}
              icon={AlertCircle}
              color="text-rose-400"
              bg="bg-rose-500/10"
              isLoading={isLoading}
              unavailable={payments.length === 0}
            />
            <KpiCard title="Premium Users" value={premiumUsers.toLocaleString()} note="Current premium_status only" icon={Award} color="text-amber-400" bg="bg-amber-500/10" isLoading={isLoading} />
            <KpiCard title="Premium Conversion" value={`${premiumRate}%`} note={`${premiumUsers} of ${totalUsers} accounts`} icon={TrendingUp} color="text-purple-400" bg="bg-purple-500/10" isLoading={isLoading} />
          </div>

          <ChartFrame
            title="Revenue Trend"
            icon={DollarSign}
            iconClass="text-emerald-400"
            note="successful payments"
            isLoading={isLoading}
            isEmpty={revenueTrend.length === 0}
            emptyMessage="No successful payments recorded yet."
          >
            <BarChart data={revenueTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: any) => [naira(Number(v)), 'Revenue']} />
              <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartFrame>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="Revenue by Plan" icon={CreditCard} iconClass="text-blue-400">
              {(() => {
                const byPlan = new Map<string, { count: number; total: number }>();
                for (const p of successfulPayments) {
                  const key = p.plan || 'unspecified';
                  if (!byPlan.has(key)) byPlan.set(key, { count: 0, total: 0 });
                  const e = byPlan.get(key)!;
                  e.count += 1;
                  e.total += Number(p.amount) || 0;
                }
                if (byPlan.size === 0) {
                  return <p className="text-sm text-slate-500">No successful payments recorded yet.</p>;
                }
                return (
                  <div className="space-y-3">
                    {Array.from(byPlan.entries()).map(([plan, v]) => (
                      <div key={plan} className="flex items-center justify-between p-3 rounded-xl bg-[#020617]/50 border border-slate-800/50 gap-3">
                        <span className="text-sm text-slate-200 capitalize truncate">{plan}</span>
                        <span className="text-xs text-slate-400 font-mono shrink-0">
                          {v.count} × · {naira(v.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </Panel>

            <Panel title="Recent Premium Activations" icon={Award} iconClass="text-amber-400">
              {isLoading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : recentPremium.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No dated premium activations yet. Accounts marked premium without a recorded
                  payment date are counted in the total but cannot be placed on a timeline.
                </p>
              ) : (
                <div className="space-y-2">
                  {recentPremium.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[#020617]/50 border border-slate-800/50 gap-3">
                      <span className="text-sm text-slate-200 truncate">{p.premium_status}</span>
                      <span className="text-xs text-slate-500 shrink-0">
                        {relativeTime(p.payment_date ? new Date(p.payment_date) : null)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {payments.length === 0 && !isLoading && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 p-4 rounded-2xl flex items-start gap-3">
              <Info size={18} className="mt-0.5 shrink-0" />
              <p className="text-sm">
                No rows were returned from <span className="font-mono">payments</span>. Revenue shows
                nothing rather than a fabricated figure — an empty table and a blocked query look the
                same from here.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* PORTALS                                                           */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'utme' && (
        <PortalPerformancePanel
          portalLabel="UTME"
          accentText="text-amber-400"
          attempts={utmeAttempts.filter(a => inRange(a.at))}
          isLoading={isLoadingPortals}
          groupLabel="Subject"
        />
      )}

      {activeTab === 'post-utme' && (
        <PortalPerformancePanel
          portalLabel="Post-UTME"
          accentText="text-blue-400"
          attempts={postUtmeAttempts.filter(a => inRange(a.at))}
          isLoading={isLoadingPortals}
          groupLabel="Subject"
        />
      )}

      {activeTab === 'undergraduate' && (
        <div className="space-y-6">
          {/* Semester rollup, resolved through courses.semester. Only First and
              Second Semester are reported — no other undergraduate level is
              introduced. */}
          <ChartFrame
            title="Completed Sittings by Semester"
            icon={GraduationCap}
            iconClass="text-emerald-400"
            isLoading={isLoadingPortals}
            isEmpty={semesterActivity.length === 0}
            emptyMessage="No completed Undergraduate sittings mapped to a course semester yet."
            height="h-64"
          >
            <BarChart data={semesterActivity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="semester" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="attempts" name="Completed sittings" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartFrame>

          {semesterActivity.length > 0 && (
            <Panel title="Semester Summary" icon={Award} iconClass="text-amber-400">
              <div className="space-y-3">
                {semesterActivity.map(row => (
                  <div key={row.semester} className="flex items-center justify-between p-3 rounded-xl bg-[#020617]/50 border border-slate-800/50 gap-3">
                    <span className="text-sm text-slate-200">{row.semester}</span>
                    <span className="text-xs text-slate-400 font-mono">
                      {row.attempts} completed{row.avg !== null ? ` · avg ${row.avg}%` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* The existing Undergraduate analysis, hosted rather than duplicated. */}
          <AdminUndergraduatePerformance />
        </div>
      )}
    </motion.div>
  );
}
