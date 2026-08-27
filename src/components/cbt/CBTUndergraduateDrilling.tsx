import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, Award, Layers, Shuffle, ListTree, Play, AlertCircle } from 'lucide-react';
import { supabase } from '../../supabaseClient';

interface CBTUndergraduateDrillingProps {
  onStartDrill: (config: any) => void;
  onBack: () => void;
  onViewAnalytics?: () => void;
}

interface TopicCount {
  name: string;
  count: number;
}

export default function CBTUndergraduateDrilling({ onStartDrill, onBack, onViewAnalytics }: CBTUndergraduateDrillingProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  const [selectedSemester, setSelectedSemester] = useState<'First Semester' | 'Second Semester' | null>(null);
  const [courses, setCourses] = useState<{ code: string, title: string, type: 'Academic' | 'CBT-Only' }[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

  // Practice mode & topics
  const [practiceMode, setPracticeMode] = useState<'random' | 'topic'>('random');
  const [topicsWithCounts, setTopicsWithCounts] = useState<TopicCount[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Configuration
  const [questionCount, setQuestionCount] = useState(20);
  const [isTimed, setIsTimed] = useState(true);
  const [timeMinutes, setTimeMinutes] = useState(30);

  const FIRST_SEMESTER_COURSES = [
    { code: 'CHM 101', title: 'General Chemistry I', type: 'Academic' as const },
    { code: 'PHY 101', title: 'General Physics I', type: 'Academic' as const },
    { code: 'PHY 103', title: 'Physics for Physical Sciences I', type: 'Academic' as const },
    { code: 'MTH 101', title: 'Elementary Mathematics I', type: 'Academic' as const },
    { code: 'MTH 103', title: 'Algebra and Trigonometry', type: 'Academic' as const },
    { code: 'COS 101', title: 'Introduction to Computer Science', type: 'Academic' as const },
    { code: 'PHY 107', title: 'Practical Physics I (CBT)', type: 'CBT-Only' as const },
    { code: 'BIO 107', title: 'General Biology Practical I (CBT)', type: 'CBT-Only' as const },
    { code: 'CHM 107', title: 'Practical Chemistry I (CBT)', type: 'CBT-Only' as const },
  ];

  const SECOND_SEMESTER_COURSES = [
    { code: 'CHM 102', title: 'General Chemistry II', type: 'Academic' as const },
    { code: 'PHY 102', title: 'General Physics II', type: 'Academic' as const },
    { code: 'PHY 104', title: 'Physics for Physical Sciences II', type: 'Academic' as const },
    { code: 'MTH 102', title: 'Elementary Mathematics II', type: 'Academic' as const },
    { code: 'MTH 114', title: 'Introduction to Numerical Methods', type: 'Academic' as const },
    { code: 'CHM 108', title: 'Practical Chemistry II (CBT)', type: 'CBT-Only' as const },
    { code: 'PHY 108', title: 'Practical Physics II (CBT)', type: 'CBT-Only' as const },
  ];

  const handleSemesterSelect = (semester: 'First Semester' | 'Second Semester') => {
    setSelectedSemester(semester);
    setSelectedCourse(null);
    setSelectedTopic(null);
    setCourses(semester === 'First Semester' ? FIRST_SEMESTER_COURSES : SECOND_SEMESTER_COURSES);
    setStep(2);
  };

  const handleCourseSelect = async (courseCode: string) => {
    setSelectedCourse(courseCode);
    setSelectedTopic(null);
    setLoading(true);
    try {
      if (!supabase) return;
      const { data: exams, error: examsErr } = await supabase
        .from('cbt_exams')
        .select('id, course_code, topic')
        .eq('is_published', true);

      if (examsErr) throw examsErr;

      const normalizedRequested = courseCode.replace(/\s+/g, '').toLowerCase();
      const matchedExams = (exams || []).filter(e => {
        if (!e.course_code) return false;
        return e.course_code.replace(/\s+/g, '').toLowerCase() === normalizedRequested;
      });

      const examIds = matchedExams.map(e => e.id);

      if (examIds.length > 0) {
        const { data: questions, error: qErr } = await supabase
          .from('cbt_questions')
          .select('topic')
          .in('exam_id', examIds);

        if (!qErr && questions) {
          const topicMap: Record<string, number> = {};

          matchedExams.forEach(e => {
            if (e.topic) {
              const t = e.topic.trim();
              if (t) topicMap[t] = (topicMap[t] || 0) + 1;
            }
          });

          questions.forEach((q: any) => {
            const t = q.topic ? q.topic.trim() : '';
            const key = (!t || t.toLowerCase() === 'general') ? 'Uncategorized' : t;
            topicMap[key] = (topicMap[key] || 0) + 1;
          });

          const formattedTopics = Object.entries(topicMap).map(([name, count]) => ({ name, count }));
          setTopicsWithCounts(formattedTopics);
        } else {
          setTopicsWithCounts([]);
        }
      } else {
        setTopicsWithCounts([]);
      }
    } catch (err) {
      console.error(err);
      setTopicsWithCounts([]);
    } finally {
      setLoading(false);
      setStep(3);
    }
  };

  const startDrill = () => {
    onStartDrill({
      courseCode: selectedCourse,
      mode: practiceMode,
      topic: practiceMode === 'topic' ? selectedTopic : undefined,
      count: questionCount,
      timed: isTimed,
      time: timeMinutes
    });
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              if (step === 1) onBack();
              else if (step === 2) setStep(1);
              else if (step === 3) setStep(2);
            }}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-display font-bold text-white">Undergraduate CBT Drilling</h1>
            <p className="text-slate-400">Master your semester courses with random or topic-based practice sessions</p>
          </div>
        </div>
        {onViewAnalytics && (
          <button
            onClick={onViewAnalytics}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 border border-slate-700 shadow-sm"
          >
            <Award size={16} className="text-amber-400" /> Performance Analytics
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map(i => (
          <div key={i} className={`h-2 flex-1 rounded-full ${step >= i ? 'bg-amber-500' : 'bg-slate-800'}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-500 text-sm">1</span>
              Select Semester
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(['First Semester', 'Second Semester'] as const).map(sem => (
                <button
                  key={sem}
                  onClick={() => handleSemesterSelect(sem)}
                  className="p-8 bg-[#0f172a] border border-slate-800 hover:border-amber-500/50 rounded-2xl flex flex-col items-start group transition-all text-left shadow-lg"
                >
                  <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl mb-4 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                    <Layers size={28} />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{sem}</h3>
                  <p className="text-sm text-slate-400 mb-6">
                    {sem === 'First Semester' ? 'Access CHM 101, PHY 101, MTH 101, COS 101 & CBT-only practical courses.' : 'Access CHM 102, PHY 102, MTH 102, MTH 114 & CBT-only practical courses.'}
                  </p>
                  <span className="text-xs font-bold text-amber-500 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Select Semester <ChevronRight size={16} />
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-500 text-sm">2</span>
              Select Course ({selectedSemester})
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Academic / Standard Courses</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {courses.filter(c => c.type === 'Academic').map(course => (
                    <button
                      key={course.code}
                      onClick={() => handleCourseSelect(course.code)}
                      className="p-5 bg-[#0f172a] border border-slate-800 hover:border-amber-500/50 rounded-2xl text-left group transition-all"
                    >
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded mb-2 inline-block">
                        {course.code}
                      </span>
                      <h4 className="font-bold text-slate-200 group-hover:text-white text-sm line-clamp-2">{course.title}</h4>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-3">CBT-Only Practical Courses</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {courses.filter(c => c.type === 'CBT-Only').map(course => (
                    <button
                      key={course.code}
                      onClick={() => handleCourseSelect(course.code)}
                      className="p-5 bg-[#0f172a] border border-amber-500/20 hover:border-amber-500/60 rounded-2xl text-left group transition-all bg-gradient-to-br from-amber-500/5 to-transparent"
                    >
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded mb-2 inline-block">
                        {course.code} (CBT-Only)
                      </span>
                      <h4 className="font-bold text-slate-200 group-hover:text-white text-sm line-clamp-2">{course.title}</h4>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-500 text-sm">3</span>
                  Practice Mode ({selectedCourse})
                </h2>
              </div>

              {/* Mode Selection Tabs */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => { setPracticeMode('random'); setSelectedTopic(null); }}
                  className={`p-5 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                    practiceMode === 'random'
                      ? 'bg-amber-500/10 border-amber-500 text-white shadow-lg'
                      : 'bg-[#0f172a] border-slate-800 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={`p-2.5 rounded-xl ${practiceMode === 'random' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                      <Shuffle size={20} />
                    </div>
                    {practiceMode === 'random' && <span className="text-xs font-bold text-amber-400 bg-amber-500/20 px-2.5 py-1 rounded-full">Active</span>}
                  </div>
                  <div>
                    <h3 className="font-bold text-white mb-1">Random CBT</h3>
                    <p className="text-xs text-slate-400">Practice with randomly selected questions from across the entire course.</p>
                  </div>
                </button>

                <button
                  onClick={() => setPracticeMode('topic')}
                  className={`p-5 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                    practiceMode === 'topic'
                      ? 'bg-amber-500/10 border-amber-500 text-white shadow-lg'
                      : 'bg-[#0f172a] border-slate-800 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={`p-2.5 rounded-xl ${practiceMode === 'topic' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                      <ListTree size={20} />
                    </div>
                    {practiceMode === 'topic' && <span className="text-xs font-bold text-amber-400 bg-amber-500/20 px-2.5 py-1 rounded-full">Active</span>}
                  </div>
                  <div>
                    <h3 className="font-bold text-white mb-1">Topic-by-Topic CBT</h3>
                    <p className="text-xs text-slate-400">Choose a specific course topic and focus your practice.</p>
                  </div>
                </button>
              </div>

              {/* Conditional Content based on mode */}
              <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6">
                {practiceMode === 'random' ? (
                  <div className="space-y-4 py-4 text-center sm:text-left">
                    <div className="flex items-center gap-4 bg-slate-900/60 p-5 rounded-xl border border-slate-800">
                      <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl hidden sm:block">
                        <Shuffle size={24} />
                      </div>
                      <div>
                        <h4 className="text-white font-bold mb-1">Randomized Course Drill</h4>
                        <p className="text-sm text-slate-400">Questions will be randomly pulled from all available database records for <span className="text-amber-400 font-semibold">{selectedCourse}</span> without duplication.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium text-slate-300">Available Topics</h3>
                      <span className="text-xs text-slate-400">Select one topic</span>
                    </div>

                    {loading ? (
                      <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-4 border-amber-500 border-t-transparent rounded-full"></div></div>
                    ) : topicsWithCounts.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {topicsWithCounts.map(topic => (
                          <button
                            key={topic.name}
                            onClick={() => setSelectedTopic(topic.name)}
                            className={`p-4 rounded-xl border flex items-center justify-between transition-colors text-left ${
                              selectedTopic === topic.name
                                ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                                selectedTopic === topic.name ? 'bg-amber-500 border-amber-500 text-slate-950 font-bold text-xs' : 'border-slate-600'
                              }`}>
                                {selectedTopic === topic.name && '✓'}
                              </div>
                              <span className="line-clamp-1 font-medium">{topic.name}</span>
                            </div>
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">{topic.count} q</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-slate-900/50 rounded-xl border border-slate-800/80 p-6">
                        <AlertCircle className="mx-auto mb-2 text-amber-400 opacity-80" size={32} />
                        <p className="text-slate-300 font-medium mb-1">No specific topics categorized yet</p>
                        <p className="text-xs text-slate-400 mb-4">You can still practice all course questions using Random CBT mode.</p>
                        <button
                          onClick={() => setPracticeMode('random')}
                          className="px-4 py-2 bg-amber-500 text-slate-950 rounded-xl text-xs font-bold hover:bg-amber-400 transition-colors"
                        >
                          Switch to Random CBT
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 sticky top-24">
                <h3 className="font-bold text-white mb-6">Drill Configuration</h3>
                
                <div className="space-y-6 mb-8">
                  <div>
                    <label className="flex items-center justify-between text-sm text-slate-400 mb-3">
                      <span>Number of Questions</span>
                      <span className="text-white font-bold">{questionCount}</span>
                    </label>
                    <input 
                      type="range" 
                      min="5" max="100" step="5"
                      value={questionCount}
                      onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                      <span>10</span>
                      <span>30</span>
                      <span>50</span>
                      <span>100</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Timed Session</span>
                    <button 
                      onClick={() => setIsTimed(!isTimed)}
                      className={`w-12 h-6 rounded-full p-1 transition-colors ${isTimed ? 'bg-amber-500' : 'bg-slate-700'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isTimed ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {isTimed && (
                    <div>
                      <label className="flex items-center justify-between text-sm text-slate-400 mb-3">
                        <span>Duration (Minutes)</span>
                        <span className="text-white font-bold">{timeMinutes}m</span>
                      </label>
                      <input 
                        type="range" 
                        min="5" max="120" step="5"
                        value={timeMinutes}
                        onChange={(e) => setTimeMinutes(parseInt(e.target.value))}
                        className="w-full accent-amber-500"
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={startDrill}
                  disabled={practiceMode === 'topic' && !selectedTopic}
                  className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-[#0f172a] rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  <Play size={20} />
                  {practiceMode === 'random' ? 'Start Random CBT' : 'Start Topic CBT'}
                </button>
                {practiceMode === 'topic' && !selectedTopic && (
                  <p className="text-xs text-center text-rose-400 mt-3">Please select a topic to start Topic CBT.</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
