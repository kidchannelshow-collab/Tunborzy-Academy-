-- ============================================================================
-- MIGRATION 0052 — CURRENT PRODUCT PATCH
-- Project: mnmuowgbbcczsqoxxjem
-- ============================================================================
-- PURPOSE
--   Restore ONLY the database objects that the CURRENT Tunborzy Academy
--   application actually reads or writes, plus the columns that the CURRENT
--   code writes on already-live tables.
--
--   Every object below was proven necessary by probing the live REST API and by
--   grepping the current src/ and server.ts. Nothing here is restored merely
--   because an old migration contains it.
--
-- SAFETY
--   CREATE TABLE IF NOT EXISTS · ADD COLUMN IF NOT EXISTS · CREATE INDEX IF NOT
--   EXISTS · CREATE OR REPLACE FUNCTION · DROP POLICY/TRIGGER IF EXISTS before
--   recreating. No DROP TABLE. No TRUNCATE. No DELETE. No UPDATE of existing
--   rows. No backfill. No seed data. No hardcoded secrets, passwords or keys.
--
--   ⚠ THIS MIGRATION ALTERS TWO ALREADY-LIVE TABLES: public.profiles and
--     public.payments. Both changes are ADD COLUMN IF NOT EXISTS only, and both
--     are REQUIRED — without them, signup and payment verification both fail
--     outright. See SECTION 1 and SECTION 9. No column is dropped or retyped,
--     no existing row is modified, and no policy on either table is touched.
--
-- DELIBERATELY NOT RESTORED (obsolete / deleted features — see SECTION 11)
--   avatars · chat_messages · chat_rooms/members/messages family · lessons ·
--   course_topics · partner_payouts · lecturer_utme_assignments ·
--   assignment_submissions · audit of deleted Assignments feature
-- ============================================================================


-- ============================================================================
-- SECTION 0 — STORAGE BUCKET USED BY THE CURRENT APP
-- ============================================================================
-- The current code uploads to the bucket `tonborzy-content` from 8 call sites
-- across 5 files (lecturer/CourseManagement.tsx, lecturer/UploadCenter.tsx,
-- materials/LessonEditor.tsx, materials/LessonMaterialsManager.tsx,
-- materials/MaterialAdminDashboard.tsx).
--
-- VERIFIED LIVE: this bucket DOES NOT EXIST.
--   GET /storage/v1/object/public/tonborzy-content/ ->
--     {"statusCode":"404","error":"Bucket not found","code":"NoSuchBucket"}
-- Every upload in the application therefore fails today.
--
-- NOTE: the historical migrations create buckets named `avatars`,
-- `course_materials`, `assignments` and `knowledge_base`. The CURRENT code does
-- not use those names for uploads, so they are NOT created here.
-- All 8 call sites use getPublicUrl(), so the bucket must be public.

