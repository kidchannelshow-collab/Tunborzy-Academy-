-- ============================================================================
-- MIGRATION 0054 — ACADEMIC HIERARCHY MANAGEMENT  (Phase 1)
-- Project: mnmuowgbbcczsqoxxjem
-- Run AFTER 0052_current_product_patch.sql and 0053_current_product_connection_patch.sql
-- ============================================================================
-- PURPOSE
--   Phase 1 of the CBT / Course Management restructure: make every academic
--   hierarchy level manageable (create / edit / rename / archive / restore /
--   reorder) across all three programmes.
--
--     Undergraduate   Semester -> Subject -> Topic
--     UTME            Subject -> Topic
--     Post-UTME       University -> Subject -> Topic
--
-- HOW THE EXISTING SCHEMA ALREADY MODELS THIS  (read from the code, not assumed)
--   admin/CourseManagement.tsx derives every programme folder from ONE pair of
--   tables (currentCourses, L223-230):
--
--     courses.portal = 'Undergraduate'  -> Undergraduate subjects
--     courses.portal = 'Post-UTME'      -> Post-UTME subjects
--     course_modules (course_id)        -> the Topic level, for BOTH
--     utme_subjects -> utme_topics      -> the UTME hierarchy, kept separate
--
--   So Undergraduate and Post-UTME are already the same storage viewed through
--   a different `portal` value. The ONLY level that does not exist anywhere is
--   the Post-UTME **University**.
--
--   That is why this migration creates exactly ONE table. An earlier draft of
--   this file also created post_utme_subjects and post_utme_topics; that was
--   wrong and they are deliberately NOT created here — they would have been a
--   second copy of data `courses` and `course_modules` already hold for
--   portal='Post-UTME', which is exactly the duplication the brief forbids.
--
-- SAFETY
--   CREATE TABLE IF NOT EXISTS · ADD COLUMN IF NOT EXISTS ·
--   CREATE INDEX IF NOT EXISTS · DROP POLICY IF EXISTS before CREATE POLICY.
--   No DROP TABLE. No DROP COLUMN. No TRUNCATE. No DELETE. No UPDATE of existing
--   rows. No backfill. No seed or sample data. Every added column is nullable or
--   has a DEFAULT, so existing rows are unaffected and no table rewrite is forced.
--
-- VERIFIED LIVE before writing (probed per column:
--   GET /rest/v1/<table>?select=<col>&limit=1  ->  400 = genuinely absent):
--     utme_subjects.order_index   400  ABSENT   (added in 1.2)
--     utme_topics.is_active       400  ABSENT   (added in 1.3)
--     course_modules.is_archived  400  ABSENT   (added in 1.1)
--     courses.university_id       400  ABSENT   (added in 2.2)
--     post_utme_universities      table does not exist
--   All three hierarchy tables are currently EMPTY (0 rows), so nothing here can
--   collide with existing data.
--
-- DELIBERATELY NOT ADDED, AND WHY
--   public.courses.is_published
--     0037 and 0051 §4.4 intended it; 0052 assumed it and never created it, so
--     it has never existed. Not added — no current code reads or writes it.
--     `courses` already carries `status` and `is_archived`, which is what
--     admin/CourseManagement.tsx actually uses.
--   public.courses.updated_at / created_by
--     Appear only as destructuring keys when duplicating a row (L458) so the
--     copy is stripped of them. Never stored. Not added.
--   public.utme_subjects.is_archived / public.utme_topics.is_archived
--     Redundant with `is_active`, which utme_subjects already has and which
--     cbt/AdminPdfUploader.tsx:69 already filters on (`.eq('is_active', true)`).
--     Archive is expressed as is_active = false so an archived subject also
--     drops out of the question-import picker. One flag, not two.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — HIERARCHY FLAGS ON EXISTING TABLES
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1.1 public.course_modules  (the Topic level, shared by Undergraduate + Post-UTME)
--     Archive/Restore needs a flag. `courses` already uses is_archived, so the
--     topic level mirrors it rather than inventing a second convention.
--     is_published already exists and is NOT reused for archive: a topic can be
--     unpublished and still current, so the two mean genuinely different things.
-- ---------------------------------------------------------------------------
ALTER TABLE public.course_modules ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- ---------------------------------------------------------------------------
-- 1.2 public.utme_subjects
--     Reorder needs order_index. The UI orders by name today
--     (admin/CourseManagement.tsx:160), leaving no way to control the order.
--     Archive reuses the EXISTING is_active column — no new column.
-- ---------------------------------------------------------------------------
ALTER TABLE public.utme_subjects ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 1.3 public.utme_topics
--     order_index already exists. is_active is added to mirror its parent
--     utme_subjects so Archive/Restore is expressed identically at both levels
--     of the UTME hierarchy.
-- ---------------------------------------------------------------------------
ALTER TABLE public.utme_topics ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;


