import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

export default function CbtAnalytics() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchResults() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      
      if (userId) {
        const { data, error } = await supabase
          .from('cbt_results')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (!error && data) setResults(data);
      }
      setLoading(false);
    }
    fetchResults();
  }, []);

  if (loading) return <div className="p-6 text-slate-400">Loading your performance analytics...</div>;

  const totalDrills = results.length;
  const averageScore = totalDrills > 0 
    ? Math.round(results.reduce((acc, curr) => acc + (curr.score / curr.total_questions) * 100, 0) / totalDrills) 
    : 0;

  return (
    <div className="max-w-3xl mx-auto p-6 bg-slate-900 rounded-xl border border-slate-800 text-white">
      <h2 className="text-xl font-bold mb-6">Your CBT Drill Analytics</h2>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-800">
          <p className="text-sm text-slate-400">Total Drills Taken</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{totalDrills}</p>
        </div>
        <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-800">
          <p className="text-sm text-slate-400">Average Accuracy</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{averageScore}%</p>
        </div>
      </div>

      {/* History List */}
      <h3 className="text-lg font-semibold mb-4">Recent Test History</h3>
      {results.length === 0 ? (
        <p className="text-slate-400 text-sm">No CBT drill history found yet. Complete a drill to see your stats!</p>
      ) : (
        <div className="space-y-3">
          {results.map((res) => {
            const percentage = Math.round((res.score / res.total_questions) * 100);
            return (
              <div key={res.id} className="flex justify-between items-center p-4 bg-slate-800/30 rounded-lg border border-slate-800">
                <div>
                  <p className="font-semibold text-slate-200">Score: {res.score} / {res.total_questions}</p>
                  <p className="text-xs text-slate-400">{new Date(res.created_at).toLocaleDateString()} at {new Date(res.created_at).toLocaleTimeString()}</p>
                </div>
                <span className={`px-3 py-1 rounded-md text-sm font-bold ${
                  percentage >= 50 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                }`}>
                  {percentage}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
