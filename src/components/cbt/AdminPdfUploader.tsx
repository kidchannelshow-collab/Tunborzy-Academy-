import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Sparkles, Trash2, Edit2, CheckCircle2, AlertCircle, Save, Check, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

interface QuestionItem {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation: string;
  topic: string;
  difficulty: string;
  marks: number;
  approved: boolean;
}

export default function AdminPdfUploader() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  
  // Destination selection
  const [destType, setDestType] = useState<'UTME' | 'Post-UTME' | 'Undergraduate'>('UTME');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [utmeSubjectsDb, setUtmeSubjectsDb] = useState<any[]>([]);

  // Editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<QuestionItem | null>(null);

  useEffect(() => {
    fetchUtmeSubjects();
  }, []);

  const fetchUtmeSubjects = async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase.from('utme_subjects').select('id, name, code');
      setUtmeSubjectsDb(data || []);
    } catch (err) {
      console.error('Error fetching destinations:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatusMsg('Extracting text and analyzing PDF with Gemini AI in batches...');
    setErrorMsg('');
    setSuccessMsg('');
    setQuestions([]);
    setCurrentPage(1);

    try {
      const formData = new FormData();
      formData.append('pdfFile', file);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const apiBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
      let res: Response;
      try {
        res = await fetch(`${apiBase}/api/cbt/parse-pdf`, {
          method: 'POST',
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: formData
        });
      } catch (networkErr: any) {
        throw new Error('Cannot connect to the PDF processing server. Please restart the backend or check if it is running.');
      }

      let result: any = {};
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        result = await res.json();
      } else {
        const textResp = await res.text();
        throw new Error(`Server returned non-JSON response (${res.status}): ${textResp.substring(0, 100)}`);
      }

      if (!res.ok) {
        if (res.status === 429 || result.code === 'GEMINI_QUOTA_EXCEEDED') {
          throw new Error('Gemini API quota exceeded. Please try again later or check your API key quota.');
        } else if (res.status === 401) {
          throw new Error('Your session has expired or is invalid. Please sign in again.');
        } else if (res.status === 403) {
          throw new Error('Access denied. Admin privileges required.');
        } else if (res.status === 400) {
          throw new Error(result.error || 'PDF could not be parsed or contains no readable text. Make sure you uploaded a valid PDF.');
        } else {
          throw new Error(result.error || `PDF upload failed with status ${res.status}`);
        }
      }

      setQuestions(result.questions || []);
      setStatusMsg(`Successfully generated ${result.questions?.length || 0} questions for review.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while parsing the PDF.');
      setStatusMsg('');
    } finally {
      setLoading(false);
    }
  };

  const toggleApproveAll = (approve: boolean) => {
    setQuestions(questions.map(q => ({ ...q, approved: approve })));
  };

  const toggleApprove = (globalIndex: number) => {
    const updated = [...questions];
    updated[globalIndex].approved = !updated[globalIndex].approved;
    setQuestions(updated);
  };

  const removeQuestion = (globalIndex: number) => {
    if (confirm('Are you sure you want to remove this question?')) {
      setQuestions(questions.filter((_, i) => i !== globalIndex));
      if (editingIndex === globalIndex) {
        setEditingIndex(null);
        setEditForm(null);
      }
    }
  };

  const startEdit = (globalIndex: number) => {
    setEditingIndex(globalIndex);
    setEditForm({ ...questions[globalIndex] });
  };

  const saveEdit = () => {
    if (editingIndex !== null && editForm) {
      const updated = [...questions];
      updated[editingIndex] = editForm;
      setQuestions(updated);
      setEditingIndex(null);
      setEditForm(null);
    }
  };

  const handleSaveToDatabase = async () => {
    const approvedQuestions = questions.filter(q => q.approved);
    if (approvedQuestions.length === 0) {
      setErrorMsg('Please approve at least one question before saving.');
      return;
    }
    if (!selectedSubject) {
      setErrorMsg('Please select a destination subject or course.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Authentication token expired or missing. Please sign in again.');

      if (destType === 'UTME') {
        let subjectRec = utmeSubjectsDb.find(s => s.name.toLowerCase() === selectedSubject.toLowerCase());
        let subjectId = subjectRec?.id;

        if (!subjectId) {
          const { data: newSub, error: subErr } = await supabase
            .from('utme_subjects')
            .insert({ name: selectedSubject, code: selectedSubject.substring(0, 3).toUpperCase(), is_active: true })
            .select()
            .single();
          if (subErr) throw subErr;
          subjectId = newSub.id;
        }

        const payload = approvedQuestions.map(q => ({
          subject_id: subjectId,
          question_text: q.question_text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_option: q.correct_option,
          explanation: q.explanation,
          difficulty: q.difficulty || 'medium',
          status: 'published',
          year: '2025'
        }));

        const { error } = await supabase.from('utme_questions').insert(payload);
        if (error) throw error;
      } else if (destType === 'Post-UTME') {
        let { data: examData } = await supabase
          .from('post_utme_exams')
          .select('id')
          .eq('subject', selectedSubject)
          .limit(1)
          .single();

        let examId = examData?.id;
        if (!examId) {
          const { data: newExam, error: examErr } = await supabase
            .from('post_utme_exams')
            .insert({
              title: `${selectedSubject} Post-UTME Exam`,
              subject: selectedSubject,
              university: 'General',
              year: '2025',
              duration_minutes: 60,
              is_published: true
            })
            .select()
            .single();
          if (examErr) throw examErr;
          examId = newExam.id;
        }

        const payload = approvedQuestions.map(q => ({
          exam_id: examId,
          course_code: selectedSubject,
          question_text: q.question_text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_option: q.correct_option,
          explanation: q.explanation,
          marks: q.marks || 1,
          topic: q.topic || 'General',
          difficulty: q.difficulty || 'medium'
        }));

        const { error } = await supabase.from('post_utme_questions').insert(payload);
        if (error) throw error;
      } else {
        // Undergraduate CBT: cbt_exams & cbt_questions
        // 1. Check if an exam already exists for this course_code
        let { data: examData, error: examFindErr } = await supabase
          .from('cbt_exams')
          .select('id, is_published')
          .eq('course_code', selectedSubject)
          .limit(1)
          .maybeSingle();

        let examId = examData?.id;

        if (examId) {
          // If exam exists but is not published, update it to published
          if (!examData.is_published) {
            const { error: updateErr } = await supabase
              .from('cbt_exams')
              .update({ is_published: true })
              .eq('id', examId);
            if (updateErr) throw updateErr;
          }
        } else {
          // Create a new published exam
          const { data: newExam, error: examErr } = await supabase
            .from('cbt_exams')
            .insert({
              title: `${selectedSubject} CBT Practice`,
              course_code: selectedSubject,
              subject: selectedSubject,
              duration_minutes: 60,
              is_published: true
            })
            .select()
            .single();
          if (examErr) throw examErr;
          examId = newExam.id;
        }

        const payload = approvedQuestions.map(q => ({
          exam_id: examId,
          course_code: selectedSubject,
          question_text: q.question_text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_option: q.correct_option,
          explanation: q.explanation,
          marks: q.marks || 1,
          topic: q.topic || 'General',
          difficulty: q.difficulty || 'medium'
        }));

        const { data: insertedRows, error } = await supabase.from('cbt_questions').insert(payload).select('id');
        if (error) throw error;
        
        const insertedCount = insertedRows ? insertedRows.length : payload.length;
        if (insertedCount !== approvedQuestions.length) {
          console.warn(`Warning: Expected to insert ${approvedQuestions.length} questions, but inserted ${insertedCount}`);
        }
      }

      setSuccessMsg(`Successfully saved ${approvedQuestions.length} approved questions to ${destType} → ${selectedSubject}!`);
      setQuestions([]);
      setSelectedSubject('');
      setCurrentPage(1);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save questions to database.');
    } finally {
      setSaving(false);
    }
  };

  // Pagination computations
  const totalPages = Math.ceil(questions.length / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, questions.length);
  const currentQuestions = questions.slice(startIndex, endIndex);

  return (
    <div className="space-y-6 max-w-4xl mx-auto text-white">
      <div className="p-6 bg-[#0f172a] rounded-3xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl">
            <Sparkles size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold font-display">AI PDF-to-CBT Question Generator</h2>
            <p className="text-sm text-slate-400">Upload past question PDFs or study notes to automatically generate structured CBT questions using Gemini AI without limits.</p>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <label className="block text-sm font-medium text-slate-300">Upload PDF / Text Material</label>
          <input 
            type="file" 
            accept=".pdf,.txt"
            onChange={handleFileUpload}
            disabled={loading}
            className="w-full text-slate-300 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:bg-amber-500 file:text-slate-950 file:font-bold hover:file:bg-amber-400 cursor-pointer bg-slate-800/50 rounded-xl p-2 border border-slate-700"
          />
        </div>

        {loading && (
          <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300">
            <RefreshCw className="animate-spin" size={20} />
            <span className="font-medium">{statusMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300">
            <AlertCircle size={20} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300">
            <CheckCircle2 size={20} />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {questions.length > 0 && (
        <div className="space-y-6">
          <div className="p-6 bg-[#0f172a] rounded-3xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">Review Generated Questions ({questions.length})</h3>
              <p className="text-sm text-slate-400">
                Questions {startIndex + 1}–{endIndex} of {questions.length} (Page {currentPage} of {totalPages})
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => toggleApproveAll(true)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Approve All
              </button>
              <button 
                onClick={() => toggleApproveAll(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {currentQuestions.map((q, idx) => {
              const globalIndex = startIndex + idx;
              return (
                <div key={globalIndex} className={`p-6 rounded-3xl border transition-all ${q.approved ? 'bg-[#0f172a] border-emerald-500/40 shadow-lg' : 'bg-slate-900/50 border-slate-800 opacity-60'}`}>
                  {editingIndex === globalIndex && editForm ? (
                    <div className="space-y-4">
                      <textarea 
                        value={editForm.question_text}
                        onChange={e => setEditForm({ ...editForm, question_text: e.target.value })}
                        className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                        rows={3}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {['A', 'B', 'C', 'D'].map(opt => (
                          <div key={opt} className="flex items-center gap-2">
                            <span className="font-bold text-amber-400">{opt}:</span>
                            <input 
                              type="text" 
                              value={(editForm as any)[`option_${opt.toLowerCase()}`]}
                              onChange={e => setEditForm({ ...editForm, [`option_${opt.toLowerCase()}`]: e.target.value })}
                              className="w-full p-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <label className="text-xs text-slate-400">Correct Option</label>
                          <select 
                            value={editForm.correct_option}
                            onChange={e => setEditForm({ ...editForm, correct_option: e.target.value })}
                            className="w-full p-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                          >
                            {['A', 'B', 'C', 'D'].map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-slate-400">Explanation</label>
                          <input 
                            type="text" 
                            value={editForm.explanation}
                            onChange={e => setEditForm({ ...editForm, explanation: e.target.value })}
                            className="w-full p-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button onClick={() => setEditingIndex(null)} className="px-4 py-2 bg-slate-800 rounded-lg text-xs font-bold cursor-pointer">Cancel</button>
                        <button onClick={saveEdit} className="px-4 py-2 bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"><Save size={14} /> Save</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            checked={q.approved} 
                            onChange={() => toggleApprove(globalIndex)}
                            className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
                          />
                          <span className="font-bold text-amber-400">Question {globalIndex + 1}</span>
                          <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full uppercase tracking-wider">{q.difficulty || 'medium'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEdit(globalIndex)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white cursor-pointer" title="Edit Question">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => removeQuestion(globalIndex)} className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg cursor-pointer" title="Remove Question">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <p className="text-white font-medium mb-4">{q.question_text}</p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                        {['A', 'B', 'C', 'D'].map(opt => {
                          const optText = (q as any)[`option_${opt.toLowerCase()}`];
                          const isCorrect = q.correct_option === opt;
                          return (
                            <div key={opt} className={`p-3 rounded-xl border text-sm flex items-center gap-2 ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300 font-semibold' : 'bg-slate-900 border-slate-800 text-slate-300'}`}>
                              <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold">{opt}</span>
                              <span>{optText}</span>
                              {isCorrect && <Check size={16} className="ml-auto text-emerald-400" />}
                            </div>
                          );
                        })}
                      </div>

                      <div className="text-xs text-slate-400 bg-slate-900/80 p-3 rounded-xl border border-slate-800/80 flex items-start gap-2">
                        <span className="font-bold text-slate-300">Explanation:</span>
                        <span>{q.explanation || 'No explanation provided.'}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 bg-[#0f172a] rounded-2xl border border-slate-800">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-sm font-bold rounded-xl flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span className="text-sm text-slate-300 font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-sm font-bold rounded-xl flex items-center gap-1 cursor-pointer"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Destination Selection & Save */}
          <div className="p-6 bg-[#0f172a] rounded-3xl border border-slate-800 space-y-6 shadow-xl">
            <h3 className="text-lg font-bold">Select Question Destination</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Destination Type</label>
                <select 
                  value={destType} 
                  onChange={e => { setDestType(e.target.value as any); setSelectedSubject(''); }}
                  className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white cursor-pointer"
                >
                  <option value="UTME">UTME</option>
                  <option value="Post-UTME">Post-UTME</option>
                  <option value="Undergraduate">Undergraduate</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  {destType === 'UTME' ? 'Select UTME Subject' : destType === 'Post-UTME' ? 'Select Post-UTME Subject' : 'Select Undergraduate Course'}
                </label>
                <select 
                  value={selectedSubject} 
                  onChange={e => setSelectedSubject(e.target.value)}
                  className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-white cursor-pointer"
                >
                  <option value="">-- Choose Subject / Course --</option>
                  {destType === 'UTME' && (
                    <>
                      <option value="Mathematics">Mathematics</option>
                      <option value="Use of English">Use of English</option>
                      <option value="Chemistry">Chemistry</option>
                      <option value="Physics">Physics</option>
                      <option value="Biology">Biology</option>
                    </>
                  )}
                  {destType === 'Post-UTME' && (
                    <>
                      <option value="Use of English">Use of English</option>
                      <option value="Mathematics">Mathematics</option>
                      <option value="General Paper">General Paper</option>
                    </>
                  )}
                  {destType === 'Undergraduate' && (
                    <>
                      <optgroup label="First Semester">
                        <option value="CHM 101">CHM 101 - General Chemistry I</option>
                        <option value="PHY 101">PHY 101 - General Physics I</option>
                        <option value="PHY 103">PHY 103 - Physics for Physical Sciences I</option>
                        <option value="MTH 101">MTH 101 - Elementary Mathematics I</option>
                        <option value="MTH 103">MTH 103 - Algebra and Trigonometry</option>
                        <option value="COS 101">COS 101 - Introduction to Computer Science</option>
                      </optgroup>
                      <optgroup label="CBT Only — First Semester">
                        <option value="PHY 107">PHY 107 - Practical Physics I (CBT)</option>
                        <option value="BIO 107">BIO 107 - General Biology Practical I (CBT)</option>
                        <option value="CHM 107">CHM 107 - Practical Chemistry I (CBT)</option>
                      </optgroup>
                      <optgroup label="Second Semester">
                        <option value="CHM 102">CHM 102 - General Chemistry II</option>
                        <option value="PHY 102">PHY 102 - General Physics II</option>
                        <option value="PHY 104">PHY 104 - Physics for Physical Sciences II</option>
                        <option value="MTH 102">MTH 102 - Elementary Mathematics II</option>
                        <option value="MTH 114">MTH 114 - Introduction to Numerical Methods</option>
                      </optgroup>
                      <optgroup label="CBT Only — Second Semester">
                        <option value="CHM 108">CHM 108 - Practical Chemistry II (CBT)</option>
                        <option value="PHY 108">PHY 108 - Practical Physics II (CBT)</option>
                      </optgroup>
                    </>
                  )}
                </select>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={handleSaveToDatabase}
                disabled={saving || questions.filter(q => q.approved).length === 0 || !selectedSubject}
                className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Save size={18} />
                {saving ? 'Saving Questions...' : `Save ${questions.filter(q => q.approved).length} Approved Questions`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
