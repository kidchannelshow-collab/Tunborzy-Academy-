-- ============================================================================
-- MIGRATION 0053 — CURRENT PRODUCT CONNECTION PATCH
-- Project: mnmuowgbbcczsqoxxjem
-- Run AFTER 0052_current_product_patch.sql
-- ============================================================================
-- PURPOSE
--   0052 creates the missing TABLES. It does not add the columns and foreign
--   keys that the CURRENT code expects on tables that ALREADY EXIST. Without
--   them those tables are reachable but the queries against them fail.
--
--   Everything below was proven missing by probing the live REST API
--   column-by-column (GET /rest/v1/<table>?select=<column>&limit=1 -> 400 means
--   the column does not exist) and by grepping the current src/ and server.ts
--   for the column name. Nothing is added merely because an old migration
--   contained it.
--
-- SAFETY
--   ADD COLUMN IF NOT EXISTS · ADD CONSTRAINT guarded by pg_constraint check ·
--   CREATE OR REPLACE FUNCTION. No DROP TABLE. No DROP COLUMN. No TRUNCATE.
--   No DELETE. No UPDATE of existing rows. No backfill. No seed data.
--   Every added column is nullable or has a DEFAULT, so existing rows are
--   unaffected and no table rewrite is forced.
--
-- WHAT IS DELIBERATELY *NOT* ADDED HERE (and why)
--   cbt_attempts.student_id · cbt_exams.lecturer_id · cbt_questions.course_id
--     These three columns are READ by live components but NEVER WRITTEN by any
--     live code path — the writers all set user_id / created_by instead.
--     Adding the column would leave a permanently-empty column and the query
--     would still return nothing. The correct fix is code-side (point the
--     reader at the column that is actually written) and is applied in the
--     matching source patch, not here.
--   saved_materials.created_at · cbt_attempts.created_at · cbt_attempts.time_used
--     Not referenced by any current code path.
--   materials.content
--     server.ts reads `content` off the ROW RETURNED BY THE RPC, and that RPC
--     reads public.lesson_ai_index — not public.materials. No code reads or
--     writes materials.content, so the column is not created.
--   chat_messages / chat_rooms
--     Still referenced by admin/Analytics.tsx, which is dead-and-graceful: the
--     helper returns [] on error, so the dashboard renders an empty "Top Chats"
--     list rather than failing. Chat is not part of the current product, so the
--     tables are NOT recreated.
--   avatars / course_materials storage buckets
--     Their only consumers (profile/AvatarSelectorModal.tsx,
--     lib/fileUpload.ts) are imported by nothing. Dead. Not created.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — MISSING COLUMNS ON ALREADY-LIVE TABLES
-- ============================================================================
-- Each line names the live call site that requires it.