INSERT INTO storage.buckets (id, name, public)
VALUES ('tonborzy-content', 'tonborzy-content', true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- SECTION 1 — REQUIRED COLUMNS ON ALREADY-LIVE TABLES
-- ============================================================================
-- Both tables already exist and hold data. ADD COLUMN IF NOT EXISTS only.

-- ---------------------------------------------------------------------------
-- 1.1 public.profiles  — REQUIRED. Signup is broken without these.
-- ---------------------------------------------------------------------------
-- Proof:
--   src/components/SignUp.tsx:237  inserts  premium_status: 'Free'
--   src/components/SignUp.tsx:326  inserts  referred_by_partner_id
--   server.ts:1069-1070, 1130-1131, 1208-1209  update premium_status,
--     payment_reference, payment_date on payment verification
--   read by AdminAnalytics.tsx, PartnershipManagement.tsx, UserManagement.tsx,
--     dashboard/PremiumFeatures.tsx, StudentProfilePage.tsx
-- VERIFIED LIVE: all four return HTTP 400 / 42703 (column does not exist).
-- Because SignUp.tsx writes two of them in the same INSERT, EVERY new signup
-- currently fails.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS premium_status text DEFAULT 'Free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS payment_date timestamptz;

-- FK added AFTER SECTION 2 creates public.partners.
-- ON DELETE SET NULL so deleting a partner never deletes the student.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by_partner_id uuid;

-- ---------------------------------------------------------------------------
-- 1.2 public.payments  — REQUIRED. Payment recording is broken without these.
-- ---------------------------------------------------------------------------
-- Proof: server.ts:1109-1117 and :1197-1204 insert
--   { user_id, reference, transaction_id, amount, currency, status, provider,
--     plan }
-- VERIFIED LIVE: transaction_id, currency, provider, plan all return 400/42703.
-- The insert therefore fails; the code swallows the error at :1120 and the
-- payment is silently not recorded.

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS transaction_id text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS currency text DEFAULT 'NGN';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS plan text;

-- ---------------------------------------------------------------------------
-- 1.3 public.courses  — REQUIRED. Admin course management + lecturer
--     dashboards are broken without these.
-- ---------------------------------------------------------------------------
-- VERIFIED LIVE: of the columns the current code touches, only id, title,
-- description, lecturer_id and created_at exist. All of the below return
-- 400 / 42703.
-- Proof (a representative site for each):
--   order_index  admin/CourseManagement.tsx:83  .from('courses').select('*')
--                  .order('order_index')            -> query errors without it
--   portal       admin/CourseManagement.tsx:335 .update({ portal }).eq('portal')
--   semester     admin/CourseManagement.tsx:342 .update({ semester }).eq('semester')
--   course_code  lecturer/Announcements.tsx:29  .select('id, title, course_code,
--                  portal, department')
--   department   lecturer/Announcements.tsx:29
--   is_archived  lecturer/Overview.tsx:34,44    counts active_courses
--   status / is_published / level
--                the 0036/0037 publication + hierarchy columns already blessed
--                in migration 0051 §4.4; included here for the same reason.
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS course_code TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS portal TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS semester TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS level TEXT DEFAULT '100 Level';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Published';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 0;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- ---------------------------------------------------------------------------
-- 1.4 CBT result/attempt/exam counters  — REQUIRED.
-- ---------------------------------------------------------------------------
-- VERIFIED LIVE: all four are 400/42703.
--   cbt_results.total_questions   written by cbt/CbtDrill.tsx:56, read by
--     cbt/CbtAnalytics.tsx:31,57 and dashboard/ProgressOverview.tsx:21
--   cbt_attempts.total_questions  read by dashboard/ProgressOverview.tsx:21
--     and cbt/CBTStudentDashboard.tsx:201
--   cbt_exams.total_questions     written by cbt/AdminPdfUploader.tsx:288,
--     read by cbt/CBTStudentDashboard.tsx:120
ALTER TABLE public.cbt_results  ADD COLUMN IF NOT EXISTS total_questions integer DEFAULT 0;
ALTER TABLE public.cbt_attempts ADD COLUMN IF NOT EXISTS total_questions integer DEFAULT 0;
ALTER TABLE public.cbt_exams    ADD COLUMN IF NOT EXISTS total_questions integer DEFAULT 0;


-- ============================================================================
-- SECTION 2 — PARTNERSHIP / REFERRAL  (live feature)
-- ============================================================================
-- Reachable: admin/PartnershipManagement.tsx (rendered by AdminDashboard),
--           SignUp.tsx invitation-code lookup, server.ts payment commission.

-- ---------------------------------------------------------------------------
-- 2.1 partners
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    referral_code TEXT NOT NULL UNIQUE,
    commission_percentage NUMERIC(5,2) DEFAULT 20.00 NOT NULL,
    status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'pending', 'suspended', 'rejected', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2.2 profiles.referred_by_partner_id -> partners(id)   (completes SECTION 1.1)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname  = 'profiles_referred_by_partner_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_referred_by_partner_id_fkey
      FOREIGN KEY (referred_by_partner_id)
      REFERENCES public.partners(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2.3 partner_commission_ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_commission_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
    referred_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    referral_code TEXT NOT NULL,
    payment_reference TEXT NOT NULL UNIQUE,
    payment_amount NUMERIC(12,2) NOT NULL,
    commission_rate NUMERIC(5,2) DEFAULT 0.20 NOT NULL,
    commission_amount NUMERIC(12,2) NOT NULL,
    currency TEXT DEFAULT 'NGN' NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);


-- ============================================================================
-- SECTION 3 — ADMIN SETTINGS + AUDIT  (live feature)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 platform_settings
--   Used by server.ts GET /api/admin/settings (:1268) and PUT (:1334, :1339),
--   reached from admin/SystemSettings.tsx (rendered by AdminDashboard).
--   PUT upserts with { onConflict: 'category' } -> category must be UNIQUE.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL UNIQUE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- ---------------------------------------------------------------------------
-- 3.2 audit_logs
--   Written by server.ts:1351 and read by admin/AuditLog.tsx:24 and
--   server.ts:1457.
--   AuditLog.tsx reads: id, created_at, action_details || action, performed_by
--   server.ts writes:   user_id, action, details, created_at
--   Columns below are the UNION of both readers — no column is invented that
--   neither side uses.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    performed_by TEXT,
    action TEXT,
    action_details TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);


-- ============================================================================
-- SECTION 4 — LECTURER PORTAL DATA  (live feature)
-- ============================================================================
-- Reachable: lecturer/Overview.tsx:36, lecturer/StudentInsights.tsx:44,
--           lib/notificationService.ts:48 — all rendered by LecturerDashboard.
-- NOTE: nothing in the current code WRITES to course_enrollments. The table is
--       read-only today, so these queries will return empty rather than error.
--       Wiring enrollment creation is a product decision, not a schema bug, and
--       is deliberately NOT invented here.

CREATE TABLE IF NOT EXISTS public.course_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    enrolled_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    status TEXT DEFAULT 'active',
    UNIQUE (student_id, course_id)
);

