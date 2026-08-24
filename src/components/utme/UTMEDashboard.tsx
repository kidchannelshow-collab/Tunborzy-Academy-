import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Clock, Award, CheckCircle2, Play, FileText, ChevronRight, History, ArrowLeft, RefreshCw, BarChart2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useProfile } from '../../lib/useProfile';

interface UTMEDashboardProps {
  onStartExam: (config: any) => void;
  onViewHistory: () => void;
}

export default function UTMEDashboard({ onStartExam, onViewHistory }: UTMEDashboardProps) {
  const { profile } = useProfile();
  const [subjects, setSubjects] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const todayStats = React.useMemo(() => {
    if (!profile || history.length === 0) {
      return { coursesToday: 0, cbtTakenToday: 0, avgScoreToday: 0 };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayAttempts = history.filter(h => {
      const d = new Date(h.created_at);
      return d >= today;
    });

    const distinctSubjects = new Set(todayAttempts.map(a => a.subject_id)).size;
    const cbtTaken = todayAttempts.length;

    let scoreSum = 0;
    let scoreCount = 0;
    todayAttempts.forEach(a => {
      const val = a.score !== null && a.score !== undefined ? a.score : a.percentage;
      if (val !== null && val !== undefined) {
        scoreSum += Number(val);
        scoreCount++;
      }
    });
    const avgScore = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0;

    return {
      coursesToday: distinctSubjects,
      cbtTakenToday: cbtTaken,
      avgScoreToday: avgScore
    };
  }, [history, profile]);
  
  const [selectedSubject, setSelectedSubject] = useState<any | null>(null);
  const [selectedMode, setSelectedMode] = useState<'full' | 'topic' | 'random'>('full');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [availableDifficulties, setAvailableDifficulties] = useState<string[]>([]);
  const [availableQuestionsCount, setAvailableQuestionsCount] = useState<number>(0);
  const [questionCount, setQuestionCount] = useState(25);
  const [durationMinutes, setDurationMinutes] = useState(30);

  const OFFICIAL_UTME_SUBJECTS = [
    { id: 'utme_mth', code: 'MTH', name: 'MATHEMATICS', description: 'Core UTME Mathematics covering algebra, calculus, and statistics.' },
    { id: 'utme_eng', code: 'ENG', name: 'USES OF ENGLISH', description: 'Comprehension, grammar, lexical items, and oral forms.' },
    { id: 'utme_chm', code: 'CHM', name: 'CHEMISTRY', description: 'Physical, organic, and inorganic chemistry principles.' },
    { id: 'utme_phy', code: 'PHY', name: 'PHYSICS', description: 'Mechanics, thermodynamics, optics, and electromagnetism.' },
    { id: 'utme_bio', code: 'BIO', name: 'BIOLOGY', description: 'Cell biology, genetics, ecology, and anatomy.' }
  ];

  const OFFICIAL_POST_UTME_SUBJECTS = [
    { id: 'p_eng', code: 'ENG', name: 'USES OF ENGLISH', description: 'Post-UTME Screening Use of English.' },
    { id: 'p_mth', code: 'MTH', name: 'MATHEMATICS', description: 'Post-UTME Screening Mathematics.' },
    { id: 'p_gen', code: 'GEN', name: 'GENERAL PAPER', description: 'General aptitude, current affairs, and reasoning.' }
  ];

  useEffect(() => {
    fetchData();
  }, [profile]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const isPostUtme = profile?.portal === 'Post-UTME';
      const defaultSubjects = isPostUtme ? OFFICIAL_POST_UTME_SUBJECTS : OFFICIAL_UTME_SUBJECTS;

      // Fetch subjects that have published questions or all active
      const { data: subData } = await supabase
        .from('utme_subjects')
        .select('*')
        .eq('is_active', true);
      
      if (subData && subData.length > 0) {
        if (isPostUtme) {
          const filtered = subData.filter(s => ['USES OF ENGLISH', 'MATHEMATICS', 'GENERAL PAPER'].includes(s.name));
          setSubjects(filtered.length > 0 ? filtered : defaultSubjects);
        } else {
          setSubjects(subData);
        }
      } else {
        setSubjects(defaultSubjects);
      }

      // Fetch history for student
      if (profile) {
        const { data: histData } = await supabase
          .from('utme_attempts')
          .select('*, utme_subjects(name)')
          .eq('student_id', profile.id)
          .order('created_at', { ascending: false });
        
        setHistory(histData || []);
      }
    } catch (err) {
      console.error(err);
      const isPostUtme = profile?.portal === 'Post-UTME';
      setSubjects(isPostUtme ? OFFICIAL_POST_UTME_SUBJECTS : OFFICIAL_UTME_SUBJECTS);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSubject = async (sub: any) => {
    setSelectedSubject(sub);
    setSelectedTopicId('');
    setSelectedYear('all');
    setSelectedDifficulty('all');
    // Fetch topics for this subject
    const { data } = await supabase
      .from('utme_topics')
      .select('*')
      .eq('subject_id', sub.id);
    
    setTopics(data || []);

    // Fetch questions for this subject to extract years and difficulties
    const { data: qData } = await supabase
      .from('utme_questions')
      .select('year, difficulty')
      .eq('subject_id', sub.id)
      .eq('status', 'published');

    if (qData) {
      const yrs = Array.from(new Set(qData.map(q => q.year).filter(Boolean))) as string[];
      setAvailableYears(yrs.sort().reverse());
      const diffs = Array.from(new Set(qData.map(q => q.difficulty).filter(Boolean))) as string[];
      setAvailableDifficulties(diffs);
    }
  };

  useEffect(() => {
    async function updateCount() {
      if (!selectedSubject) return;
      let query = supabase.from('utme_questions')
        .select('*', { count: 'exact', head: true })
        .eq('subject_id', selectedSubject.id)
        .eq('status', 'published');

      if (selectedMode === 'topic' && selectedTopicId) {
        query = query.eq('topic_id', selectedTopicId);
      }
      if (selectedYear !== 'all') {
        query = query.eq('year', selectedYear);
      }
      if (selectedDifficulty !== 'all') {
        query = query.eq('difficulty', selectedDifficulty);
      }

      const { count } = await query;
      const total = count || 0;
      setAvailableQuestionsCount(total);
      if (questionCount > total && total > 0) {
        setQuestionCount(Math.min(25, total));
      }
    }
    updateCount();
  }, [selectedSubject, selectedMode, selectedTopicId, selectedYear, selectedDifficulty]);

  const handleStart = () => {
    if (!selectedSubject) return;
    onStartExam({
      subjectId: selectedSubject.id,
      subjectName: selectedSubject.name,
      mode: selectedMode,
      topicId: selectedTopicId,
      year: selectedYear,
      difficulty: selectedDifficulty,
      count: questionCount,
      time: durationMinutes
    });
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-emerald-900/40 via-teal-900/20 to-slate-900 border border-emerald-500/20 p-8 rounded-3xl backdrop-blur-md">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
            UTME CBT Center
          </span>
          <h1 className="text-3xl font-display font-bold text-white mt-2">JAMB UTME Preparation</h1>
          <p className="text-slate-400 mt-1">Practice with authentic questions across core UTME subjects under timed conditions.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex items-center gap-3">
            <Award className="text-emerald-400" size={28} />
            <div>
              <div className="text-xs text-slate-400">Total Attempts</div>
              <div className="text-xl font-bold text-white">{history.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Progress Section */}
      {!selectedSubject && (
        <div className="space-y-4">
          <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <Clock className="text-emerald-400" size={20} /> Today's Progress
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
      )}

      {!selectedSubject ? (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <BookOpen className="text-emerald-400" size={24} /> Select a UTME Subject
          </h2>

          {loading ? (
            <div className="flex justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div></div>
          ) : subjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {subjects.map(sub => (
                <motion.div
                  key={sub.id}
                  whileHover={{ y: -4, scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleSelectSubject(sub)}
                  className="bg-[#0f172a] border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-6 cursor-pointer group transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold mb-4 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
                      {sub.code}
                    </div>
                    <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">{sub.name}</h3>
                    <p className="text-sm text-slate-400 mt-2 line-clamp-2">{sub.description || 'Comprehensive UTME questions and practice exams.'}</p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-sm text-emerald-400 font-medium">
                    <span>Start Practice</span>
                    <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-[#0f172a] border border-slate-800 rounded-3xl">
              <p className="text-slate-400">No UTME subjects are currently available.</p>
            </div>
          )}

          {/* Recent History Preview */}
          {history.length > 0 && (
            <div className="mt-12 space-y-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <History className="text-emerald-400" size={20} /> Recent Practice History
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {history.slice(0, 3).map(h => (
                  <div key={h.id} className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">{h.utme_subjects?.name || 'UTME Drill'}</div>
                      <div className="text-xs text-slate-400">{new Date(h.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-emerald-400">{h.score}%</div>
                      <div className="text-xs text-slate-500">{h.total_correct}/{h.total_correct + h.total_wrong} Correct</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedSubject(null)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider">{selectedSubject.code}</span>
              <h2 className="text-2xl font-bold text-white">{selectedSubject.name} — Configuration</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white">Select Practice Mode</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { id: 'full', label: 'Full Subject Drill', desc: 'Random questions across all topics' },
                    { id: 'topic', label: 'Topic Drill', desc: 'Focus on a specific topic' },
                    { id: 'random', label: 'Random Practice', desc: 'Mixed difficulty rapid-fire' }
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMode(m.id as any)}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        selectedMode === m.id 
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-300' 
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-bold text-white mb-1">{m.label}</div>
                      <div className="text-xs text-slate-400">{m.desc}</div>
                    </button>
                  ))}
                </div>

                {selectedMode === 'topic' && (
                  <div className="space-y-3 pt-4 border-t border-slate-800">
                    <label className="text-sm font-medium text-slate-300">Choose Topic</label>
                    {topics.length > 0 ? (
                      <select
                        value={selectedTopicId}
                        onChange={(e) => setSelectedTopicId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Select a topic...</option>
                        {topics.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm text-amber-400">No topics available for this subject yet.</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
                  <div>
                    <label className="text-sm font-medium text-slate-300 block mb-2">Year Filter</label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500 text-sm"
                    >
                      <option value="all">All Years</option>
                      {availableYears.map(yr => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-300 block mb-2">Difficulty</label>
                    <select
                      value={selectedDifficulty}
                      onChange={(e) => setSelectedDifficulty(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500 text-sm capitalize"
                    >
                      <option value="all">All Difficulties</option>
                      {availableDifficulties.map(diff => (
                        <option key={diff} value={diff} className="capitalize">{diff}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-2 text-xs text-slate-400 flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                  <span>Matching Questions Available:</span>
                  <span className="font-bold text-emerald-400">{availableQuestionsCount} Questions</span>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 space-y-6 sticky top-24">
                <h3 className="text-lg font-bold text-white">Drill Parameters</h3>

                <div>
                  <label className="flex justify-between text-sm text-slate-400 mb-2">
                    <span>Question Count</span>
                    <span className="text-white font-bold">{questionCount} Qs</span>
                  </label>
                  <input
                    type="range"
                    min="5" 
                    max={Math.max(10, availableQuestionsCount || 50)} 
                    step="5"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                  {availableQuestionsCount === 0 && (
                    <p className="text-xs text-rose-400 mt-1">No questions match your selected filters.</p>
                  )}
                </div>

                <div>
                  <label className="flex justify-between text-sm text-slate-400 mb-2">
                    <span>Duration</span>
                    <span className="text-white font-bold">{durationMinutes} Mins</span>
                  </label>
                  <input
                    type="range"
                    min="10" max="90" step="5"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>

                <button
                  onClick={handleStart}
                  disabled={(selectedMode === 'topic' && topics.length > 0 && !selectedTopicId) || availableQuestionsCount === 0}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <Play size={20} /> Start UTME Exam
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