-- ---------------------------------------------------------------------------
-- 1.1 public.courses
--     The live `courses` table has none of the columns the course editor uses,
--     so lecturer/CourseManagement.tsx cannot save a course and
--     student/AcademicMaterialsPage.tsx cannot filter the catalogue.
--     (0052 already adds course_code/portal/department/semester/level/status/
--      is_published/order_index/is_archived — these four are the remainder.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS faculty         TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS thumbnail_url   TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
-- admin/CourseManagement.tsx writes 'Public'/'Private'; defaults to 'Public'
-- so existing rows stay visible rather than disappearing from the catalogue.
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS visibility      TEXT DEFAULT 'Public';

-- ---------------------------------------------------------------------------
-- 1.2 public.cbt_questions
--     course_code is selected/read by:
--       lecturer/StudentInsights.tsx:62, cbt/CBTPerformanceAnalytics.tsx:41,
--       student/AcademicMaterialsPage.tsx:138,
--       admin/AdminUndergraduatePerformance.tsx:53
--     and INSERTed by cbt/AdminPdfUploader.tsx:300.
-- ---------------------------------------------------------------------------
ALTER TABLE public.cbt_questions ADD COLUMN IF NOT EXISTS course_code TEXT;

-- ---------------------------------------------------------------------------
-- 1.3 public.cbt_attempts
--     started_at is read and ordered by dashboard/ActivityAndAnnouncements.tsx
--     (:38 order, :45 render) and read by cbt/CBTStudentDashboard.tsx:148.
--     No live writer sets it, so it needs a DEFAULT or the value is NULL and
--     `new Date(null)` renders 01/01/1970.
-- ---------------------------------------------------------------------------
ALTER TABLE public.cbt_attempts ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now();

-- ---------------------------------------------------------------------------
-- 1.4 public.cbt_results
--     answers     — written by cbt/CbtDrill.tsx:57.
--     exam_id     — required for the cbt_exams(title) embed used by
--                   StudentProfilePage.tsx:39 and cbt/CBTResultView.tsx:24.
--                   The FK itself is added in SECTION 2; without both the embed
--                   fails with PGRST200.
-- ---------------------------------------------------------------------------
ALTER TABLE public.cbt_results ADD COLUMN IF NOT EXISTS exam_id UUID;

-- ---------------------------------------------------------------------------
-- 1.5 public.post_utme_questions
--     cbt/AdminPdfUploader.tsx:391 inserts course_code on every Post-UTME
--     question it saves. 0052 creates this table without the column, so the
--     bulk PDF upload fails for the Post-UTME destination.
-- ---------------------------------------------------------------------------
ALTER TABLE public.post_utme_questions ADD COLUMN IF NOT EXISTS course_code TEXT;


-- ============================================================================
-- SECTION 2 — FOREIGN KEY REQUIRED BY A LIVE EMBEDDED SELECT
-- ============================================================================
-- VERIFIED LIVE:
--   GET /rest/v1/cbt_results?select=*,cbt_exams(*)  ->
--     {"code":"PGRST200","details":"Searched for a foreign key relationship
--      between 'cbt_results' and 'cbt_exams' ... but no matches were found"}
-- StudentProfilePage.tsx:39 and cbt/CBTResultView.tsx:24 both embed
-- cbt_exams(...) from cbt_results. PostgREST cannot resolve the embed without
-- this constraint, so both reads error out.
--
-- exam_id was just added in 1.4 and is therefore NULL on every existing row,
-- so the constraint cannot fail validation on existing data.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cbt_results'::regclass
      AND conname  = 'cbt_results_exam_id_fkey'
  ) THEN
    ALTER TABLE public.cbt_results
      ADD CONSTRAINT cbt_results_exam_id_fkey
      FOREIGN KEY (exam_id)
      REFERENCES public.cbt_exams(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ============================================================================
-- SECTION 3 — THE ONE SEARCH RPC THE RUNNING SERVER CALLS
-- ============================================================================
-- VERIFIED LIVE:
--   POST /rest/v1/rpc/search_undergraduate_materials_fts {"search_query":"x"}
--     -> 404 PGRST202 "Could not find the function"
-- server.ts:528 calls this on EVERY /api/chat request to build the AI tutor's
-- RAG context. The call is inside a try/catch that only console.errors, so
-- today the AI silently answers with no academy material at all — this is the
-- difference between "answers from the academy corpus" and "answers from
-- general model knowledge".
--
-- Reads public.lesson_ai_index, which already exists live with the required
-- columns (lesson_id, level, course_code, course_title, topic_name, title,
-- material_type, content, search_vector, is_published) — re-verified by column
-- probe. SECURITY DEFINER so it is not subject to the caller's RLS on the
-- index table, matching the definition in 0051.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_undergraduate_materials_fts(search_query text)
RETURNS TABLE (
    lesson_id uuid,
    level text,
    course_code text,
    course_title text,
    topic_name text,
    title text,
    material_type text,
    content text
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.lesson_id, l.level, l.course_code, l.course_title,
        l.topic_name, l.title, l.material_type, l.content
    FROM public.lesson_ai_index l
    WHERE l.is_published = true
      AND l.search_vector @@ plainto_tsquery('english', search_query)
    ORDER BY ts_rank(l.search_vector, plainto_tsquery('english', search_query)) DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- SECTION 4 — SCHEMA CACHE RELOAD
-- ============================================================================
-- PostgREST caches the column list; new columns stay invisible (PGRST204
-- "Could not find the 'x' column") until it reloads.
NOTIFY pgrst, 'reload schema';