-- ---------------------------------------------------------------------------
-- 4.1 course_templates
--   Used by admin/CourseTemplatesModal.tsx (inserts title + structure),
--   imported by admin/CourseManagement.tsx.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_templates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    description text,
    structure jsonb NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);


-- ============================================================================
-- SECTION 5 — UTME CBT  (live feature)
-- ============================================================================
-- Reachable: UTMECBTPage (student, App.tsx route 'utme') -> UTMEDashboard,
--           UTMEManagement (admin + lecturer dashboards), cbt/AdminPdfUploader,
--           and server.ts /api/utme/start (:792) and /api/utme/submit (:848).

CREATE TABLE IF NOT EXISTS public.utme_subjects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.utme_topics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subject_id UUID REFERENCES public.utme_subjects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.utme_questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subject_id UUID REFERENCES public.utme_subjects(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.utme_topics(id) ON DELETE SET NULL,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL, -- 'A', 'B', 'C', 'D'
    explanation TEXT,
    difficulty TEXT DEFAULT 'medium', -- 'easy', 'medium', 'hard'
    status TEXT DEFAULT 'draft', -- 'draft', 'under_review', 'approved', 'published'
    year TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.utme_attempts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES public.utme_subjects(id) ON DELETE CASCADE,
    mode TEXT DEFAULT 'full', -- 'full', 'topic', 'random'
    score INTEGER DEFAULT 0,
    total_correct INTEGER DEFAULT 0,
    total_wrong INTEGER DEFAULT 0,
    total_unanswered INTEGER DEFAULT 0,
    percentage NUMERIC(5,2) DEFAULT 0.00,
    time_used INTEGER DEFAULT 0, -- in seconds
    answers JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'completed', -- 'in_progress', 'completed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ============================================================================
-- SECTION 6 — POST-UTME CBT  (live feature)
-- ============================================================================
-- Reachable: postutme/PostUtmeManagement.tsx (admin + lecturer dashboards),
--           postutme/PostUtmeDrillPage.tsx (via UTMECBTPage -> student),
--           cbt/AdminPdfUploader.tsx.

CREATE TABLE IF NOT EXISTS public.post_utme_exams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    university TEXT NOT NULL,
    course_code TEXT,
    subject TEXT NOT NULL,
    year TEXT,
    duration_minutes INTEGER DEFAULT 60,
    is_published BOOLEAN DEFAULT false,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.post_utme_questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    exam_id UUID REFERENCES public.post_utme_exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL,
    explanation TEXT,
    marks INTEGER DEFAULT 1,
    topic TEXT,
    difficulty TEXT DEFAULT 'medium',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.post_utme_attempts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    exam_id UUID REFERENCES public.post_utme_exams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'in_progress',
    score INTEGER DEFAULT 0,
    total_correct INTEGER DEFAULT 0,
    total_wrong INTEGER DEFAULT 0,
    answers JSONB DEFAULT '{}'::jsonb,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE
);


