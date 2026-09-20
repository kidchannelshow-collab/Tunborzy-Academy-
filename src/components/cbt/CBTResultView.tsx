import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Target, Brain, Clock, FileText, CheckCircle2, XCircle, AlertCircle, Share2, Printer, Download } from 'lucide-react';
import { supabase } from '../../supabaseClient';

export default function CBTResultView({ attemptId, onReview, onBackToDashboard }: any) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadResult() {
      try {
        if (attemptId === 'custom-attempt-id') {
          // Read from local storage
          const stored = localStorage.getItem(`cbt_custom_${attemptId}`);
          if (stored) {
            setResult(JSON.parse(stored));
          } else {
             setResult(null);
          }
        } else {
          // Fetch from DB
          const { data, error } = await supabase
            .from('cbt_attempts')
            .select('*, cbt_exams(*)')
            .eq('id', attemptId)
            .single();
          
          if (error) throw error;
          
          if (data) {
             const time_spent = data.end_time ? (new Date(data.end_time).getTime() - new Date(data.start_time).getTime()) / 1000 : 0;
             setResult({ ...data, time_spent });
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadResult();
  }, [attemptId]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin h-10 w-10 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
    </div>;
  }

  if (!result) return <div>Result not found</div>;

  const totalQs = result.total_correct + result.total_wrong + result.total_unanswered;
  const accuracy = totalQs > 0 ? Math.round((result.total_correct / (result.total_correct + result.total_wrong)) * 100) || 0 : 0;
  
  const getGrade = (score: number) => {
    if (score >= 70) return { letter: 'A', color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
    if (score >= 60) return { letter: 'B', color: 'text-blue-500', bg: 'bg-blue-500/10' };
    if (score >= 50) return { letter: 'C', color: 'text-amber-500', bg: 'bg-amber-500/10' };
    if (score >= 45) return { letter: 'D', color: 'text-orange-500', bg: 'bg-orange-500/10' };
    return { letter: 'F', color: 'text-rose-500', bg: 'bg-rose-500/10' };
  };

  const grade = getGrade(result.score);
  
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}m ${s}s`;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBackToDashboard} className="p-2 bg-[#0f172a] text-slate-400 hover:text-white rounded-xl border border-slate-800 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-display font-bold text-white">Assessment Result</h1>
            <p className="text-slate-400">{result.cbt_exams?.title || (result.customConfig ? `Custom Practice: ${result.customConfig.subjects.join(', ')}` : 'Practice Exam')}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button className="p-2 bg-[#0f172a] border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors hidden sm:block">
            <Share2 size={18} />
          </button>
          <button className="p-2 bg-[#0f172a] border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors hidden sm:block">
            <Printer size={18} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/50 text-emerald-500 hover:bg-emerald-500 hover:text-slate-950 rounded-xl font-semibold transition-colors">
            <Download size={18} /> <span className="hidden sm:inline">Download</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-8 text-center flex flex-col items-center justify-center relative overflow-hidden">
            <div className={`absolute top-0 inset-x-0 h-2 ${grade.bg}`}></div>
            <div className="relative mb-4">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-800" />
                <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray="351.8" strokeDashoffset={351.8 - (351.8 * result.score) / 100} className={`${grade.color.replace('text-', 'text-')} transition-all duration-1000 delay-500`} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center flex-col">
                <span className="text-3xl font-bold text-white">{result.score}%</span>
              </div>
            </div>
            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl ${grade.bg} ${grade.color} text-2xl font-bold font-display mb-2`}>
              {grade.letter}
            </div>
            <h2 className="text-xl font-bold text-white">
              {result.score >= 70 ? 'Outstanding!' : result.score >= 50 ? 'Good Effort!' : 'Keep Practicing!'}
            </h2>
          </div>

          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6">
            <h3 className="font-semibold text-white mb-4">Key Metrics</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400">
                  <CheckCircle2 size={16} className="text-emerald-500" /> Correct
                </div>
                <span className="text-white font-bold">{result.total_correct}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400">
                  <XCircle size={16} className="text-rose-500" /> Wrong
                </div>
                <span className="text-white font-bold">{result.total_wrong}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400">
                  <AlertCircle size={16} className="text-amber-500" /> Unanswered
                </div>
                <span className="text-white font-bold">{result.total_unanswered}</span>
              </div>
              <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400">
                  <Target size={16} className="text-blue-500" /> Accuracy
                </div>
                <span className="text-white font-bold">{accuracy}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400">
                  <Clock size={16} className="text-purple-500" /> Time Spent
                </div>
                <span className="text-white font-bold">{formatTime(result.time_spent || 0)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <Brain className="text-amber-500" size={20} /> Performance Insights
            </h3>
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-500 mb-6 text-sm leading-relaxed">
              Based on your performance, you answered {result.total_correct} correctly but missed {result.total_wrong} questions. Your accuracy rate is {accuracy}%. To improve to an A grade, review the topics behind the {result.total_wrong} questions you missed, then take another practice test to track your progress.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button onClick={onReview} className="p-4 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl transition-colors text-left group">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <FileText size={20} />
                </div>
                <h4 className="font-bold text-white mb-1">Review Answers</h4>
                <p className="text-xs text-slate-400">See detailed explanations for every question</p>
              </button>
              
              <button onClick={onBackToDashboard} className="p-4 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl transition-colors text-left group">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Target size={20} />
                </div>
                <h4 className="font-bold text-white mb-1">Retake Test</h4>
                <p className="text-xs text-slate-400">Try again and beat your current score</p>
              </button>
            </div>
          </div>
          

        </div>
      </div>
    </motion.div>
  );
}
