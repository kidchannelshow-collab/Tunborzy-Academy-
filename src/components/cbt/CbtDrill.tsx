import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

export default function CbtDrill({ courseId }: { courseId?: string }) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: string]: number }>({});
  const [timeLeft, setTimeLeft] = useState(1200); // 20 minutes timer
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  // Fetch questions from Supabase
  useEffect(() => {
    async function fetchQuestions() {
      let query = supabase.from('cbt_questions').select('*');
      if (courseId) query = query.eq('course_id', courseId);
      const { data, error } = await query.limit(20); // UTME drill limit
      if (!error && data) setQuestions(data);
    }
    fetchQuestions();
  }, [courseId]);

  // Timer countdown
  useEffect(() => {
    if (timeLeft <= 0 && !isSubmitted) {
      handleSubmitTest();
      return;
    }
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isSubmitted]);

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    setSelectedAnswers({ ...selectedAnswers, [questionId]: optionIndex });
  };

  const handleSubmitTest = async () => {
    if (isSubmitted) return;
    setIsSubmitted(true);

    let calculatedScore = 0;
    questions.forEach((q) => {
      if (selectedAnswers[q.id] === q.correct_answer) {
        calculatedScore += 1;
      }
    });
    setScore(calculatedScore);

    // Save result to Supabase
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (userId) {
      await supabase.from('cbt_results').insert({
        user_id: userId,
        score: calculatedScore,
        total_questions: questions.length,
        answers: selectedAnswers,
      });
    }
  };

  if (questions.length === 0) return <div className="p-6 text-slate-400">Loading CBT questions...</div>;

  if (isSubmitted) {
    return (
      <div className="p-8 bg-slate-900 rounded-xl text-center text-white border border-slate-800">
        <h2 className="text-2xl font-bold mb-4">Exam Completed!</h2>
        <p className="text-lg text-slate-300 mb-6">
          Your Score: <span className="text-amber-400 font-bold">{score} / {questions.length}</span>
        </p>
        <button 
          onClick={() => window.location.reload()} 
          className="px-6 py-2 bg-amber-500 text-slate-950 font-semibold rounded-lg hover:bg-amber-400 transition-colors"
        >
          Try Another Drill
        </button>
      </div>
    );
  }

  const currentQ = questions[currentIndex];

  return (
    <div className="max-w-3xl mx-auto p-6 bg-slate-900 rounded-xl border border-slate-800 text-white">
      {/* Header bar */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
        <span className="text-sm font-medium text-slate-400">Question {currentIndex + 1} of {questions.length}</span>
        <span className="px-3 py-1 bg-rose-500/10 text-rose-400 rounded-md font-mono text-sm">
          Time Left: {Math.floor(timeLeft / 60)}:{('0' + (timeLeft % 60)).slice(-2)}
        </span>
      </div>

      {/* Question Text */}
      <h3 className="text-lg font-semibold mb-6">{currentQ.question_text}</h3>

      {/* Options List */}
      <div className="space-y-3 mb-8">
        {currentQ.options && currentQ.options.map((opt: string, idx: number) => {
          const isSelected = selectedAnswers[currentQ.id] === idx;
          return (
            <button
              key={idx}
              onClick={() => handleSelectOption(currentQ.id, idx)}
              className={`w-full text-left p-4 rounded-lg border transition-all ${
                isSelected 
                  ? 'border-amber-500 bg-amber-500/10 text-amber-300' 
                  : 'border-slate-800 bg-slate-800/50 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span className="font-bold mr-3">{String.fromCharCode(65 + idx)}.</span> {opt}
            </button>
          );
        })}
      </div>

      {/* Navigation Controls */}
      <div className="flex justify-between items-center pt-4 border-t border-slate-800">
        <button
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
          className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg disabled:opacity-50 hover:bg-slate-700"
        >
          Previous
        </button>

        {currentIndex < questions.length - 1 ? (
          <button
            onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
            className="px-6 py-2 bg-amber-500 text-slate-950 font-semibold rounded-lg hover:bg-amber-400"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmitTest}
            className="px-6 py-2 bg-emerald-500 text-slate-950 font-semibold rounded-lg hover:bg-emerald-400"
          >
            Submit Exam
          </button>
        )}
      </div>
    </div>
  );
}
