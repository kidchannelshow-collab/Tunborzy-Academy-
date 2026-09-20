import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Award, RotateCcw, Eye } from 'lucide-react';
import UTMEAttemptReview from './UTMEAttemptReview';

interface UTMEResultViewProps {
  result: {
    score: number;
    totalCorrect: number;
    totalWrong: number;
    totalUnanswered: number;
    totalQuestions: number;
    timeUsed: number;
    results: any[];
  };
  onRetry: () => void;
  onBack: () => void;
}

export default function UTMEResultView({ result, onRetry, onBack }: UTMEResultViewProps) {
  const [showReview, setShowReview] = useState(false);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      {!showReview ? (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-400">
              <Award size={40} />
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
                Practice Completed
              </span>
              <h1 className="text-4xl font-display font-bold text-white mt-3">{result.score}%</h1>
              <p className="text-slate-400 mt-1">Your UTME examination performance summary</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <div className="text-sm text-slate-400">Total Questions</div>
                <div className="text-2xl font-bold text-white mt-1">{result.totalQuestions}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <div className="text-sm text-emerald-400">Correct</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">{result.totalCorrect}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <div className="text-sm text-rose-400">Incorrect</div>
                <div className="text-2xl font-bold text-rose-400 mt-1">{result.totalWrong}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <div className="text-sm text-slate-400">Time Used</div>
                <div className="text-2xl font-bold text-white mt-1">{formatTime(result.timeUsed)}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 justify-center pt-4">
              <button
                onClick={() => setShowReview(true)}
                className="px-6 py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl flex items-center gap-2 transition-colors"
              >
                <Eye size={18} /> Review Answers
              </button>
              <button
                onClick={onRetry}
                className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl flex items-center gap-2 transition-colors"
              >
                <RotateCcw size={18} /> Try Another Attempt
              </button>
              <button
                onClick={onBack}
                className="px-6 py-3.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold rounded-xl transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </motion.div>
      ) : (
        /* The same review component the saved-history path uses, so a fresh
           attempt and a reopened one page, lay out and read identically. */
        <UTMEAttemptReview
          questions={result.results || []}
          meta={{
            subject: (result as any).subjectName,
            score: result.score,
            totalCorrect: result.totalCorrect,
            totalWrong: result.totalWrong,
            totalUnanswered: result.totalUnanswered,
            timeUsed: result.timeUsed,
          }}
          onBack={() => setShowReview(false)}
          backLabel="Back to Results Summary"
        />
      )}
    </div>
  );
}
