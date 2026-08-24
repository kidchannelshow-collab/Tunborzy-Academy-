-- ============================================================================
-- 0048: TODAY'S PROGRESS REALTIME TABLES, RLS, & FUNCTION MIGRATION
-- ============================================================================

-- 1. Create user_study_logs table
CREATE TABLE IF NOT EXISTS public.user_study_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    subject_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create cbt_results table
CREATE TABLE IF NOT EXISTS public.cbt_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    score NUMERIC(5,2) DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.user_study_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_results ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for user_study_logs
CREATE POLICY "Users can manage their own study logs" ON public.user_study_logs
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 5. RLS Policies for cbt_results
CREATE POLICY "Users can manage their own cbt results" ON public.cbt_results
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 6. Add tables to Supabase Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_study_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cbt_results;

-- 7. Database function to compute Today's Progress in real-time
CREATE OR REPLACE FUNCTION public.get_todays_progress(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    v_courses_studied INTEGER;
    v_cbts_taken INTEGER;
    v_avg_score NUMERIC;
    v_today_start TIMESTAMP WITH TIME ZONE;
BEGIN
    v_today_start := date_trunc('day', timezone('utc'::text, now()));

    -- Count distinct subjects studied today
    SELECT COUNT(DISTINCT subject_id)
    INTO v_courses_studied
    FROM public.user_study_logs
    WHERE user_id = p_user_id
      AND created_at >= v_today_start;

    -- Count CBT tests taken today & average score
    SELECT COUNT(*), COALESCE(AVG(score), 0)
    INTO v_cbts_taken, v_avg_score
    FROM public.cbt_results
    WHERE user_id = p_user_id
      AND created_at >= v_today_start;

    RETURN json_build_object(
        'courses_studied_today', v_courses_studied,
        'cbts_taken_today', v_cbts_taken,
        'avg_score_today', ROUND(v_avg_score, 2)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Performance indexes
CREATE INDEX IF NOT EXISTS idx_user_study_logs_user_date ON public.user_study_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cbt_results_user_date ON public.cbt_results(user_id, created_at);
