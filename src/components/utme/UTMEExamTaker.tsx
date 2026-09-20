import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, Clock, Flag, Send, AlertTriangle, Maximize, Minimize } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { notificationService } from '../../lib/notificationService';
import { useProfile } from '../../lib/useProfile';

interface UTMEExamTakerProps {
  config: {
    subjectId: string;
    subjectName: string;
    mode: string;
    topicId?: string;
    count: number;
    time: number;
  };
  onFinish: (resultData: any) => void;
  onCancel: () => void;
}

export default function UTMEExamTaker({ config, onFinish, onCancel }: UTMEExamTakerProps) {
  const { profile } = useProfile();
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [timeLeft, setTimeLeft] = useState(config.time * 60);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);

  // React StrictMode (src/main.tsx) mounts, unmounts and remounts every
  // component in development, so this effect runs twice for one sitting and each
  // run POSTs /api/utme/start. Guarding on the identity of the sitting keeps the
  // effect re-runnable when the student genuinely starts a different exam, while
  // stopping the duplicate call that used to record a second attempt.
  const startedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const startKey = `${config.subjectId}|${config.mode}|${config.topicId ?? ''}|${config.count}|${config.time}`;
    if (startedKeyRef.current === startKey) return;
    startedKeyRef.current = startKey;

    async function initExam() {
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const token = session?.access_token;

        const res = await fetch('/api/utme/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(config)
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setQuestions(data.questions || []);
        setAttemptId(data.attemptId);
      } catch (err) {
        console.error(err);
        alert('Failed to start UTME exam.');
        onCancel();
      } finally {
        setLoading(false);
      }
    }

    initExam();
  }, [config]);

  useEffect(() => {
    if (loading || timeLeft <= 0 || submitting) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [loading, timeLeft, submitting]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
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

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;

      const res = await fetch('/api/utme/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          attemptId,
          subjectId: config.subjectId,
          mode: config.mode,
          answers,
          timeUsed: (config.time * 60) - timeLeft
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (profile) {
        await notificationService.notifyUser({
          userId: profile.id,
          title: 'UTME Practice Completed',
          message: `Score: ${data.score}% in ${config.subjectName}`,
          type: 'result',
          link: '/utme'
        });
      }

      onFinish(data);
    } catch (err) {
      console.error(err);
      alert('Error submitting UTME exam.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin h-10 w-10 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
          <p className="text-slate-400 font-medium">Preparing UTME CBT Environment...</p>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-20 bg-[#0f172a] border border-slate-800 rounded-3xl p-8">
        <AlertTriangle size={48} className="mx-auto text-amber-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">No Questions Available</h2>
        <p className="text-slate-400 mb-6">There are currently no published questions matching your criteria for {config.subjectName}.</p>
        <button onClick={onCancel} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const currentQ = questions[currentIdx];

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      {/* Top Navigation / Timer Bar */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 sticky top-4 z-20 backdrop-blur-md">
        <div>
          <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider">{config.subjectName}</span>
          <h2 className="text-lg font-bold text-white">UTME Practice Examination</h2>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-xl border border-slate-800 text-emerald-400 font-mono font-bold">
            <Clock size={18} />
            <span>{formatTime(timeLeft)}</span>
          </div>

          <button
            onClick={() => setShowConfirm(true)}
            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl transition-colors text-sm"
          >
            Submit Exam
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Question Area */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <span className="text-sm font-bold text-slate-400">
                Question {currentIdx + 1} of {questions.length}
              </span>
              <button
                onClick={toggleFlag}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  flags[currentQ.id] ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-900 text-slate-400 border border-slate-800'
                }`}
              >
                <Flag size={14} /> {flags[currentQ.id] ? 'Flagged' : 'Flag for review'}
              </button>
            </div>

            <div className="text-lg md:text-xl font-medium text-white leading-relaxed">
              {currentQ.question_text}
            </div>

            <div className="space-y-3 pt-2">
              {[
                { letter: 'A', text: currentQ.option_a },
                { letter: 'B', text: currentQ.option_b },
                { letter: 'C', text: currentQ.option_c },
                { letter: 'D', text: currentQ.option_d }
              ].map(opt => {
                const isSelected = answers[currentQ.id] === opt.letter;
                return (
                  <button
                    key={opt.letter}
                    onClick={() => handleSelectOption(opt.letter)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4 ${
                      isSelected 
                        ? 'border-emerald-500 bg-emerald-500/10 text-white font-medium' 
                        : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm border ${
                      isSelected ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-slate-700 text-slate-400'
                    }`}>
                      {opt.letter}
                    </div>
                    <div className="flex-1">{opt.text}</div>
                  </button>
                );
              })}
            </div>

            {/* Bottom Nav Controls */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-800">
              <button
                onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
                disabled={currentIdx === 0}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors flex items-center gap-2 text-sm"
              >
                <ArrowLeft size={16} /> Previous
              </button>

              <button
                onClick={() => setCurrentIdx(prev => Math.min(questions.length - 1, prev + 1))}
                disabled={currentIdx === questions.length - 1}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold rounded-xl transition-colors flex items-center gap-2 text-sm"
              >
                Next <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Question Palette Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 space-y-4">
            <h3 className="font-bold text-white text-sm uppercase tracking-wider">Question Navigator</h3>
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isAnswered = answers[q.id];
                const isFlagged = flags[q.id];
                const isCurrent = currentIdx === idx;

                let btnStyle = "bg-slate-900 border-slate-800 text-slate-400";
                if (isCurrent) btnStyle = "border-emerald-500 text-white bg-emerald-500/20 ring-2 ring-emerald-500/40";
                else if (isAnswered) btnStyle = "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold";
                else if (isFlagged) btnStyle = "bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold";

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIdx(idx)}
                    className={`h-10 rounded-xl border flex items-center justify-center text-xs font-bold transition-all ${btnStyle}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500"></div> Answered</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500"></div> Flagged</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-slate-900 border border-slate-800"></div> Unanswered</div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-[#0f172a] border border-slate-800 rounded-3xl p-8 max-w-md w-full space-y-6">
            <h3 className="text-2xl font-bold text-white">Ready to Submit?</h3>
            <p className="text-slate-400">
              You have answered <span className="text-emerald-400 font-bold">{Object.keys(answers).length}</span> out of <span className="text-white font-bold">{questions.length}</span> questions. Once submitted, you cannot change your answers.
            </p>
            <div className="flex gap-4">
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl">
                Continue Exam
              </button>
              <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl">
                {submitting ? 'Submitting...' : 'Confirm Submit'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