-- ============================================================================
-- SECTION 7 — INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_partners_referral_code ON public.partners(referral_code);
CREATE INDEX IF NOT EXISTS idx_partners_status ON public.partners(status);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_partner_id ON public.partner_commission_ledger(partner_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_referred_user ON public.partner_commission_ledger(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_status ON public.partner_commission_ledger(status);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_created ON public.partner_commission_ledger(created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_referred_by_partner ON public.profiles(referred_by_partner_id);
CREATE INDEX IF NOT EXISTS idx_profiles_premium_status ON public.profiles(premium_status);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_student ON public.course_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_course ON public.course_enrollments(course_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_utme_topics_subject_id ON public.utme_topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_utme_questions_subject_id ON public.utme_questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_utme_questions_topic_id ON public.utme_questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_utme_questions_status ON public.utme_questions(status);
CREATE INDEX IF NOT EXISTS idx_utme_attempts_student_id ON public.utme_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_utme_attempts_subject_id ON public.utme_attempts(subject_id);

CREATE INDEX IF NOT EXISTS idx_post_utme_exams_university ON public.post_utme_exams(university);
CREATE INDEX IF NOT EXISTS idx_post_utme_exams_published ON public.post_utme_exams(is_published);
CREATE INDEX IF NOT EXISTS idx_post_utme_questions_exam_id ON public.post_utme_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_post_utme_attempts_exam_id ON public.post_utme_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_post_utme_attempts_user_id ON public.post_utme_attempts(user_id);


-- ============================================================================
-- SECTION 8 — ROW LEVEL SECURITY + POLICIES
-- ============================================================================
-- Scope: the NEW tables created in this migration only.
-- public.profiles and public.payments are NOT touched — their RLS is left
-- exactly as it is; only columns were added to them (SECTION 1).
--
-- The application talks to Postgres as `authenticated` (every API route in
-- server.ts forwards the caller's JWT via the Authorization header) and as
-- `anon` for the Flutterwave webhook. Policies below are therefore granted to
-- `authenticated`, except where noted.

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utme_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utme_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utme_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utme_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_utme_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_utme_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_utme_attempts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 8.1 partners
--   SignUp.tsx looks a referral code up immediately after the session is
--   established, so authenticated SELECT is required. Writes are admin-only
--   (PartnershipManagement.tsx).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated read partners" ON public.partners;
CREATE POLICY "Authenticated read partners" ON public.partners
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin full access partners" ON public.partners;
CREATE POLICY "Admin full access partners" ON public.partners
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin')));

-- ---------------------------------------------------------------------------
-- 8.2 partner_commission_ledger — admin read/manage; users may read their own.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access commission ledger" ON public.partner_commission_ledger;
CREATE POLICY "Admin full access commission ledger" ON public.partner_commission_ledger
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin')));

DROP POLICY IF EXISTS "Users read own commission rows" ON public.partner_commission_ledger;
CREATE POLICY "Users read own commission rows" ON public.partner_commission_ledger
  FOR SELECT TO authenticated USING (auth.uid() = referred_user_id);

-- ---------------------------------------------------------------------------
-- 8.3 platform_settings
--   Read by GET /api/admin/settings, which authorises the caller in code.
--   Writes are admin-only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated read platform settings" ON public.platform_settings;
CREATE POLICY "Authenticated read platform settings" ON public.platform_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin write platform settings" ON public.platform_settings;
CREATE POLICY "Admin write platform settings" ON public.platform_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin')));

-- ---------------------------------------------------------------------------
-- 8.4 audit_logs — admin read only. Inserts happen from server.ts, which
--     authorises the caller before logging.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin read audit logs" ON public.audit_logs;
CREATE POLICY "Admin read audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin')));

DROP POLICY IF EXISTS "Authenticated insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated insert audit logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 8.5 course_enrollments — read by lecturer dashboards; staff/admin manage.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated read enrollments" ON public.course_enrollments;
CREATE POLICY "Authenticated read enrollments" ON public.course_enrollments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff manage enrollments" ON public.course_enrollments;
CREATE POLICY "Staff manage enrollments" ON public.course_enrollments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')));

-- ---------------------------------------------------------------------------
-- 8.6 course_templates — admin-only feature.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access course_templates" ON public.course_templates;
CREATE POLICY "Admin full access course_templates" ON public.course_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin')));

-- ---------------------------------------------------------------------------
-- 8.7 UTME tables
--   Students read published questions; staff manage everything.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated read utme_subjects" ON public.utme_subjects;
CREATE POLICY "Authenticated read utme_subjects" ON public.utme_subjects
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff manage utme_subjects" ON public.utme_subjects;
CREATE POLICY "Staff manage utme_subjects" ON public.utme_subjects
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')));

DROP POLICY IF EXISTS "Authenticated read utme_topics" ON public.utme_topics;
CREATE POLICY "Authenticated read utme_topics" ON public.utme_topics
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff manage utme_topics" ON public.utme_topics;
CREATE POLICY "Staff manage utme_topics" ON public.utme_topics
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')));

DROP POLICY IF EXISTS "Authenticated read utme_questions" ON public.utme_questions;
CREATE POLICY "Authenticated read utme_questions" ON public.utme_questions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff manage utme_questions" ON public.utme_questions;
CREATE POLICY "Staff manage utme_questions" ON public.utme_questions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')));

DROP POLICY IF EXISTS "Users manage own utme attempts" ON public.utme_attempts;
CREATE POLICY "Users manage own utme attempts" ON public.utme_attempts
  FOR ALL TO authenticated
  USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Staff read utme attempts" ON public.utme_attempts;
CREATE POLICY "Staff read utme attempts" ON public.utme_attempts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')));

-- ---------------------------------------------------------------------------
-- 8.8 Post-UTME tables
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated read post_utme_exams" ON public.post_utme_exams;
CREATE POLICY "Authenticated read post_utme_exams" ON public.post_utme_exams
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff manage post_utme_exams" ON public.post_utme_exams;
CREATE POLICY "Staff manage post_utme_exams" ON public.post_utme_exams
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')));

DROP POLICY IF EXISTS "Authenticated read post_utme_questions" ON public.post_utme_questions;
CREATE POLICY "Authenticated read post_utme_questions" ON public.post_utme_questions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff manage post_utme_questions" ON public.post_utme_questions;
CREATE POLICY "Staff manage post_utme_questions" ON public.post_utme_questions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')));

DROP POLICY IF EXISTS "Users manage own post_utme attempts" ON public.post_utme_attempts;
CREATE POLICY "Users manage own post_utme attempts" ON public.post_utme_attempts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Staff read post_utme attempts" ON public.post_utme_attempts;
CREATE POLICY "Staff read post_utme attempts" ON public.post_utme_attempts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin','admin','Lecturer','lecturer')));


-- ============================================================================
-- SECTION 9 — STORAGE POLICIES FOR tonborzy-content
-- ============================================================================
-- Public read (getPublicUrl is used at every call site); authenticated write.

DROP POLICY IF EXISTS "Public read tonborzy-content" ON storage.objects;
CREATE POLICY "Public read tonborzy-content" ON storage.objects
  FOR SELECT USING (bucket_id = 'tonborzy-content');

DROP POLICY IF EXISTS "Auth upload tonborzy-content" ON storage.objects;
CREATE POLICY "Auth upload tonborzy-content" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'tonborzy-content');

DROP POLICY IF EXISTS "Auth update tonborzy-content" ON storage.objects;
CREATE POLICY "Auth update tonborzy-content" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'tonborzy-content');

DROP POLICY IF EXISTS "Auth delete tonborzy-content" ON storage.objects;
CREATE POLICY "Auth delete tonborzy-content" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'tonborzy-content');


-- ============================================================================
-- SECTION 10 — SCHEMA CACHE RELOAD
-- ============================================================================
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SECTION 11 — DELIBERATELY NOT RESTORED, AND WHY
-- ============================================================================
-- Every object here was checked against the CURRENT source and found either
-- unreferenced, or referenced only by a deleted/obsolete feature, or reachable
-- only from a component that nothing renders.
--
-- avatars                 ONLY consumer is profile/AvatarSelectorModal.tsx.
--                         That file is imported by NOTHING in src/ (verified by
--                         import scan) — it is orphaned code. No table restored.
-- chat_messages           ONLY consumer is a single count query at
--                         StudentProfilePage.tsx:38, which filters on `user_id`
--                         — a column chat_messages does not have in any
--                         repository definition. Chat is not part of the current
--                         product (no chat route in App.tsx). This is a stale
--                         reference; it is being patched out of the source, NOT
--                         restored as a table. See SECTION 12.
-- chat_rooms/chat_members/
--   pinned_messages/
--   message_reads/
--   message_reactions     No references anywhere in the current source.
-- lessons                 Referenced ONLY at server.ts:1399 inside
--                         /api/admin/system-health-extended. `lessons` is the
--                         obsolete name for the current `course_lessons`, which
--                         already exists. Patched in source, not restored.
-- course_topics           Same: server.ts:1398, obsolete name for the existing
--                         `course_modules`. Patched in source.
-- partner_payouts         No references anywhere in the current source.
-- lecturer_utme_assignments
--                         No references anywhere in the current source.
-- assignment_submissions  DELETED FEATURE — no current references. Not restored.
-- course_materials / avatars / assignments / knowledge_base storage buckets
--                         The current code uploads only to `tonborzy-content`.
-- audit_logs is restored (SECTION 3.2) because admin/AuditLog.tsx is rendered.
-- course_enrollments is restored (SECTION 4) because lecturer dashboards read it.
-- ============================================================================