-- ============================================================================
-- SECTION 2 — POST-UTME UNIVERSITY LEVEL  (the only structure that is missing)
-- ============================================================================
-- Today a Post-UTME paper carries `university` as free text on post_utme_exams,
-- and postutme/PostUtmeManagement.tsx hardcodes 'UNILAG' as the default. The
-- same university is therefore retyped on every paper, and there is nothing to
-- list, rename, archive or reorder above the subject level.
--
-- This adds the missing level. Subjects and topics are NOT duplicated — they
-- remain `courses` (portal='Post-UTME') and `course_modules`, exactly as the
-- existing navigator already reads them.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2.1 public.post_utme_universities
--     Shape mirrors utme_subjects (name, code, is_active, order_index) so the
--     same management UI and the same archive/reorder semantics work at both.
--     `name` is UNIQUE: the same university must not be created twice.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_utme_universities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT,
    is_active BOOLEAN DEFAULT true,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2.2 public.courses.university_id
--     Links a Post-UTME subject to its university. NULLABLE by design:
--       - every Undergraduate and UTME subject row leaves it NULL, and
--       - a Post-UTME subject that is shared across universities stays NULL
--         rather than being copied once per university.
--     ON DELETE SET NULL, never CASCADE: removing a university must not delete
--     the subjects and question banks filed under it. The UI blocks deleting a
--     university that still has subjects, the same way deleting a topic is
--     already blocked while it still holds material.
-- ---------------------------------------------------------------------------
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES public.post_utme_universities(id) ON DELETE SET NULL;


-- ============================================================================
-- SECTION 3 — INDEXES
-- ============================================================================
-- Only parent foreign keys and the ordering column — the fields the management
-- UI actually filters and orders on. Nothing is indexed blindly.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_course_modules_course_id   ON public.course_modules(course_id);
CREATE INDEX IF NOT EXISTS idx_course_modules_archived    ON public.course_modules(is_archived);
CREATE INDEX IF NOT EXISTS idx_utme_topics_subject_id     ON public.utme_topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_utme_subjects_order        ON public.utme_subjects(order_index);
CREATE INDEX IF NOT EXISTS idx_courses_university_id      ON public.courses(university_id);
CREATE INDEX IF NOT EXISTS idx_post_utme_universities_ord ON public.post_utme_universities(order_index);


-- ============================================================================
-- SECTION 4 — ROW LEVEL SECURITY
-- ============================================================================
-- Mirrors migration 0052 §8.7/§8.8 exactly, so the new university level behaves
-- identically to the UTME hierarchy the app already talks to:
--   read   — any authenticated user (students browse the catalogue)
--   manage — Admin or Lecturer
-- Both role casings are accepted because profiles.role is not consistently
-- cased in the existing data.
-- ---------------------------------------------------------------------------
ALTER TABLE public.post_utme_universities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read post_utme_universities" ON public.post_utme_universities;
CREATE POLICY "Authenticated read post_utme_universities" ON public.post_utme_universities
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff manage post_utme_universities" ON public.post_utme_universities;
CREATE POLICY "Staff manage post_utme_universities" ON public.post_utme_universities
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')));


-- ============================================================================
-- SECTION 5 — SCHEMA CACHE RELOAD
-- ============================================================================
-- PostgREST caches the table/column list. Without this the new table and the
-- four new columns stay invisible and every query referencing them fails with
-- PGRST204 ("Could not find the 'x' column in the schema cache").
NOTIFY pgrst, 'reload schema';
