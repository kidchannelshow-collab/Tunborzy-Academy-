import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';

export default function AdminPdfUploader() {
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [courseId, setCourseId] = useState('');

  // Simple client-side text extractor using FileReader or text reading
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatusMsg('Reading PDF file...');

    try {
      // For plain text files or raw text extraction simulation
      const text = await file.text(); // Note: For real binaries, use pdf.js library. For text/markdown/extracted notes, this works instantly.

      setStatusMsg('AI is generating CBT questions from document...');

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch('/api/cbt/parse-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ pdfText: text, courseId })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      setStatusMsg(result.message);
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-slate-900 rounded-xl border border-slate-800 text-white max-w-xl mx-auto">
      <h2 className="text-xl font-bold mb-4">AI PDF-to-CBT Question Generator</h2>
      
      <div className="mb-4">
        <label className="block text-sm text-slate-400 mb-2">Course ID (Optional)</label>
        <input 
          type="text" 
          value={courseId} 
          onChange={(e) => setCourseId(e.target.value)}
          placeholder="Enter course or material UUID"
          className="w-full p-3 bg-slate-800 border border-slate-700 rounded-lg text-white"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm text-slate-400 mb-2">Upload Material / Past Question PDF / Text File</label>
        <input 
          type="file" 
          accept=".pdf,.txt"
          onChange={handleFileUpload}
          disabled={loading}
          className="w-full text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-amber-500 file:text-slate-950 file:font-semibold hover:file:bg-amber-400 cursor-pointer"
        />
      </div>

      {loading && <p className="text-amber-400 font-medium animate-pulse">Processing document and structuring questions...</p>}
      {statusMsg && <p className="text-sm mt-3 text-slate-300 font-mono">{statusMsg}</p>}
    </div>
  );
}
