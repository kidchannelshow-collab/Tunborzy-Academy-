import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Send, Plus, Trash2, Edit2, Pin, Calendar, Users, Eye, Check, X, Filter, Search } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useProfile } from '../../lib/useProfile';
import { notificationService } from '../../lib/notificationService';

export default function AdminAnnouncements() {
  const { profile } = useProfile();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<any | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('Announcement published successfully!');

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetAudience, setTargetAudience] = useState('All');
  const [category, setCategory] = useState('General Announcement');
  const [priority, setPriority] = useState('Medium');
  const [isPinned, setIsPinned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (profile) fetchAnnouncements();
  }, [profile?.id]);

  const fetchAnnouncements = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err) {
      console.error('Error fetching admin announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !supabase) return;
    setIsSubmitting(true);

    try {
      const payload = {
        title,
        content: content || '',
        body: content || '',
        description: content || '',
        target_audience: targetAudience,
        target_role: targetAudience === 'All' ? 'Student' : targetAudience,
        category,
        priority,
        is_pinned: isPinned,
        admin_id: profile.id,
        created_by: profile.id,
        status: 'Published'
      };

      if (editingAnnouncement) {
        const { error } = await supabase
          .from('announcements')
          .update(payload)
          .eq('id', editingAnnouncement.id);
        if (error) throw error;
        setSuccessMsg('Announcement updated successfully!');
      } else {
        const { error } = await supabase
          .from('announcements')
          .insert(payload);
        if (error) throw error;

        // Send notifications based on target audience
        if (targetAudience === 'All') {
          await notificationService.notifyRole('Student', title, content, 'announcement', '/announcements');
          await notificationService.notifyRole('Lecturer', title, content, 'announcement', '/announcements');
        } else if (targetAudience === 'Lecturers') {
          await notificationService.notifyRole('Lecturer', title, content, 'announcement', '/announcements');
        } else {
          // UTME, Post-UTME, Undergraduate students
          await notificationService.notifyRole('Student', title, content, 'announcement', '/announcements');
        }
        setSuccessMsg('Announcement published and notifications sent!');
      }

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      resetForm();
      fetchAnnouncements();
    } catch (err) {
      console.error('Error saving announcement:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setTargetAudience('All');
    setCategory('General Announcement');
    setPriority('Medium');
    setIsPinned(false);
    setEditingAnnouncement(null);
    setShowCreateModal(false);
  };

  const handleEdit = (ann: any) => {
    setEditingAnnouncement(ann);
    setTitle(ann.title || '');
    setContent(ann.content || ann.description || '');
    setTargetAudience(ann.target_audience || 'All');
    setCategory(ann.category || 'General Announcement');
    setPriority(ann.priority || 'Medium');
    setIsPinned(ann.is_pinned || false);
    setShowCreateModal(true);
  };

  const handleDelete = async (id: string) => {
    console.log('Deleting announcement ID:', id);
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('announcements').delete().eq('id', id).select();
      console.log('Supabase delete response:', { data, error });
      if (error) {
        console.log('Supabase error:', error);
        throw error;
      }
      if (!data || data.length === 0) {
        throw new Error('Deletion blocked by RLS policy or record not found.');
      }
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      alert('Announcement deleted successfully');
    } catch (err: any) {
      console.error('Error deleting announcement:', err);
      console.log('Supabase error:', err);
      alert('Failed to delete announcement: ' + (err.message || 'Unknown error'));
    }
  };

  const togglePin = async (id: string, currentPin: boolean) => {
    try {
      const { error } = await supabase.from('announcements').update({ is_pinned: !currentPin }).eq('id', id);
      if (error) throw error;
      setAnnouncements(announcements.map(a => a.id === id ? { ...a, is_pinned: !currentPin } : a));
    } catch (err) {
      console.error('Error toggling pin:', err);
    }
  };

  const filteredAnnouncements = announcements.filter(ann => {
    if (!searchQuery) return true;
    return ann.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           ann.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           ann.target_audience?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="space-y-8 pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-2">Announcement Management</h1>
          <p className="text-slate-400">Broadcast platform-wide notices, exam alerts, and announcements.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowCreateModal(true); }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-3 rounded-2xl flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all"
        >
          <Plus size={20} /> Create Announcement
        </button>
      </div>

      {/* Search & Stats Bar */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 justify-between items-center shadow-lg">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="text"
            placeholder="Search announcements..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#020617] border border-slate-800 text-white text-sm rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold text-slate-400">
          <span className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/50">
            Total Broadcasts: <strong className="text-white">{announcements.length}</strong>
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Pinned: <strong className="text-indigo-300">{announcements.filter(a => a.is_pinned).length}</strong>
          </span>
        </div>
      </div>

      {/* Announcements List */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading announcements...</div>
      ) : filteredAnnouncements.length === 0 ? (
        <div className="text-center py-20 bg-[#0f172a]/50 border border-slate-800 rounded-3xl">
          <Bell size={40} className="mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-bold text-white mb-1">No Announcements Found</h3>
          <p className="text-sm text-slate-400">Create your first broadcast announcement using the button above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredAnnouncements.map(ann => (
            <motion.div
              key={ann.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-[#0f172a] border ${ann.is_pinned ? 'border-indigo-500/50 bg-indigo-950/10' : 'border-slate-800'} rounded-2xl p-6 shadow-sm hover:border-slate-700 transition-all`}
            >
              <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {ann.is_pinned && (
                      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
                        <Pin size={12} /> Pinned
                      </span>
                    )}
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {ann.category || 'General'}
                    </span>
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                      <Users size={12} /> Target: {ann.target_audience || ann.target_role || 'All'}
                    </span>
                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                      ann.priority === 'Urgent' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                      ann.priority === 'High' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-slate-800 text-slate-300'
                    }`}>
                      {ann.priority || 'Medium'}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-white">{ann.title}</h3>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{ann.content || ann.description}</p>
                  
                  <div className="flex items-center gap-4 text-xs text-slate-400 pt-2">
                    <span className="flex items-center gap-1"><Calendar size={14} /> {new Date(ann.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center bg-[#020617] p-2 rounded-xl border border-slate-800">
                  <button
                    onClick={() => togglePin(ann.id, ann.is_pinned)}
                    className={`p-2 rounded-lg transition-colors ${ann.is_pinned ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                    title={ann.is_pinned ? 'Unpin' : 'Pin to top'}
                  >
                    <Pin size={18} />
                  </button>
                  <button
                    onClick={() => handleEdit(ann)}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(ann.id)}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl my-8"
            >
              <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Bell className="text-indigo-400" size={22} />
                  {editingAnnouncement ? 'Edit Announcement' : 'New Platform Announcement'}
                </h3>
                <button onClick={resetForm} className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800/50">
                  <X size={20} />
                </button>
              </div>

              {showSuccess && (
                <div className="mx-6 mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3 text-emerald-400 font-bold text-sm">
                  <Check size={20} /> {successMsg}
                </div>
              )}

              <form onSubmit={handleSave} className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-300">Announcement Title *</label>
                  <input
                    required
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. End of Semester CBT Examination Schedule"
                    className="w-full bg-[#020617] border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-300">Target Audience *</label>
                    <select
                      value={targetAudience}
                      onChange={e => setTargetAudience(e.target.value)}
                      className="w-full bg-[#020617] border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                    >
                      <option value="All">All Users (Students & Lecturers)</option>
                      <option value="Student">All Students</option>
                      <option value="UTME">UTME Students</option>
                      <option value="Post-UTME">Post-UTME Students</option>
                      <option value="Undergraduate">Undergraduate Students</option>
                      <option value="Lecturer">Lecturers Only</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-300">Category *</label>
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      className="w-full bg-[#020617] border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                    >
                      <option value="General Announcement">General Announcement</option>
                      <option value="Academic Notice">Academic Notice</option>
                      <option value="Examination Notice">Examination Notice</option>
                      <option value="Maintenance Notice">Maintenance Notice</option>
                      <option value="Emergency Notice">Emergency Notice</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-300">Priority Level</label>
                    <select
                      value={priority}
                      onChange={e => setPriority(e.target.value)}
                      className="w-full bg-[#020617] border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-3 pt-8">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPinned}
                        onChange={e => setIsPinned(e.target.checked)}
                        className="w-4 h-4 rounded bg-[#020617] border-slate-700 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm font-medium text-slate-300">Pin to top of feed</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-300">Message Content *</label>
                  <textarea
                    required
                    rows={6}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Provide full details of the announcement here..."
                    className="w-full bg-[#020617] border border-slate-800 rounded-xl p-4 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
                  ></textarea>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-6 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-3 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : <><Send size={18} /> {editingAnnouncement ? 'Update Announcement' : 'Publish & Broadcast'}</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
