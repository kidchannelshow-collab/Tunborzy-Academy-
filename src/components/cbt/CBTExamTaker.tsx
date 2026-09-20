import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, Clock, Flag, Send, AlertTriangle, Maximize, Minimize, Calculator as CalcIcon } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { notificationService } from '../../lib/notificationService';

import { useProfile } from '../../lib/useProfile';

export default function CBTExamTaker({ examId, attemptId, onFinish, onCancel, customConfig }: any) {
  const { profile } = useProfile();
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCalculator, setShowCalculator] = useState(customConfig?.calculator || false);
  const [actualAttemptId, setActualAttemptId] = useState<string>(attemptId);

  // Identifies the exam this component is currently loading. React StrictMode
  // (src/main.tsx) mounts, unmounts and remounts every component in development,
  // so this effect runs twice for one start — and each run POSTs /api/cbt/start,
  // which used to INSERT a fresh cbt_attempts row. One real sitting was therefore
  // recorded as two CBTs. Guarding on the identity of the exam rather than on a
  // plain boolean keeps the effect re-runnable when the exam genuinely changes.
  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const loadKey = `${examId ?? ''}|${customConfig?.courseCode ?? ''}|${customConfig?.mode ?? ''}|${customConfig?.topic ?? ''}`;
    if (loadedKeyRef.current === loadKey) return;
    loadedKeyRef.current = loadKey;

    async function loadExam() {
      let duration = 30 * 60;
      if (customConfig && customConfig.time) {
        duration = customConfig.time * 60;
      }
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const token = session?.access_token;
        
        if (customConfig && customConfig.backendDrill) {
          const res = await fetch('/api/cbt/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(customConfig)
          });
          const data = await res.json();
          if (data.questions) setQuestions(data.questions);
          if (data.attemptId) setActualAttemptId(data.attemptId);
          setTimeLeft(customConfig.time * 60);
        } else if (examId) {
          const res = await fetch(`/api/cbt/exam/${examId}`, {
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
          });
          const data = await res.json();
          if (data.questions) setQuestions(data.questions);
          if (data.duration) setTimeLeft(data.duration);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadExam();
  }, [examId, customConfig]);

  useEffect(() => {
    if (loading || timeLeft <= 0 || submitting) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          submitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [loading, timeLeft, submitting]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showConfirmSubmit) return;
      if (e.key === 'ArrowRight') setCurrentIdx(p => Math.min(questions.length - 1, p + 1));
      if (e.key === 'ArrowLeft') setCurrentIdx(p => Math.max(0, p - 1));
      if (e.key === 'f') toggleFlag();
      
      // Options A, B, C, D
      const opts = ['a', 'b', 'c', 'd'];
      const q = questions[currentIdx];
      if (q && opts.includes(e.key.toLowerCase())) {
        const idx = opts.indexOf(e.key.toLowerCase());
        const letter = String.fromCharCode(65 + idx);
        handleSelectOption(letter);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [questions, currentIdx, showConfirmSubmit]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen may be blocked by the browser; the exam still works windowed.
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSelectOption = (letter: string) => {
    const q = questions[currentIdx];
    setAnswers({ ...answers, [q.id]: letter });
  };

  const toggleFlag = () => {
    const q = questions[currentIdx];
    setFlags({ ...flags, [q.id]: !flags[q.id] });
  };

  const submitExam = async () => {
    setSubmitting(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      
      const res = await fetch('/api/cbt/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ attemptId: actualAttemptId, answers })
      });
      const data = await res.json();
      
      if (profile && actualAttemptId !== 'custom-attempt-id') {
        await notificationService.notifyUser({
          userId: profile?.id,
          title: 'CBT Completed',
          message: `You have completed the assessment. Score: ${data.score}%`,
          type: 'result',
          link: '/cbt'
        });
      }
      
      // Store result in local storage for the result view to pick up
      localStorage.setItem(`cbt_result_${actualAttemptId}`, JSON.stringify(data));
      
    } catch (e) {
      console.error(e);
    }
    onFinish(actualAttemptId);
  };

  if (loading) {
    return <div className="fixed inset-0 z-50 bg-[#020617] flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
    </div>;
  }

  if (questions.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-[#020617] flex items-center justify-center p-6">
        <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center">
              <AlertTriangle size={32} />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">No Questions Found</h2>
          <p className="text-slate-400 mb-8">We couldn't find any questions matching your selected criteria. Please adjust your configuration and try again.</p>
          <button 
            onClick={onCancel}
            className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const q = questions[currentIdx];
  if (!q) return null;
  const isAnswered = (id: string) => answers[id] !== undefined;
  const isFlagged = (id: string) => flags[id] === true;

  return (
    <div className="fixed inset-0 z-[100] bg-[#020617] flex flex-col font-sans select-none">
      {/* Header */}
      <header className="bg-[#0f172a] border-b border-slate-800 p-3 md:p-4 flex items-center justify-between shadow-md">
        <div>
          <h1 className="text-lg md:text-xl font-display font-bold text-white line-clamp-1">{customConfig ? `Custom Practice: ${customConfig.subjectTitles?.join(', ') || 'Custom Assessment'}` : 'Candidate Assessment'}</h1>
          <p className="text-xs md:text-sm text-slate-400 font-body">{customConfig ? customConfig.type : 'Exam Mode'}</p>
        </div>
        
        <div className="flex items-center gap-3 md:gap-6">
          <div className="hidden md:flex items-center gap-2">
            <button onClick={toggleFullscreen} className="p-2 text-slate-400 hover:text-white transition-colors">
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
            {customConfig?.calculator && (
              <button onClick={() => setShowCalculator(!showCalculator)} className={`p-2 transition-colors ${showCalculator ? 'text-amber-500' : 'text-slate-400 hover:text-white'}`}>
                <CalcIcon size={20} />
              </button>
            )}
          </div>

          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg md:text-xl font-bold border ${timeLeft < 300 ? 'bg-red-500/10 border-red-500/50 text-red-500 animate-pulse' : 'bg-slate-800/80 border-slate-700 text-amber-500'}`}>
            <Clock size={20} />
            {formatTime(timeLeft)}
          </div>
          <button onClick={() => setShowConfirmSubmit(true)} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-action font-bold px-4 md:px-6 py-2 rounded-xl transition-colors flex items-center gap-2 text-sm md:text-base">
            <Send size={18} className="hidden md:block" />
            Submit
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Question Area */}
        <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 custom-scrollbar">
            <div className="max-w-4xl mx-auto space-y-6 md:space-y-8 pb-20">
              <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-2xl border border-slate-800">
                <span className="text-slate-300 font-body font-medium flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-amber-500 font-bold">
                    {currentIdx + 1}
                  </div>
                  of {questions.length}
                </span>
                <button 
                  onClick={toggleFlag}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${isFlagged(q.id) ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:text-white'}`}
                >
                  <Flag size={14} className={isFlagged(q.id) ? "fill-amber-500" : ""} />
                  Flag
                </button>
              </div>

              <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl">
                {/* min-w-0 on the flex children below is what actually stops the
                    horizontal overflow: a flex item defaults to min-width:auto,
                    so it refuses to shrink below its content and a long unbroken
                    token (URL, formula) would otherwise push the card wide.
                    break-words lets such a token wrap instead of escaping. */}
                <h2 className="text-xl md:text-2xl lg:text-3xl font-body text-white leading-relaxed mb-8 break-words min-w-0">
                  {q.question_text}
                </h2>
                {q.image_url && (
                  <img loading="lazy" src={q.image_url} alt="Question Context" className="max-w-full h-auto rounded-xl border border-slate-800 mb-8" />
                )}
                
                <div className="space-y-3">
                  {[ {letter: 'A', text: q.option_a}, {letter: 'B', text: q.option_b}, {letter: 'C', text: q.option_c}, {letter: 'D', text: q.option_d} ].filter(o => o.text).map((opt) => {
                    const isSelected = answers[q.id] === opt.letter;
                    return (
                      <button
                        key={opt.letter}
                        onClick={() => handleSelectOption(opt.letter)}
                        className={`w-full text-left p-4 md:p-5 rounded-xl border-2 transition-all flex items-center gap-4 ${isSelected ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-800 text-slate-300'}`}
                      >
                        <div className={`w-8 h-8 md:w-10 md:h-10 shrink-0 rounded-full flex items-center justify-center font-action font-bold text-sm border-2 transition-colors ${isSelected ? 'bg-amber-500 border-amber-500 text-slate-950' : 'border-slate-600 text-slate-400'}`}>
                          {opt.letter}
                        </div>
                        <div className={`flex-1 min-w-0 break-words text-sm md:text-base leading-relaxed ${isSelected ? 'text-white font-medium' : ''}`}>
                          {opt.text}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Nav Bar */}
          <div className="bg-[#0f172a] border-t border-slate-800 p-4 flex items-center justify-between shrink-0 px-4 md:px-8">
            <button 
              onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
              disabled={currentIdx === 0}
              className="px-5 py-3 md:px-8 md:py-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl font-action font-semibold transition-colors flex items-center gap-2"
            >
              <ArrowLeft size={18} /> <span className="hidden md:inline">Previous</span>
            </button>
            
            {/* Mobile Navigator Trigger */}
            <div className="lg:hidden text-slate-400 text-sm font-medium">
              {Object.keys(answers).length} / {questions.length} Answered
            </div>

            <button 
              onClick={() => setCurrentIdx(prev => Math.min(questions.length - 1, prev + 1))}
              disabled={currentIdx === questions.length - 1}
              className="px-5 py-3 md:px-8 md:py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-xl font-action font-bold transition-colors flex items-center gap-2 shadow-lg shadow-amber-500/20"
            >
              <span className="hidden md:inline">Next</span> <ArrowRight size={18} />
            </button>
          </div>
        </div>

        {/* Sidebar Nav */}
        <aside className="w-80 bg-[#0f172a] border-l border-slate-800 flex flex-col hidden lg:flex">
          <div className="p-5 border-b border-slate-800 bg-slate-900/50 space-y-4">
            <h3 className="font-semibold text-white font-display text-lg">Navigator</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-400 bg-slate-800/50 py-1.5 px-2 rounded">
                <div className="w-3 h-3 rounded-full bg-slate-800 border border-slate-600"></div> 
                <span>Unanswered</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400 bg-emerald-500/10 py-1.5 px-2 rounded">
                <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500"></div> 
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400 bg-amber-500/10 py-1.5 px-2 rounded col-span-2">
                <Flag size={12} className="text-amber-500" /> 
                <span>Flagged for review</span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="space-y-1 pt-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Completion</span>
                <span>{Math.round((Object.keys(answers).length / questions.length) * 100)}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-300" 
                  style={{ width: `${(Object.keys(answers).length / questions.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5 grid grid-cols-5 gap-3 content-start custom-scrollbar">
            {questions.map((_q, idx) => {
              const answered = isAnswered(_q.id);
              const flagged = isFlagged(_q.id);
              const active = currentIdx === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentIdx(idx)}
                  className={`relative w-11 h-11 rounded-xl flex items-center justify-center font-mono text-sm font-bold transition-all border-2 ${
                    active ? 'ring-2 ring-white scale-110 z-10' : 'hover:scale-105'
                  } ${
                    answered ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {idx + 1}
                  {flagged && <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 rounded-full border-2 border-[#0f172a] flex items-center justify-center">
                    <Flag size={8} className="text-[#0f172a] fill-[#0f172a]" />
                  </div>}
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Floating Calculator */}
      <AnimatePresence>
        {showCalculator && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            drag
            dragConstraints={{ left: 0, right: window.innerWidth - 300, top: 0, bottom: window.innerHeight - 400 }}
            className="absolute z-[80] bottom-24 right-8 w-64 bg-[#0f172a] border border-slate-700 rounded-2xl shadow-2xl p-4 cursor-move"
          >
            <div className="text-xs text-slate-400 mb-2 font-medium flex justify-between">
              Calculator <button onClick={() => setShowCalculator(false)}>✕</button>
            </div>
            <div className="h-12 bg-slate-900 rounded-lg mb-4 flex items-center justify-end px-3 text-white font-mono text-lg border border-slate-800">
              0
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['7','8','9','/','4','5','6','*','1','2','3','-','0','.','=','+'].map(btn => (
                <button key={btn} className="h-10 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-mono font-medium transition-colors">
                  {btn}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit Confirmation Modal */}
      <AnimatePresence>
        {showConfirmSubmit && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0f172a] border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center">
                  <AlertTriangle size={32} />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white text-center mb-2">Submit Assessment?</h3>
              <p className="text-slate-400 text-center mb-6">
                You have answered <strong className="text-white">{Object.keys(answers).length}</strong> out of <strong className="text-white">{questions.length}</strong> questions.
              </p>
              
              {Object.keys(answers).length < questions.length && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-sm mb-6 text-center">
                  You have {questions.length - Object.keys(answers).length} unanswered questions.
                </div>
              )}
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowConfirmSubmit(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors"
                >
                  Resume
                </button>
                <button 
                  onClick={submitExam}
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Yes, Submit'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
