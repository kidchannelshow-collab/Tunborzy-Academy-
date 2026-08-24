import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Send, Check, Trash2, Globe, Book, Users, Target } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useProfile } from '../../lib/useProfile';

export default function Announcements() {
  const { profile } = useProfile();
  const [courses, setCourses] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [targetAudience, setTargetAudience] = useState('All');
  const [targetValue, setTargetValue] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (profile) fetchData();
  }, [profile?.id, profile?.role]);

  const fetchData = async () => {
    if (!supabase || !profile) return;
    setLoading(true);
    try {
      const [coursesRes, annRes] = await Promise.all([
        supabase.from('courses').select('id, title, course_code, portal, department').eq('lecturer_id', profile.id),
        supabase.from('announcements').select('*').eq('lecturer_id', profile.id).order('created_at', { ascending: false })
      ]);
      
      setCourses(coursesRes.data || []);
      setAnnouncements(annRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !profile) return;
    setIsSending(true);
    
    try {
      const payload = {
        lecturer_id: profile.id,
        title,
        content,
        target_audience: targetAudience,
        target_value: targetValue || null
      };
      
      const { data, error } = await supabase.from('announcements').insert(payload).select().single();
      
      if (error) throw error;
      
      setAnnouncements([data, ...announcements]);
      setShowSuccess(true);
      setTitle('');
      setContent('');
      
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSending(false);
    }
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('announcements').delete().eq('id', id).select();
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Deletion blocked by RLS policy or record not found.');
      }
      setAnnouncements(announcements.filter(a => a.id !== id));
    } catch (e: any) {
      console.error(e);
      alert('Failed to delete: ' + (e.message || 'Unknown error'));
    }
  };

  const getTargetIcon = (target: string) => {
    switch (target) {
      case 'All': return <Globe size={16} className="text-blue-500" />;
      case 'Portal': return <Target size={16} className="text-purple-500" />;
      case 'Course': return <Book size={16} className="text-emerald-500" />;
      case 'Department': return <Users size={16} className="text-amber-500" />;
      default: return <Bell size={16} className="text-slate-400" />;
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-7xl mx-auto pb-12 space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-white mb-2">Announcements</h1>
        <p className="text-slate-400">Broadcast important information to your students.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 shadow-xl sticky top-8">
            <h2 className="text-xl font-bold text-white mb-6">New Announcement</h2>
            
            <AnimatePresence>
              {showSuccess && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-500">
                  <Check size={20} />
                  <span className="font-bold text-sm">Announcement sent successfully!</span>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-300">Target Audience *</label>
                <select required value={targetAudience} onChange={(e) => { setTargetAudience(e.target.value); setTargetValue(''); }} className="w-full bg-[#020617] border border-slate-800 rounded-xl px-4 py-3 mt-1 text-white focus:outline-none focus:border-amber-500">
                  <option value="All">All My Students</option>
                  <option value="Portal">Specific Portal</option>
                  <option value="Course">Specific Course</option>
                  <option value="Department">Specific Department</option>
                </select>
              </div>

              {targetAudience === 'Portal' && (
                <div>
                  <label className="text-sm font-bold text-slate-300">Select Portal *</label>
                  <select required value={targetValue} onChange={e => setTargetValue(e.target.value)} className="w-full bg-[#020617] border border-slate-800 rounded-xl px-4 py-3 mt-1 text-white focus:outline-none focus:border-amber-500">
                    <option value="">Choose Portal...</option>
                    <option value="Undergraduate">Undergraduate</option>
                    <option value="UTME">UTME</option>
                    <option value="Post-UTME">Post-UTME</option>
                  </select>
                </div>
              )}

              {targetAudience === 'Course' && (
                <div>
                  <label className="text-sm font-bold text-slate-300">Select Course *</label>
                  <select required value={targetValue} onChange={e => setTargetValue(e.target.value)} className="w-full bg-[#020617] border border-slate-800 rounded-xl px-4 py-3 mt-1 text-white focus:outline-none focus:border-amber-500">
                    <option value="">Choose Course...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.course_code ? `${c.course_code} - ` : ''}{c.title}</option>)}
                  </select>
                </div>
              )}

              {targetAudience === 'Department' && (
                <div>
                  <label className="text-sm font-bold text-slate-300">Select Department *</label>
                  <select required value={targetValue} onChange={e => setTargetValue(e.target.value)} className="w-full bg-[#020617] border border-slate-800 rounded-xl px-4 py-3 mt-1 text-white focus:outline-none focus:border-amber-500">
                    <option value="">Choose Department...</option>
                    {Array.from(new Set(courses.filter(c => c.department).map(c => c.department))).map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-sm font-bold text-slate-300">Subject *</label>
                <input required type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-[#020617] border border-slate-800 rounded-xl px-4 py-3 mt-1 text-white focus:outline-none focus:border-amber-500" placeholder="Important Update..." />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-300">Message *</label>
                <textarea required value={content} onChange={e => setContent(e.target.value)} className="w-full h-40 bg-[#020617] border border-slate-800 rounded-xl p-4 mt-1 text-white focus:outline-none focus:border-amber-500 resize-none" placeholder="Type your announcement here..."></textarea>
              </div>

              <button type="submit" disabled={isSending || (targetAudience !== 'All' && !targetValue)} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                {isSending ? <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div> : <Send size={20} />}
                Send Announcement
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-6">Recent Broadcasts</h2>
            
            {loading ? (
              <div className="text-center py-12 text-slate-400">Loading history...</div>
            ) : announcements.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-2xl">
                <Bell size={32} className="mx-auto text-slate-600 mb-4" />
                <p className="text-slate-400 font-medium">You haven't sent any announcements yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {announcements.map(ann => {
                  // Resolve course name if target is Course
                  let targetDisplay = ann.target_value;
                  if (ann.target_audience === 'Course' && ann.target_value) {
                    const c = courses.find(c => c.id === ann.target_value);
                    targetDisplay = c ? c.title : 'Deleted Course';
                  }

                  return (
                    <div key={ann.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 hover:bg-slate-900 transition-colors group">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg bg-slate-800 border border-slate-700`}>
                            {getTargetIcon(ann.target_audience)}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{ann.target_audience}</p>
                            {ann.target_value && <p className="text-[10px] text-slate-500 max-w-[150px] truncate">{targetDisplay}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-xs font-medium text-slate-500">{new Date(ann.created_at).toLocaleString()}</span>
                          <button onClick={() => deleteAnnouncement(ann.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-500 transition-all p-1" title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      
                      <h3 className="text-lg font-bold text-white mb-2">{ann.title}</h3>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{ann.content}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
