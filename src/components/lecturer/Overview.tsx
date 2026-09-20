import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BookOpen, FileText, Library, Users, Calendar } from 'lucide-react';
import { useProfile } from '../../lib/useProfile';
import { supabase } from '../../supabaseClient';

export default function Overview() {
  const { profile } = useProfile();
  const displayName = profile?.full_name || "Lecturer";
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  const [stats, setStats] = useState({
    courses: 0,
    active_courses: 0,
    cbt: 0,
    students: 0
  });

  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  useEffect(() => {
    if (profile) {
      fetchStats();
      fetchRecentActivity();
    }
  }, [profile?.id, profile?.role]);

  // Real average across completed sittings on this lecturer's own exams.
  // The panel used to print a hardcoded "78%" with a "+5% from last semester"
  // that no query ever produced.
  const [avgPerformance, setAvgPerformance] = useState<{ avg: number; sittings: number }>({
    avg: 0,
    sittings: 0,
  });

  const fetchStats = async () => {
    if (!supabase || !profile) return;
    try {
      const [coursesRes, cbtRes, enrollmentsRes] = await Promise.all([
        supabase.from('courses').select('id, is_archived').eq('lecturer_id', profile.id),
        // lecturer/CBTManagement.tsx writes cbt_exams with `created_by`, not
        // `lecturer_id` (no such column), so counting by lecturer_id always
        // reported 0 exams.
        supabase.from('cbt_exams').select('id', { count: 'exact', head: true }).eq('created_by', profile.id),
        supabase.from('course_enrollments').select('student_id, courses!inner(lecturer_id)').eq('courses.lecturer_id', profile.id)
      ]);
      
      const courses = coursesRes.data || [];
      const uniqueStudentCount = new Set((enrollmentsRes.data || []).map((e: any) => e.student_id)).size;
      
      setStats({
        courses: courses.length,
        active_courses: courses.filter(c => !c.is_archived).length,
        cbt: cbtRes.count || 0,
        students: uniqueStudentCount
      });

      // Average student performance across this lecturer's exams. Scoped by
      // `created_by` for the same reason the CBT count above is — cbt_exams has
      // no lecturer_id column. `score` is already a 0–100 percentage.
      const { data: ownExams } = await supabase
        .from('cbt_exams')
        .select('id')
        .eq('created_by', profile.id);
      const examIds = (ownExams || []).map((e: any) => e.id);

      if (examIds.length === 0) {
        setAvgPerformance({ avg: 0, sittings: 0 });
      } else {
        const { data: sittings } = await supabase
          .from('cbt_attempts')
          .select('score')
          .eq('status', 'completed')
          .not('score', 'is', null)
          .in('exam_id', examIds);

        const scores = (sittings || [])
          .map((s: any) => Number(s.score))
          .filter((n: number) => !Number.isNaN(n));
        setAvgPerformance({
          avg: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
          sittings: scores.length,
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRecentActivity = async () => {
    if (!supabase || !profile) return;
    try {
      const { data } = await supabase.from('courses').select('title, created_at').eq('lecturer_id', profile.id).order('created_at', { ascending: false }).limit(5);
      if (data && data.length > 0) {
        setRecentActivities(data.map((c, i) => ({ id: i, type: 'course', text: `You created ${c.title}`, time: new Date(c.created_at).toLocaleDateString(), icon: BookOpen, color: 'text-emerald-500' })));
      } else {
        setRecentActivities([]);
      }
    } catch (err) { console.error(err); }
  };

  const STATS_DATA = [
    { label: 'Total Courses', value: stats.courses, icon: BookOpen, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { label: 'Active Courses', value: stats.active_courses, icon: Library, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Total Students', value: stats.students, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'CBT Exams Created', value: stats.cbt, icon: FileText, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-7xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
            <Calendar size={14} />
            <span>{today}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white mb-2">
            {greeting}, {displayName}
          </h1>
          <p className="text-sm font-body text-slate-400">
            Manage your courses and track student performance.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        {STATS_DATA.map((stat, idx) => (
          <div key={idx} className="bg-[#0f172a]/80 backdrop-blur-md border border-slate-800 rounded-3xl p-6 hover:border-slate-700 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 rounded-2xl ${stat.bg} flex items-center justify-center`}>
                <stat.icon size={24} className={stat.color} />
              </div>
            </div>
            <h3 className="text-3xl font-display font-bold text-white mb-1">{stat.value}</h3>
            <p className="text-sm text-slate-400 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0f172a] border border-slate-800 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-display font-bold text-white">Average Student Performance</h3>
            <select className="bg-slate-900 border border-slate-800 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-500">
              <option>This Semester</option>
              <option>Last Semester</option>
              <option>All Time</option>
            </select>
          </div>
          
          <div className="h-64 flex items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl">
             {avgPerformance.sittings > 0 ? (
               <div className="text-center">
                 <div className="text-4xl mb-4 text-emerald-500 font-bold">{avgPerformance.avg}%</div>
                 <p className="text-slate-400 text-sm">Average across all your courses</p>
                 <p className="text-xs text-slate-500 mt-2">
                   From {avgPerformance.sittings} completed sitting
                   {avgPerformance.sittings === 1 ? '' : 's'}
                 </p>
               </div>
             ) : (
               <div className="text-center px-6">
                 <div className="text-4xl mb-4 text-slate-600 font-bold">—</div>
                 <p className="text-slate-400 text-sm">No completed sittings yet</p>
                 <p className="text-xs text-slate-500 mt-2">
                   Averages appear once students take one of your CBT exams.
                 </p>
               </div>
             )}
          </div>
        </div>

        <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 shadow-xl">
          <h3 className="text-xl font-display font-bold text-white mb-6">Recent Activity</h3>
          
          <div className="space-y-6">
            {recentActivities.length > 0 ? recentActivities.map((activity) => (
              <div key={activity.id} className="flex gap-4">
                <div className={`w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center shrink-0 border border-slate-800 ${activity.color}`}>
                  <activity.icon size={16} />
                </div>
                <div>
                  <p className="text-sm text-slate-300 font-medium leading-snug">{activity.text}</p>
                  <p className="text-xs text-slate-500 mt-1">{activity.time}</p>
                </div>
              </div>
            )) : (
              <div className="text-center py-8">
                <p className="text-slate-400 font-medium">No recent activity.</p>
              </div>
            )}
          </div>
          
          <button className="w-full mt-6 py-3 border border-slate-800 rounded-xl text-slate-400 text-sm font-semibold hover:text-white hover:bg-slate-800 transition-colors">
            View All Activity
          </button>
        </div>
      </div>
    </motion.div>
  );
}
