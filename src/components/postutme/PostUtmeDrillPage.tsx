import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, BookOpen, Clock, Award, CheckCircle2, XCircle, ArrowRight, ArrowLeft, 
  RefreshCcw, AlertCircle, Check, Play, ShieldAlert, BarChart2, Calendar
} from 'lucide-react';
import { POST_UTME_UNIVERSITY_NAME } from '../../lib/postUtme';
import { usePlatformConfig } from '../../lib/platformSettings';

interface PostUtmeExam {
  id: string;
  title: string;
  university: string;
  subject: string;
  year: string;
  duration_minutes: number;
}

interface Question {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  marks: number;
  difficulty: string;
}

interface TestResult {
  score: number;
  totalCorrect: number;
  totalWrong: number;
  totalQuestions: number;
  results: {
    id: string;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    student_answer: string;
    correct_option: string;
    explanation: string;
    is_correct: boolean;
  }[];
}

export default function PostUtmeDrillPage() {
  const { config } = usePlatformConfig();

  /**
   * The Post-UTME session, opened or closed by an admin in System Settings →
   * Post-UTME. Closing it withdraws access to NEW sittings only — the papers,
   * every past attempt and every score stay exactly as they were, so reopening
   * the session restores the full history. The server enforces the same rule in
   * /api/post-utme/start, so a retained examId cannot start one either.
   */
  const sessionClosed = config.cbt.post_utme_cbt_enabled === false;

  const [exams, setExams] = useState<PostUtmeExam[]>([]);
  const [selectedExam, setSelectedExam] = useState<PostUtmeExam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [testState, setTestState] = useState<'selecting' | 'testing' | 'submitting' | 'results'>('selecting');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [todayStats, setTodayStats] = useState({ coursesToday: 0, cbtTakenToday: 0, avgScoreToday: 0 });

  useEffect(() => {
    fetchPublishedExams();
    fetchTodayStats();
  }, []);

  const fetchTodayStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: attempts } = await supabase
        .from('post_utme_attempts')
        .select('score, start_time, end_time, post_utme_exams(subject, university)')
        .eq('user_id', user.id);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayAttempts = (attempts || []).filter((a: any) => {
        const t = new Date(a.end_time || a.start_time);
        return t >= today;
      });

      const distinctCourses = new Set(todayAttempts.map((a: any) => a.post_utme_exams?.subject || a.post_utme_exams?.university).filter(Boolean)).size;
      const cbtTaken = todayAttempts.length;

      let scoreSum = 0;
      let scoreCount = 0;
      todayAttempts.forEach((a: any) => {
        if (a.score !== null && a.score !== undefined) {
          scoreSum += Number(a.score);
          scoreCount++;
        }
      });
      const avgScore = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0;

      setTodayStats({
        coursesToday: distinctCourses,
        cbtTakenToday: cbtTaken,
        avgScoreToday: avgScore
      });
    } catch (err) {
      console.error('Error fetching Post-UTME today stats:', err);
    }
  };

  useEffect(() => {
    fetchPublishedExams();
  }, []);

  useEffect(() => {
    let timer: any;
    if (testState === 'testing' && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleSubmitTest();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [testState, timeLeft]);

  const fetchPublishedExams = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('post_utme_exams')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExams(data || []);
    } catch (err) {
      console.error('Failed to load published Post-UTME papers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartTest = async (exam: PostUtmeExam) => {
    if (sessionClosed) return;
    setLoading(true);
    try {

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      // Call backend to start exam & fetch safe questions without answer keys
      const res = await fetch(`/api/post-utme/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ examId: exam.id })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start Post-UTME drill');

      setSelectedExam(exam);
      setQuestions(data.questions || []);
      setAttemptId(data.attemptId);
      setTimeLeft(exam.duration_minutes * 60);
      setAnswers({});
      setCurrentIndex(0);
      setTestState('testing');
    } catch (err: any) {
      alert('Error starting exam: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (questionId: string, option: string) => {
    setAnswers({ ...answers, [questionId]: option });
  };

  const handleSubmitTest = async () => {
    if (!attemptId || testState === 'submitting' || testState === 'results') return;
    setTestState('submitting');

    try {

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`/api/post-utme/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ attemptId, answers })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit Post-UTME exam');

      setTestResult(data);
      setTestState('results');
    } catch (err: any) {
      alert('Error submitting test: ' + err.message);
      setTestState('testing');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Was filtered by a university picker. Post-UTME is single-university now, so
  // every published paper is shown. Filtering by the stored value rather than a
  // hardcoded code also keeps papers created before this change reachable.
  const filteredExams = exams;

  if (testState === 'selecting') {
    return (
      <div className="space-y-6 max-w-7xl mx-auto px-4 py-8">
        <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 text-white p-8 rounded-3xl shadow-lg relative overflow-hidden">
          <div className="relative z-10 space-y-3">
            <span className="bg-indigo-500/30 text-indigo-200 text-xs font-semibold px-3 py-1 rounded-full border border-indigo-400/30">
              Post-UTME Past Questions & CBT Drills
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight">
              {POST_UTME_UNIVERSITY_NAME} Screening CBT
            </h1>
            <p className="text-indigo-200 text-sm max-w-2xl leading-relaxed">
              Practice timed {POST_UTME_UNIVERSITY_NAME} Post-UTME past questions with secure
              server-side grading and detailed performance reviews.
            </p>
          </div>
          <div className="absolute right-0 bottom-0 opacity-10 translate-x-8 translate-y-8">
            <Building2 className="w-64 h-64" />
          </div>
        </div>

        {/* Today's Progress Section */}
        {/* Today's Progress — same card proportions, spacing and icon chips as
            the UTME dashboard. These were previously light `bg-white`/gray cards
            sitting inside an otherwise dark surface, which read as a different
            product. Values are unchanged and still come from the student's own
            completed `post_utme_attempts`. */}
        <div className="space-y-4">
          <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <Clock className="text-amber-400" size={20} /> Today's Progress
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-lg">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                <BookOpen size={24} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{todayStats.coursesToday}</div>
                <div className="text-xs text-slate-400">Courses Enrolled Today</div>
              </div>
            </div>
            <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-lg">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <Clock size={24} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{todayStats.cbtTakenToday}</div>
                <div className="text-xs text-slate-400">CBT Taken Today</div>
              </div>
            </div>
            <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-lg">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                <Award size={24} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{todayStats.avgScoreToday}%</div>
                <div className="text-xs text-slate-400">Average CBT Score Today</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Available Post-UTME Papers
          </h2>
          {/* The university picker was removed: Post-UTME serves only the
              University of Ilorin, so every paper below is UNILORIN. */}
          <span className="px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-semibold text-gray-900 dark:text-white shadow-sm">
            {POST_UTME_UNIVERSITY_NAME}
          </span>
        </div>

        {sessionClosed && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-amber-800 dark:text-amber-300">
                The Post-UTME session is currently closed
              </div>
              <div className="text-xs text-amber-700 dark:text-amber-400/80 mt-0.5">
                New practice sittings are paused for now. Your papers and previous results are
                unchanged and will be available again when the session reopens.
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredExams.map((exam) => (
            <div 
              key={exam.id}
              className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    {exam.university}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> {exam.year || 'General'}
                  </span>
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base leading-snug">{exam.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Subject: <strong className="text-gray-700 dark:text-gray-300">{exam.subject}</strong></p>
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <Clock className="w-4 h-4 text-indigo-500" /> {exam.duration_minutes} Minutes
                </span>
                <button
                  onClick={() => handleStartTest(exam)}
                  disabled={loading || sessionClosed}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm flex items-center gap-2 shadow-sm transition-all"
                >
                  <Play className="w-4 h-4 fill-current" /> {sessionClosed ? 'Session Closed' : 'Start Drill'}
                </button>
              </div>
            </div>
          ))}

          {filteredExams.length === 0 && !loading && (
            <div className="col-span-full text-center py-20 text-gray-400">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-base font-medium">No published Post-UTME papers available right now.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (testState === 'testing' && questions.length > 0) {
    const currentQ = questions[currentIndex];
    const answeredCount = Object.keys(answers).length;

    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Test Header */}
        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4 sticky top-4 z-20">
          <div>
            <span className="text-xs font-bold px-2.5 py-1 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
              {selectedExam?.university}
            </span>
            <h2 className="font-bold text-gray-900 dark:text-white text-base mt-1">{selectedExam?.title}</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono font-bold text-sm ${
              timeLeft < 300 ? 'bg-rose-50 text-rose-600 animate-pulse border border-rose-200' : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white'
            }`}>
              <Clock className="w-4 h-4" /> {formatTime(timeLeft)}
            </div>
            <button
              onClick={() => { if (confirm('Are you sure you want to submit your test?')) handleSubmitTest(); }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-sm shadow-sm"
            >
              Submit Exam
            </button>
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <span className="text-xs text-gray-500">
              Answered: {answeredCount}/{questions.length}
            </span>
          </div>

          <p className="text-lg font-semibold text-gray-900 dark:text-white leading-relaxed">
            {currentQ.question_text}
          </p>

          <div className="space-y-3">
            {['A', 'B', 'C', 'D'].map((opt) => {
              const optKey = `option_${opt.toLowerCase()}` as keyof Question;
              const isSelected = answers[currentQ.id] === opt;
              return (
                <button
                  key={opt}
                  onClick={() => handleSelectOption(currentQ.id, opt)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4 ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-950 dark:text-indigo-100 shadow-sm'
                      : 'bg-gray-50/50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-800 dark:text-gray-200'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-xl font-bold text-sm flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                  }`}>
                    {opt}
                  </span>
                  <span className="text-sm font-medium">{String(currentQ[optKey])}</span>
                </button>
              );
            })}
          </div>

          {/* Navigation Bar */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 disabled:opacity-40 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Previous
            </button>
            <button
              onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
              disabled={currentIndex === questions.length - 1}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium shadow-sm flex items-center gap-2"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Question Quick Palette */}
        <div className="bg-white dark:bg-gray-955 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 flex flex-wrap gap-2 justify-center">
          {questions.map((q, idx) => {
            const isAnswered = !!answers[q.id];
            const isCurrent = idx === currentIndex;
            return (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(idx)}
                className={`w-9 h-9 rounded-xl font-bold text-xs flex items-center justify-center transition-all ${
                  isCurrent
                    ? 'ring-2 ring-indigo-600 ring-offset-2 bg-indigo-600 text-white'
                    : isAnswered
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (testState === 'results' && testResult) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 text-center space-y-4">
          <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <Award className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">Post-UTME Drill Completed!</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{selectedExam?.title}</p>

          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto py-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl">
              <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{testResult.score}%</span>
              <p className="text-xs text-gray-500 mt-1 font-medium">Final Score</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{testResult.totalCorrect}</span>
              <p className="text-xs text-gray-500 mt-1 font-medium">Correct</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl">
              <span className="text-2xl font-black text-rose-600 dark:text-rose-400">{testResult.totalWrong}</span>
              <p className="text-xs text-gray-500 mt-1 font-medium">Incorrect</p>
            </div>
          </div>

          <button
            onClick={() => { setTestState('selecting'); setSelectedExam(null); }}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm shadow-sm"
          >
            Back to Post-UTME Papers
          </button>
        </div>

        {/* Review Questions */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Detailed Answer Review</h3>
          {testResult.results.map((r, idx) => (
            <div key={r.id} className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-gray-900 dark:text-white">Question {idx + 1}</span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 ${
                  r.is_correct ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400'
                }`}>
                  {r.is_correct ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {r.is_correct ? 'Correct' : 'Incorrect'}
                </span>
              </div>

              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.question_text}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {['A', 'B', 'C', 'D'].map(opt => {
                  const optKey = `option_${opt.toLowerCase()}` as keyof typeof r;
                  const isUserAns = r.student_answer === opt;
                  const isCorrectAns = r.correct_option === opt;

                  let style = 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300';
                  if (isCorrectAns) style = 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500/50 text-emerald-900 dark:text-emerald-200 font-bold';
                  else if (isUserAns && !isCorrectAns) style = 'bg-rose-50 dark:bg-rose-950/40 border-rose-500/50 text-rose-900 dark:text-rose-200 font-bold';

                  return (
                    <div key={opt} className={`p-2.5 rounded-xl border ${style}`}>
                      <span className="font-bold mr-2">{opt}:</span> {String(r[optKey])}
                      {isCorrectAns && <span className="float-right text-emerald-600 text-xs">Correct Answer</span>}
                      {isUserAns && !isCorrectAns && <span className="float-right text-rose-600 text-xs">Your Answer</span>}
                    </div>
                  );
                })}
              </div>

              {r.explanation && (
                <div className="text-xs bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-300 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/50 mt-2">
                  <span className="font-bold">Explanation:</span> {r.explanation}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
