import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Edit2, Trash2, CheckCircle2, ShieldAlert, BookOpen, Layers, FileText, Copy, Check, Eye, Sparkles } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useProfile } from '../../lib/useProfile';
import AdminPdfUploader from '../cbt/AdminPdfUploader';

export default function UTMEManagement() {
  const { profile } = useProfile();
  const [activeTab, setActiveTab] = useState<'subjects' | 'topics' | 'questions' | 'ai_generator'>('subjects');
  
  const [subjects, setSubjects] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Question Form Modal
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [qSubjectId, setQSubjectId] = useState('');
  const [qTopicId, setQTopicId] = useState('');
  const [qText, setQText] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctOpt, setCorrectOpt] = useState('A');
  const [explanation, setExplanation] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [status, setStatus] = useState('draft'); // draft, under_review, approved, published
  const [year, setYear] = useState('2025');

  // Topic Form Modal
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [topicName, setTopicName] = useState('');
  const [topicSubjectId, setTopicSubjectId] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: subData } = await supabase.from('utme_subjects').select('*');
      setSubjects(subData || []);

      const { data: topData } = await supabase.from('utme_topics').select('*, utme_subjects(name)');
      setTopics(topData || []);

      let qQuery = supabase.from('utme_questions').select('*, utme_subjects(name), utme_topics(name)');
      if (profile?.role === 'Lecturer') {
        // Lecturers should only see questions for their assigned subjects or created by them
        // For simplicity, we filter by created_by or let RLS handle it
      }
      const { data: qData } = await qQuery;
      setQuestions(qData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        subject_id: qSubjectId,
        topic_id: qTopicId || null,
        question_text: qText,
        option_a: optA,
        option_b: optB,
        option_c: optC,
        option_d: optD,
        correct_option: correctOpt,
        explanation,
        difficulty,
        status,
        year,
        created_by: profile?.id
      };

      if (editingId) {
        const { error } = await supabase.from('utme_questions').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('utme_questions').insert([payload]);
        if (error) throw error;
      }

      setShowQuestionModal(false);
      resetQuestionForm();
      fetchData();
    } catch (err: any) {
      alert('Error saving question: ' + err.message);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    await supabase.from('utme_questions').delete().eq('id', id);
    fetchData();
  };

  const handleDuplicateQuestion = async (q: any) => {
    try {
      const { id, created_at, updated_at, ...rest } = q;
      await supabase.from('utme_questions').insert([{
        ...rest,
        question_text: `${q.question_text} (Copy)`,
        status: 'draft'
      }]);
      fetchData();
    } catch (err: any) {
      alert('Error duplicating: ' + err.message);
    }
  };

  const handleSaveTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await supabase.from('utme_topics').insert([{ name: topicName, subject_id: topicSubjectId }]);
      setShowTopicModal(false);
      setTopicName('');
      fetchData();
    } catch (err: any) {
      alert('Error saving topic: ' + err.message);
    }
  };

  const resetQuestionForm = () => {
    setEditingId(null);
    setQSubjectId('');
    setQTopicId('');
    setQText('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    setCorrectOpt('A');
    setExplanation('');
    setStatus('draft');
  };

  const openEditQuestion = (q: any) => {
    setEditingId(q.id);
    setQSubjectId(q.subject_id);
    setQTopicId(q.topic_id || '');
    setQText(q.question_text);
    setOptA(q.option_a);
    setOptB(q.option_b);
    setOptC(q.option_c);
    setOptD(q.option_d);
    setCorrectOpt(q.correct_option);
    setExplanation(q.explanation || '');
    setDifficulty(q.difficulty || 'medium');
    setStatus(q.status || 'draft');
    setYear(q.year || '2025');
    setShowQuestionModal(true);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0f172a] border border-slate-800 p-8 rounded-3xl">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
            Admin & Lecturer Portal
          </span>
          <h1 className="text-3xl font-display font-bold text-white mt-2">UTME Question Bank Management</h1>
          <p className="text-slate-400 mt-1">Manage subjects, topics, question workflows, and publication status.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => { resetQuestionForm(); setShowQuestionModal(true); }}
            className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-2xl flex items-center gap-2 transition-colors"
          >
            <Plus size={20} /> Add UTME Question
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-4">
        {[
          { id: 'subjects', label: 'UTME Subjects', icon: BookOpen },
          { id: 'topics', label: 'Topics', icon: Layers },
          { id: 'questions', label: 'Question Bank', icon: FileText },
          { id: 'ai_generator', label: 'AI PDF Generator', icon: Sparkles }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <tab.icon size={18} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'ai_generator' && (
        <div className="py-4">
          <AdminPdfUploader />
        </div>
      )}

      {activeTab === 'subjects' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subjects.map(sub => (
            <div key={sub.id} className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">{sub.code}</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${sub.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                  {sub.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <h3 className="text-xl font-bold text-white">{sub.name}</h3>
              <p className="text-sm text-slate-400">{sub.description}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'topics' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => setShowTopicModal(true)}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl flex items-center gap-2 text-sm"
            >
              <Plus size={16} /> Add Topic
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topics.map(t => (
              <div key={t.id} className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white">{t.name}</h4>
                  <p className="text-xs text-emerald-400 mt-1">{t.utme_subjects?.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'questions' && (
        <div className="space-y-4">
          {questions.map(q => (
            <div key={q.id} className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase px-3 py-1 bg-slate-900 border border-slate-800 text-emerald-400 rounded-lg">
                    {q.utme_subjects?.name}
                  </span>
                  <span className={`text-xs font-bold px-3 py-1 rounded-lg ${
                    q.status === 'published' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    q.status === 'approved' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    q.status === 'under_review' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    {q.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => openEditQuestion(q)} className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDuplicateQuestion(q)} className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors" title="Duplicate">
                    <Copy size={16} />
                  </button>
                  <button onClick={() => handleDeleteQuestion(q.id)} className="p-2 hover:bg-slate-800 text-rose-400 rounded-xl transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="text-white font-medium">{q.question_text}</div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-300">
                <div className={`p-2.5 rounded-xl border ${q.correct_option === 'A' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300 font-bold' : 'bg-slate-900 border-slate-800'}`}>A: {q.option_a}</div>
                <div className={`p-2.5 rounded-xl border ${q.correct_option === 'B' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300 font-bold' : 'bg-slate-900 border-slate-800'}`}>B: {q.option_b}</div>
                <div className={`p-2.5 rounded-xl border ${q.correct_option === 'C' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300 font-bold' : 'bg-slate-900 border-slate-800'}`}>C: {q.option_c}</div>
                <div className={`p-2.5 rounded-xl border ${q.correct_option === 'D' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300 font-bold' : 'bg-slate-900 border-slate-800'}`}>D: {q.option_d}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Question Modal */}
      {showQuestionModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-[#0f172a] border border-slate-800 rounded-3xl p-8 max-w-2xl w-full space-y-6 my-8">
            <h3 className="text-2xl font-bold text-white">{editingId ? 'Edit UTME Question' : 'Create UTME Question'}</h3>
            
            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-400">Subject</label>
                  <select
                    required
                    value={qSubjectId}
                    onChange={(e) => setQSubjectId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white mt-1"
                  >
                    <option value="">Select Subject...</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-400">Workflow Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white mt-1"
                  >
                    <option value="draft">Draft</option>
                    <option value="under_review">Under Review</option>
                    <option value="approved">Approved</option>
                    <option value="published">Published</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-400">Question Text</label>
                <textarea
                  required
                  rows={3}
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white mt-1"
                  placeholder="Type question here..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-400">Option A</label>
                  <input required type="text" value={optA} onChange={(e) => setOptA(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-400">Option B</label>
                  <input required type="text" value={optB} onChange={(e) => setOptB(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-400">Option C</label>
                  <input required type="text" value={optC} onChange={(e) => setOptC(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-400">Option D</label>
                  <input required type="text" value={optD} onChange={(e) => setOptD(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white mt-1" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-400">Correct Answer</label>
                  <select value={correctOpt} onChange={(e) => setCorrectOpt(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white mt-1">
                    <option value="A">Option A</option>
                    <option value="B">Option B</option>
                    <option value="C">Option C</option>
                    <option value="D">Option D</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-400">Difficulty</label>
                  <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white mt-1">
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-400">Explanation</label>
                <textarea rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white mt-1" placeholder="Explanation for answer..." />
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowQuestionModal(false)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl">Save Question</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Topic Modal */}
      {showTopicModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-[#0f172a] border border-slate-800 rounded-3xl p-8 max-w-md w-full space-y-6">
            <h3 className="text-xl font-bold text-white">Add UTME Topic</h3>
            <form onSubmit={handleSaveTopic} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-400">Subject</label>
                <select required value={topicSubjectId} onChange={(e) => setTopicSubjectId(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white mt-1">
                  <option value="">Select Subject...</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-400">Topic Name</label>
                <input required type="text" value={topicName} onChange={(e) => setTopicName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white mt-1" placeholder="e.g. Kinematics" />
              </div>
              <div className="flex gap-4 pt-2">
                <button type="button" onClick={() => setShowTopicModal(false)} className="flex-1 py-3 bg-slate-800 text-white font-bold rounded-xl">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-500 text-slate-950 font-bold rounded-xl">Save Topic</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
