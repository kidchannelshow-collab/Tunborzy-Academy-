-- ============================================================================
-- MIGRATION 0051 — RESTORE MISSING SCHEMA
-- ============================================================================
-- PURPOSE
--   Restore the repository-defined database objects that are genuinely absent
--   from the live Supabase database, while preserving every existing live table
--   and all existing data.
--
-- STATUS
--   REVIEW ONLY. NOT APPLIED. NOT REVIEWED BY A HUMAN YET.
--
-- SCOPE
--   This migration ONLY creates objects that are missing. It never drops,
--   truncates, deletes, or updates any existing object or row.
--   Every statement is idempotent and safe to run repeatedly.
--
-- SOURCES OF TRUTH (no schema is invented here)
--   all_schemas.sql            materials, material_downloads, saved_materials,
--                              material_notes, material_progress, course_modules,
--                              course_lessons, cbt_answers, assignment_submissions,
--                              chat_rooms, chat_members, chat_messages,
--                              pinned_messages, message_reads, message_reactions,
--                              ai_knowledge_base, ai_feedback, lesson_ai_index,
--                              ai_settings/ai_conversations ALTERs
--   materials-schema.sql       (identical to above for the materials cluster)
--   supabase_chat_schema.sql   (identical to above for the chat cluster)
--   0009, 0010, 0011, 0013     ai_settings, ai_conversations, get_ai_statistics
--   0012                       ai_knowledge_base, knowledge_base bucket
--   0014, 0016                 ai_conversations columns
--   0015                       ai_feedback
--   0017, 0018, 0019, 0020     lesson_ai_index, lesson AI index functions/triggers
--   0022                       course_templates
--   0026                       utme_* tables
--   0004                       lecturer_access_codes (TABLE ONLY — seed excluded)
--   0036, 0037                 courses/course_modules/course_lessons columns
--   0038, 0039, 0040           undergraduate AI index functions/triggers, FTS
--   0042                       student_material_progress
--   0045/0046/0049/0050        partners, partner_commission_ledger, partner_payouts
--   0047                       platform_settings
--   0003, 0007, 0012           storage buckets + storage policies
--   0006, 0038, 0039, 0042, 0043, 0046, 0050   indexes
--   0005                       corrected materials/assignment_submissions policies
--
-- DELIBERATELY EXCLUDED (see section 11 at the end of this file)
--   course_enrollments · public.avatars (table) · audit_logs · realtime
--   publication membership · ALTER TABLE public.profiles · migration 0008
--   · migration 0001 · all seed/reference data INSERTs · all backfill
--   INSERT/UPDATE data statements
--
-- IMPORTANT — READING THIS FILE
--   Two known conflicts inside the repository are documented inline rather
--   than silently resolved:
--     [CONFLICT-A] lesson_ai_index has two incompatible definitions (0017 vs 0038)
--     [CONFLICT-B] 0006 indexes public.materials(course_id), a column that no
--                  repository definition of materials creates
--   Both are explained at the point they occur and again in section 11.
-- ============================================================================


-- ============================================================================
-- SECTION 0 — REQUIRED EXTENSION
-- ============================================================================
-- The chat tables (all_schemas.sql L357-417 / supabase_chat_schema.sql) use
-- uuid_generate_v4(), which requires the uuid-ossp extension. No repository
-- file creates this extension. Every other table in the repository uses
-- gen_random_uuid(), which is built in and needs nothing.
-- This statement is non-destructive and idempotent.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================================
-- SECTION 1 — STORAGE BUCKETS
-- ============================================================================
-- Source: 0003_avatars_bucket.sql, 0007_storage_buckets.sql,
--         0012_ai_knowledge_base.sql (bucket INSERT only)
-- All four buckets are confirmed missing from the live project.
-- INSERT ... ON CONFLICT DO NOTHING is the repository's own form.

INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('course_materials', 'course_materials', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('assignments', 'assignments', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge_base', 'knowledge_base', true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- SECTION 2 — BASE TABLES
-- ============================================================================
-- Tables whose foreign keys point only at objects that already exist live
-- (profiles, courses, assignments, cbt_exams, cbt_questions, cbt_attempts,
--  auth.users) or at nothing at all.

-- ---------------------------------------------------------------------------
-- 2.1 materials
-- Source: all_schemas.sql L258-289 / materials-schema.sql (identical)
-- FKs: none. Depends on nothing outside itself.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.materials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  lecturer_name text,
  file_url text NOT NULL,
  file_type text NOT NULL, -- pdf, video, audio, ppt, doc, zip, image, link
  file_size text,
  thumbnail_url text,

  -- Categorization
  portal text NOT NULL, -- UTME, Post-UTME, Undergraduate
  subject text,
  course_code text,
  semester text,
  faculty text,
  department text,
  level text,
  topic text,

  -- Stats
  downloads_count int DEFAULT 0,
  views_count int DEFAULT 0,

  -- Admin
  is_published boolean DEFAULT true,
  release_date timestamptz,
  expiry_date timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.2 course_modules
-- Source: all_schemas.sql L135-142
-- FK: course_id -> public.courses (live)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_modules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  order_index int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.3 cbt_answers
-- Source: all_schemas.sql L44-52
-- FKs: attempt_id -> public.cbt_attempts (live), question_id -> public.cbt_questions (live)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cbt_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID REFERENCES public.cbt_attempts(id) ON DELETE CASCADE,
    question_id UUID REFERENCES public.cbt_questions(id) ON DELETE CASCADE,
    selected_option INTEGER,
    is_correct BOOLEAN,
    time_spent_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2.4 assignment_submissions
-- Source: all_schemas.sql L191-202
-- FKs: assignment_id -> public.assignments (live), student_id -> public.profiles (live)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_url text,
  submission_text text,
  score int,
  feedback text,
  submitted_at timestamptz DEFAULT now(),
  graded_at timestamptz,
  UNIQUE(assignment_id, student_id)
);

-- ---------------------------------------------------------------------------
-- 2.5 chat_rooms
-- Source: all_schemas.sql L357-365 / supabase_chat_schema.sql (identical)
-- FK: created_by -> public.profiles (live)
-- NOTE: schema-qualified public.profiles; the repository source says
--       `REFERENCES profiles(id)` unqualified, which relies on search_path.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_code TEXT NOT NULL,
  course_title TEXT NOT NULL,
  portal TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- ---------------------------------------------------------------------------
-- 2.6 ai_settings
-- Source: 0009_ai_settings.sql
-- FKs: none.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled boolean DEFAULT true,
  welcome_message text DEFAULT 'Hello! Welcome to Tunborzy AI. Ask me anything about your studies.',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2.7 ai_conversations
-- Source: 0010_ai_conversations.sql
-- FK: user_id -> public.profiles (live)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject text,
    topic text,
    response_time integer,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2.8 ai_knowledge_base
-- Source: 0012_ai_knowledge_base.sql (identical to all_schemas.sql L419-426)
-- FKs: none.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_knowledge_base (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    file_name text NOT NULL,
    file_path text NOT NULL,
    mime_type text NOT NULL,
    size integer NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2.9 ai_feedback
-- Source: 0015_ai_feedback.sql (identical to all_schemas.sql L468-477)
-- FK: user_id -> public.profiles (live)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_feedback (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    message_id text,
    prompt text,
    response text,
    is_helpful boolean,
    comment text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2.10 course_templates
-- Source: 0022_course_templates.sql
-- FKs: none.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  structure jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.11 utme_subjects
-- Source: 0026_utme_cbt_schema.sql
-- FKs: none.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.utme_subjects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2.12 post_utme_exams
-- Source: 0034_post_utme_structure.sql
-- FK: created_by -> public.profiles (live)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_utme_exams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    university TEXT NOT NULL, -- e.g., 'UNILAG', 'UI', 'UNN', 'OAU', 'ABU'
    course_code TEXT,
    subject TEXT NOT NULL,
    year TEXT,
    duration_minutes INTEGER DEFAULT 60,
    is_published BOOLEAN DEFAULT false,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2.13 partners
-- Source: 0050_fix_partners_schema_cache.sql (SUPERSEDES 0044 + 0049)
--   0044 defined: commission_percentage NUMERIC(5,2) DEFAULT 20.00
--                 created_at/updated_at nullable, no status
--   0050 defines: commission_percentage NUMERIC(5,2) DEFAULT 20.00 NOT NULL
--                 created_at/updated_at NOT NULL, plus status with CHECK
--   0050 is the later definition and is used here. 0049's status column is
--   therefore already covered and is not applied separately.
-- FKs: none.
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
-- 2.14 platform_settings
-- Source: 0047_platform_settings.sql
-- FK: updated_by -> auth.users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL UNIQUE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- ---------------------------------------------------------------------------
-- 2.15 lecturer_access_codes
-- Source: 0004_access_codes.sql — TABLE DEFINITION ONLY.
--   The repository's seed INSERT for this table contains a hardcoded access
--   code SHA-256 hash. That INSERT is DELIBERATELY EXCLUDED (see section 11).
-- FK: created_by -> auth.users
-- NOTE: admin_access_codes (the sibling table in 0004) already exists live and
--       is NOT recreated here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lecturer_access_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    access_code_sha256 TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);


-- ============================================================================
-- SECTION 3 — CHILD TABLES
-- ============================================================================
-- Tables whose foreign keys point at tables created in SECTION 2.
-- Order within this section respects those dependencies.

-- ---------------------------------------------------------------------------
-- 3.1 material_downloads  (-> materials)
-- Source: all_schemas.sql L292-298 / materials-schema.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.material_downloads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id uuid REFERENCES public.materials(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  device_info text,
  downloaded_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3.2 saved_materials  (-> materials)
-- Source: all_schemas.sql L301-308 / materials-schema.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_materials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.materials(id) ON DELETE CASCADE,
  collection_name text DEFAULT 'Saved',
  saved_at timestamptz DEFAULT now(),
  UNIQUE(user_id, material_id, collection_name)
);

-- ---------------------------------------------------------------------------
-- 3.3 material_notes  (-> materials)
-- Source: all_schemas.sql L311-319 / materials-schema.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.material_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.materials(id) ON DELETE CASCADE,
  content text NOT NULL,
  timestamp text, -- e.g. video timestamp or pdf page
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3.4 material_progress  (-> materials)
-- Source: all_schemas.sql L322-331 / materials-schema.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.material_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.materials(id) ON DELETE CASCADE,
  progress_percent int DEFAULT 0,
  last_position text, -- page number or video time
  last_accessed_at timestamptz DEFAULT now(),
  is_completed boolean DEFAULT false,
  UNIQUE(user_id, material_id)
);

-- ---------------------------------------------------------------------------
-- 3.5 course_lessons  (-> course_modules)
-- Source: all_schemas.sql L145-159
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_lessons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id uuid REFERENCES public.course_modules(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  file_url text,
  file_type text, -- video, pdf, audio, ppt, doc, link
  file_size text,
  thumbnail_url text,
  content text,
  order_index int DEFAULT 0,
  is_published boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3.6 lesson_ai_index  (-> course_lessons)
-- Source: UNION of two incompatible repository definitions.
--
--   [CONFLICT-A] The repository defines lesson_ai_index TWICE, with different
--   columns, both using CREATE TABLE IF NOT EXISTS:
--     0017_lesson_ai_index.sql L1-12 (and all_schemas.sql L501-512) define:
--       subject, course, topic, keywords
--     0038_material_ai_source_architecture.sql L8-21 defines:
--       level, course_code, course_title, topic_name, material_type, is_published
--   0039 then adds search_vector; 0040 then adds extraction_status/extraction_error.
--   Neither definition ALTERs in the other's columns, so whichever ran first
--   would have won and the other set would be permanently absent.
--
--   The application requires BOTH sets:
--     - server.ts:221 writes `keywords`  -> 0017 column set
--     - server.ts:522 calls search_undergraduate_materials_fts, which reads
--       level, course_code, course_title, topic_name, material_type,
--       is_published, search_vector -> 0038/0039 column set
--     - the sync_material_ai_index() trigger (0020) writes subject/course/topic
--     - the sync_undergraduate_material_ai_index() trigger (0040) writes
--       level/course_code/course_title/topic_name/material_type/is_published
--
--   Every column below is taken verbatim from one of those repository
--   definitions. No column is invented. This is the only place in this
--   migration where the repository's own definitions were reconciled rather
--   than followed literally, because following either one literally would
--   leave the application's own code addressing a non-existent column.
--   A human decision is REQUIRED on this object before applying.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_ai_index (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    lesson_id uuid REFERENCES public.course_lessons(id) ON DELETE CASCADE,

    -- from 0017 / all_schemas.sql
    subject text,
    course text,
    topic text,
    content text,
    keywords text,

    -- from 0038
    level text,
    course_code text,
    course_title text,
    topic_name text,
    material_type text,
    is_published boolean DEFAULT true,

    -- from 0039
    search_vector tsvector,

    -- from 0040
    extraction_status text DEFAULT 'indexed',
    extraction_error text,

    -- shared by both definitions
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 3.7 student_material_progress  (-> course_lessons)
-- Source: 0042_undergraduate_progress_tracking.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_material_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES public.course_lessons(id) ON DELETE CASCADE,
    is_viewed BOOLEAN DEFAULT true,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, lesson_id)
);

-- ---------------------------------------------------------------------------
-- 3.8 chat_members  (-> chat_rooms)
-- Source: all_schemas.sql L368-376 / supabase_chat_schema.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'student', -- 'student', 'lecturer', 'admin'
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_muted BOOLEAN DEFAULT FALSE,
  UNIQUE(room_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 3.9 chat_messages  (-> chat_rooms)
-- Source: all_schemas.sql L379-388 / supabase_chat_schema.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_text TEXT,
  file_url TEXT,
  file_type TEXT, -- 'image', 'audio', 'document'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ---------------------------------------------------------------------------
-- 3.10 pinned_messages  (-> chat_rooms, chat_messages)
-- Source: all_schemas.sql L391-398 / supabase_chat_schema.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pinned_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  pinned_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  pinned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(room_id, message_id)
);

-- ---------------------------------------------------------------------------
-- 3.11 message_reads  (-> chat_messages)
-- Source: all_schemas.sql L401-407 / supabase_chat_schema.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_reads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 3.12 message_reactions  (-> chat_messages)
-- Source: all_schemas.sql L410-417 / supabase_chat_schema.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

-- ---------------------------------------------------------------------------
-- 3.13 utme_topics  (-> utme_subjects)
-- Source: 0026_utme_cbt_schema.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.utme_topics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subject_id UUID REFERENCES public.utme_subjects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ---------------------------------------------------------------------------
-- 3.14 utme_questions  (-> utme_subjects, utme_topics)
-- Source: 0026_utme_cbt_schema.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3.15 utme_attempts  (-> utme_subjects)
-- Source: 0026_utme_cbt_schema.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3.16 lecturer_utme_assignments  (-> utme_subjects)
-- Source: 0026_utme_cbt_schema.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lecturer_utme_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lecturer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES public.utme_subjects(id) ON DELETE CASCADE,
    UNIQUE(lecturer_id, subject_id)
);

-- ---------------------------------------------------------------------------
-- 3.17 post_utme_questions  (-> post_utme_exams)
-- Source: 0034_post_utme_structure.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3.18 post_utme_attempts  (-> post_utme_exams)
-- Source: 0034_post_utme_structure.sql
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3.19 partner_commission_ledger  (-> partners)
-- Source: 0050_fix_partners_schema_cache.sql (identical to 0046)
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

-- ---------------------------------------------------------------------------
-- 3.20 partner_payouts  (-> partners)
-- Source: 0050_fix_partners_schema_cache.sql (identical to 0046)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    currency TEXT DEFAULT 'NGN' NOT NULL,
    status TEXT DEFAULT 'paid' NOT NULL CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    payout_reference TEXT NOT NULL UNIQUE,
    requested_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);


-- ============================================================================
-- SECTION 4 — COLUMN ADDITIONS (ALTER TABLE ... ADD COLUMN IF NOT EXISTS)
-- ============================================================================
-- Only repository-defined column additions. On tables created in SECTIONS 2-3
-- these are no-ops; they exist so this migration produces the same final shape
-- whether or not the original migrations ran.

-- ---------------------------------------------------------------------------
-- 4.1 ai_settings  (source: 0011_ai_prompt_manager.sql + 0013_ai_advanced_settings.sql)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_settings
ADD COLUMN IF NOT EXISTS system_prompt text DEFAULT 'You are TONBORZY AI Tutor, a helpful academic assistant for an educational platform. You help students with their studies, explain concepts step by step, and solve problems with worked solutions. Explain science, engineering, computing concepts, and university-level topics. Help students prepare for CBT examinations, generate quizzes when requested, summarize academic notes, simplify difficult concepts, and recommend study strategies. If course materials are provided, use them as the highest-priority knowledge source. Otherwise, use your general educational knowledge. Never return fake information. If the answer is uncertain, state that clearly instead of inventing facts. Encourage learning instead of cheating, explain answers instead of only giving results, use clear language, and maintain a professional tone. Never expose that you are Gemini, identify yourself only as TONBORZY AI Tutor. If you need more information, use Google Search.',
ADD COLUMN IF NOT EXISTS personality text DEFAULT 'Professional and encouraging',
ADD COLUMN IF NOT EXISTS teaching_style text DEFAULT 'Step-by-step guidance',
ADD COLUMN IF NOT EXISTS answer_length text DEFAULT 'Detailed',
ADD COLUMN IF NOT EXISTS language text DEFAULT 'English';

ALTER TABLE public.ai_settings
ADD COLUMN IF NOT EXISTS daily_limit integer DEFAULT 1000,
ADD COLUMN IF NOT EXISTS student_limit integer DEFAULT 50,
ADD COLUMN IF NOT EXISTS block_offensive boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS academic_only boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS enable_logging boolean DEFAULT true;

-- ---------------------------------------------------------------------------
-- 4.2 ai_conversations  (source: 0014 + 0016, plus all_schemas.sql L466-467 / L500)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_conversations
ADD COLUMN IF NOT EXISTS messages_count integer DEFAULT 2;

ALTER TABLE public.ai_conversations
ADD COLUMN IF NOT EXISTS status text DEFAULT 'success';

-- ---------------------------------------------------------------------------
-- 4.3 materials  (source: all_schemas.sql L460-465 + 0021_add_order_index.sql)
--   materials.order_index comes from 0021.
--   0021 also adds courses.order_index — handled in 4.4 below.
-- ---------------------------------------------------------------------------
ALTER TABLE public.materials
ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 4.4 public.courses  — THE ONLY LIVE TABLE TOUCHED BY THIS MIGRATION
-- Authorised by the approved plan: repository-defined ADD COLUMN IF NOT EXISTS
-- changes from 0021 / 0036 / 0037 ONLY. No other structural change is made to
-- courses, no policy on courses is created, dropped, or altered, and RLS on
-- courses is left exactly as it is.
--   source: 0021_add_order_index.sql
--   source: 0036_undergraduate_academic_hierarchy.sql
--   source: 0037_material_publication_audit.sql
-- ---------------------------------------------------------------------------
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS order_index integer DEFAULT 0;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS level TEXT DEFAULT '100 Level';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS course_code TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;

-- ---------------------------------------------------------------------------
-- 4.5 course_modules  (source: 0036)
-- ---------------------------------------------------------------------------
ALTER TABLE public.course_modules ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.course_modules ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
ALTER TABLE public.course_modules ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;

-- ---------------------------------------------------------------------------
-- 4.6 course_lessons  (source: 0036 + 0037)
-- ---------------------------------------------------------------------------
ALTER TABLE public.course_lessons ADD COLUMN IF NOT EXISTS material_type TEXT DEFAULT 'pdf';
ALTER TABLE public.course_lessons ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.course_lessons ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE public.course_lessons ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;

-- ---------------------------------------------------------------------------
-- 4.7 lesson_ai_index  (source: 0039 + 0040)
--   These are no-ops given the SECTION 3.6 definition, but are retained so the
--   object reaches the same shape regardless of which path created it.
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesson_ai_index ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE public.lesson_ai_index ADD COLUMN IF NOT EXISTS extraction_status TEXT DEFAULT 'indexed';
ALTER TABLE public.lesson_ai_index ADD COLUMN IF NOT EXISTS extraction_error TEXT;


-- ============================================================================
-- SECTION 5 — FUNCTIONS
-- ============================================================================
-- Signatures, return types, language, bodies, and SECURITY settings are copied
-- verbatim from the repository. SECURITY DEFINER is preserved where the
-- repository uses it, and none is added where it does not. No search_path is
-- invented: the repository specifies none of these functions except
-- prevent_privileged_role_self_assignment (migration 0001), which is excluded
-- from this migration.
--
-- NOTE: several function bodies contain DELETE and UPDATE statements. These are
-- trigger-function internals required by the repository's own semantics (they
-- maintain lesson_ai_index); they are not top-level migration statements and
-- they execute only when their trigger fires.

-- ---------------------------------------------------------------------------
-- 5.1 get_ai_statistics  (source: 0010_ai_conversations.sql)
-- Depends on: public.ai_conversations (SECTION 2.7)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_ai_statistics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_questions integer;
  questions_today integer;
  active_sessions integer;
  avg_response_time integer;
  unique_students integer;
  top_subject text;
  top_topic text;
BEGIN
  SELECT count(*) INTO total_questions FROM public.ai_conversations;

  SELECT count(*) INTO questions_today FROM public.ai_conversations
  WHERE created_at >= date_trunc('day', now());

  SELECT count(distinct user_id) INTO active_sessions FROM public.ai_conversations
  WHERE created_at >= now() - interval '1 hour';

  SELECT coalesce(avg(response_time), 0)::integer INTO avg_response_time FROM public.ai_conversations;

  SELECT count(distinct user_id) INTO unique_students FROM public.ai_conversations;

  SELECT subject INTO top_subject FROM public.ai_conversations
  GROUP BY subject ORDER BY count(*) DESC LIMIT 1;

  SELECT topic INTO top_topic FROM public.ai_conversations
  GROUP BY topic ORDER BY count(*) DESC LIMIT 1;

  RETURN json_build_object(
    'totalQuestions', total_questions,
    'questionsToday', questions_today,
    'activeSessions', active_sessions,
    'avgResponseTime', avg_response_time,
    'uniqueStudents', unique_students,
    'topSubject', coalesce(top_subject, '--'),
    'topTopic', coalesce(top_topic, '--')
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5.2 sync_lesson_ai_index  (source: 0017_lesson_ai_index.sql)
-- Depends on: public.lesson_ai_index, public.course_modules, public.courses
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_lesson_ai_index()
RETURNS TRIGGER AS $$
DECLARE
    v_topic text;
    v_course text;
    v_subject text;
BEGIN
    -- Only index published lessons, optionally. Let's index all, or maybe only published. Let's index all.
    -- Get topic title (from course_modules)
    SELECT title, course_id INTO v_topic FROM public.course_modules WHERE id = NEW.module_id;

    -- Get course title and subject (from courses)
    SELECT title, department INTO v_course, v_subject FROM public.courses WHERE id = (SELECT course_id FROM public.course_modules WHERE id = NEW.module_id LIMIT 1);

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.lesson_ai_index (lesson_id, subject, course, topic, title, content)
        VALUES (NEW.id, v_subject, v_course, v_topic, NEW.title, NEW.content);
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.lesson_ai_index
        SET
            subject = v_subject,
            course = v_course,
            topic = v_topic,
            title = NEW.title,
            content = NEW.content,
            updated_at = now()
        WHERE lesson_id = NEW.id;

        IF NOT FOUND THEN
            INSERT INTO public.lesson_ai_index (lesson_id, subject, course, topic, title, content)
            VALUES (NEW.id, v_subject, v_course, v_topic, NEW.title, NEW.content);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 5.3 delete_lesson_ai_index  (source: 0017_lesson_ai_index.sql)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_lesson_ai_index()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.lesson_ai_index WHERE lesson_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 5.4 search_lessons  (source: 0018_search_lessons.sql)
-- Depends on: public.lesson_ai_index (subject, course, topic columns)
-- NOTE: not referenced anywhere in src/ or server.ts — restored for repository
--       completeness at the user's explicit request.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_lessons(search_query text)
RETURNS TABLE (
  lesson_id uuid,
  subject text,
  course text,
  topic text,
  title text,
  content text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.lesson_id, l.subject, l.course, l.topic, l.title, l.content
  FROM lesson_ai_index l
  WHERE
    l.title ILIKE '%' || search_query || '%' OR
    l.content ILIKE '%' || search_query || '%' OR
    l.topic ILIKE '%' || search_query || '%'
  LIMIT 3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 5.5 search_lessons_fts  (source: 0019_fts_search.sql)
-- Depends on: public.lesson_ai_index (subject, course, topic columns)
-- NOTE: not referenced anywhere in src/ or server.ts — restored for repository
--       completeness at the user's explicit request.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_lessons_fts(search_query text)
RETURNS TABLE (
  lesson_id uuid,
  subject text,
  course text,
  topic text,
  title text,
  content text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.lesson_id, l.subject, l.course, l.topic, l.title, l.content
  FROM lesson_ai_index l
  WHERE
    to_tsvector('english', coalesce(l.title,'') || ' ' || coalesce(l.content,'') || ' ' || coalesce(l.topic,'') || ' ' || coalesce(l.subject,'') || ' ' || coalesce(l.course,'')) @@ plainto_tsquery('english', search_query)
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 5.6 sync_material_ai_index  (source: 0020_material_ai_index.sql; identical in all_schemas.sql)
-- Depends on: public.lesson_ai_index, public.materials
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_material_ai_index()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.lesson_ai_index (lesson_id, subject, course, topic, title, content)
        VALUES (NEW.id, NEW.subject, NEW.course_code, NEW.topic, NEW.title, NEW.description);
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.lesson_ai_index
        SET
            subject = NEW.subject,
            course = NEW.course_code,
            topic = NEW.topic,
            title = NEW.title,
            content = NEW.description,
            updated_at = now()
        WHERE lesson_id = NEW.id;

        IF NOT FOUND THEN
            INSERT INTO public.lesson_ai_index (lesson_id, subject, course, topic, title, content)
            VALUES (NEW.id, NEW.subject, NEW.course_code, NEW.topic, NEW.title, NEW.description);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 5.7 delete_material_ai_index  (source: 0020_material_ai_index.sql; identical in all_schemas.sql)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_material_ai_index()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.lesson_ai_index WHERE lesson_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 5.8 sync_undergraduate_material_ai_index
--   [IMPORTANT] This function is defined TWICE in the repository:
--     0038_material_ai_source_architecture.sql L26-74  (earlier)
--     0040_material_content_extraction.sql      L7-65  (later, adds extraction_status)
--   The 0040 version is used here because 0040 supersedes 0038 and adds the
--   extraction_status handling that 0040's own ALTER TABLE supports.
-- Depends on: public.lesson_ai_index, public.course_modules, public.courses
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_undergraduate_material_ai_index()
returns TRIGGER AS $$
DECLARE
    v_level TEXT;
    v_course_code TEXT;
    v_course_title TEXT;
    v_topic_name TEXT;
    v_is_published BOOLEAN;
    v_extraction_status TEXT;
BEGIN
    SELECT
        c.level, c.course_code, c.title, cm.name, (c.is_published AND cm.is_published AND NEW.is_published)
    INTO
        v_level, v_course_code, v_course_title, v_topic_name, v_is_published
    FROM public.course_modules cm
    JOIN public.courses c ON c.id = cm.course_id
    WHERE cm.id = NEW.module_id;

    -- Determine extraction status based on material type and content presence
    IF NEW.material_type = 'text' OR (NEW.content IS NOT NULL AND length(trim(NEW.content)) > 0) THEN
        v_extraction_status := 'indexed';
    ELSIF NEW.material_type IN ('pdf', 'document', 'image', 'audio', 'video') AND (NEW.file_url IS NOT NULL) THEN
        v_extraction_status := 'pending';
    ELSE
        v_extraction_status := 'unavailable';
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.lesson_ai_index (
            lesson_id, level, course_code, course_title, topic_name, title, material_type, content, is_published, extraction_status
        )
        VALUES (
            NEW.id, v_level, v_course_code, v_course_title, v_topic_name, NEW.title, NEW.material_type, COALESCE(NEW.content, NEW.description), COALESCE(v_is_published, true), v_extraction_status
        );
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.lesson_ai_index
        SET
            level = v_level,
            course_code = v_course_code,
            course_title = v_course_title,
            topic_name = v_topic_name,
            title = NEW.title,
            material_type = NEW.material_type,
            content = COALESCE(NEW.content, NEW.description),
            is_published = COALESCE(v_is_published, true),
            extraction_status = v_extraction_status,
            updated_at = now()
        WHERE lesson_id = NEW.id;

        IF NOT FOUND THEN
            INSERT INTO public.lesson_ai_index (
                lesson_id, level, course_code, course_title, topic_name, title, material_type, content, is_published, extraction_status
            )
            VALUES (
                NEW.id, v_level, v_course_code, v_course_title, v_topic_name, NEW.title, NEW.material_type, COALESCE(NEW.content, NEW.description), COALESCE(v_is_published, true), v_extraction_status
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 5.9 delete_undergraduate_material_ai_index  (source: 0038_material_ai_source_architecture.sql)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_undergraduate_material_ai_index()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM public.lesson_ai_index WHERE lesson_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 5.10 update_lesson_ai_search_vector  (source: 0039_automatic_academic_material_fts.sql)
-- Depends on: public.lesson_ai_index
-- NOTE: no SECURITY DEFINER in the repository for this function; none added.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_lesson_ai_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.course_code, '') || ' ' || COALESCE(NEW.course_title, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.topic_name, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'D');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 5.11 search_undergraduate_materials_fts  (source: 0039_automatic_academic_material_fts.sql)
-- Depends on: public.lesson_ai_index (level, course_code, course_title,
--             topic_name, material_type, search_vector)
-- This is the ONLY search RPC the running application actually calls
-- (server.ts:522).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_undergraduate_materials_fts(search_query text)
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
        l.lesson_id, l.level, l.course_code, l.course_title, l.topic_name, l.title, l.material_type, l.content
    FROM public.lesson_ai_index l
    WHERE l.is_published = true
      AND l.search_vector @@ plainto_tsquery('english', search_query)
    ORDER BY ts_rank(l.search_vector, plainto_tsquery('english', search_query)) DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- SECTION 6 — TRIGGERS
-- ============================================================================
-- Each trigger is preceded by DROP TRIGGER IF EXISTS so the migration is
-- re-runnable. Targets must exist: course_lessons (3.5), materials (2.1),
-- lesson_ai_index (3.6) — all created above.

-- ---------------------------------------------------------------------------
-- 6.1 Triggers on public.course_lessons  (source: 0017 + 0038)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_sync_lesson_ai_index ON public.course_lessons;
CREATE TRIGGER trigger_sync_lesson_ai_index
AFTER INSERT OR UPDATE OF title, content, module_id
ON public.course_lessons
FOR EACH ROW
EXECUTE FUNCTION sync_lesson_ai_index();

DROP TRIGGER IF EXISTS trigger_delete_lesson_ai_index ON public.course_lessons;
CREATE TRIGGER trigger_delete_lesson_ai_index
AFTER DELETE ON public.course_lessons
FOR EACH ROW
EXECUTE FUNCTION delete_lesson_ai_index();

DROP TRIGGER IF EXISTS trigger_sync_undergraduate_ai_index ON public.course_lessons;
CREATE TRIGGER trigger_sync_undergraduate_ai_index
AFTER INSERT OR UPDATE ON public.course_lessons
FOR EACH ROW
EXECUTE FUNCTION sync_undergraduate_material_ai_index();

DROP TRIGGER IF EXISTS trigger_delete_undergraduate_ai_index ON public.course_lessons;
CREATE TRIGGER trigger_delete_undergraduate_ai_index
AFTER DELETE ON public.course_lessons
FOR EACH ROW
EXECUTE FUNCTION delete_undergraduate_material_ai_index();

-- ---------------------------------------------------------------------------
-- 6.2 Triggers on public.materials  (source: 0020)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_sync_material_ai_index ON public.materials;
CREATE TRIGGER trigger_sync_material_ai_index
AFTER INSERT OR UPDATE OF title, description, subject, course_code, topic
ON public.materials
FOR EACH ROW
EXECUTE FUNCTION sync_material_ai_index();

DROP TRIGGER IF EXISTS trigger_delete_material_ai_index ON public.materials;
CREATE TRIGGER trigger_delete_material_ai_index
AFTER DELETE ON public.materials
FOR EACH ROW
EXECUTE FUNCTION delete_material_ai_index();

-- ---------------------------------------------------------------------------
-- 6.3 Trigger on public.lesson_ai_index  (source: 0039)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_update_lesson_ai_search_vector ON public.lesson_ai_index;
CREATE TRIGGER trigger_update_lesson_ai_search_vector
BEFORE INSERT OR UPDATE ON public.lesson_ai_index
FOR EACH ROW
EXECUTE FUNCTION update_lesson_ai_search_vector();


-- ============================================================================
-- SECTION 7 — INDEXES
-- ============================================================================
-- All CREATE INDEX IF NOT EXISTS. No index is dropped or replaced.
-- Indexes on tables that already exist live are included because each is
-- IF NOT EXISTS and therefore a no-op; this keeps the migration faithful to
-- the repository's index definitions.

-- ---------------------------------------------------------------------------
-- 7.1 Indexes on already-live tables (sources: 0006, 0043)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cbt_questions_exam_id ON public.cbt_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_cbt_attempts_exam_id ON public.cbt_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_cbt_attempts_user_id ON public.cbt_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_cbt_attempts_user_status ON public.cbt_attempts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_cbt_attempts_end_time ON public.cbt_attempts(end_time DESC);
CREATE INDEX IF NOT EXISTS idx_cbt_questions_course_code ON public.cbt_questions(course_code);
CREATE INDEX IF NOT EXISTS idx_cbt_questions_topic ON public.cbt_questions(topic);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_courses_lecturer_id ON public.courses(lecturer_id);
CREATE INDEX IF NOT EXISTS idx_courses_course_code ON public.courses(course_code);
CREATE INDEX IF NOT EXISTS idx_courses_level ON public.courses(level);
CREATE INDEX IF NOT EXISTS idx_courses_is_published ON public.courses(is_published);
CREATE INDEX IF NOT EXISTS idx_live_classes_course_id ON public.live_classes(course_id);
CREATE INDEX IF NOT EXISTS idx_live_classes_lecturer_id ON public.live_classes(lecturer_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON public.assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_lecturer_id ON public.assignments(lecturer_id);
CREATE INDEX IF NOT EXISTS idx_announcements_lecturer_id ON public.announcements(lecturer_id);

-- ---------------------------------------------------------------------------
-- 7.2 Indexes on restored tables (sources: 0006, 0036, 0037, 0038, 0039, 0042)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cbt_answers_attempt_id ON public.cbt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_cbt_answers_question_id ON public.cbt_answers(question_id);

CREATE INDEX IF NOT EXISTS idx_course_modules_course_id ON public.course_modules(course_id);
CREATE INDEX IF NOT EXISTS idx_course_modules_is_published ON public.course_modules(is_published);
CREATE INDEX IF NOT EXISTS idx_course_lessons_module_id ON public.course_lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_course_lessons_is_published ON public.course_lessons(is_published);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_id ON public.assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student_id ON public.assignment_submissions(student_id);

-- [CONFLICT-B] 0006_performance_indexes.sql L26 defines:
--     CREATE INDEX IF NOT EXISTS idx_materials_course_id ON public.materials(course_id);
--   public.materials has NO course_id column in ANY repository definition
--   (all_schemas.sql L258-289 and materials-schema.sql, which are identical).
--   Executing that statement would fail with "column course_id does not exist".
--   It is therefore NOT reproduced here. See section 11.
--   NOTE: this means the materials cluster ends up with no index on a course
--   relationship, because no such column exists to index.

CREATE INDEX IF NOT EXISTS idx_material_downloads_material_id ON public.material_downloads(material_id);
CREATE INDEX IF NOT EXISTS idx_material_downloads_user_id ON public.material_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_materials_material_id ON public.saved_materials(material_id);
CREATE INDEX IF NOT EXISTS idx_saved_materials_user_id ON public.saved_materials(user_id);
CREATE INDEX IF NOT EXISTS idx_material_notes_material_id ON public.material_notes(material_id);
CREATE INDEX IF NOT EXISTS idx_material_notes_user_id ON public.material_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_material_progress_material_id ON public.material_progress(material_id);
CREATE INDEX IF NOT EXISTS idx_material_progress_user_id ON public.material_progress(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_created_by ON public.chat_rooms(created_by);
CREATE INDEX IF NOT EXISTS idx_chat_members_room_id ON public.chat_members(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON public.chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON public.chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON public.chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_pinned_messages_room_id ON public.pinned_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_message_id ON public.message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_user_id ON public.message_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON public.message_reactions(message_id);

CREATE INDEX IF NOT EXISTS idx_lesson_ai_index_lesson_id ON public.lesson_ai_index(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_ai_index_published ON public.lesson_ai_index(is_published);
CREATE INDEX IF NOT EXISTS idx_lesson_ai_search_vector ON public.lesson_ai_index USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_student_material_progress_user ON public.student_material_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_student_material_progress_lesson ON public.student_material_progress(lesson_id);

-- ---------------------------------------------------------------------------
-- 7.3 Indexes on partner tables (sources: 0046, 0050)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_partners_referral_code ON public.partners(referral_code);
CREATE INDEX IF NOT EXISTS idx_partners_status ON public.partners(status);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_partner_id ON public.partner_commission_ledger(partner_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_referred_user ON public.partner_commission_ledger(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_payment_ref ON public.partner_commission_ledger(payment_reference);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_status ON public.partner_commission_ledger(status);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_created ON public.partner_commission_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner_id ON public.partner_payouts(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_payouts_status ON public.partner_payouts(status);

-- NOTE: 0044/0050 also define
--     CREATE INDEX IF NOT EXISTS idx_profiles_referred_by_partner
--       ON public.profiles(referred_by_partner_id);
--   This requires profiles.referred_by_partner_id, which is DELIBERATELY
--   DEFERRED (no ALTER TABLE public.profiles in this migration). See section 11.


-- ============================================================================
-- SECTION 8 — ROW LEVEL SECURITY ENABLEMENT
-- ============================================================================
-- Enabled only on tables that are MISSING from the live database.
-- public.courses is a live table: its RLS state is left untouched, even though
-- 0036/0037 contain ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY.

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_progress ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cbt_answers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.course_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lesson_ai_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_material_progress ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.utme_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utme_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utme_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utme_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecturer_utme_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_utme_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_utme_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_utme_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lecturer_access_codes ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- SECTION 9 — POLICIES
-- ============================================================================
-- Every policy is preceded by DROP POLICY IF EXISTS so the migration is
-- re-runnable. Policy logic is copied verbatim from the repository.
--
-- Policy sets below reflect the repository's FINAL intended state, i.e. where a
-- later migration drops an earlier policy (0005 drops several, 0037 drops all
-- policies on course_modules/course_lessons), that drop is reproduced and the
-- superseded policy is not recreated.
--
-- NO POLICY IS CREATED, DROPPED, OR ALTERED ON public.courses or any other
-- already-live table, with one authorised exception: course_templates
-- (a missing table) has its repository role-casing bug corrected — see 9.6.

-- ---------------------------------------------------------------------------
-- 9.1 materials  (sources: all_schemas.sql L341-355, corrected by 0005)
--   0005 DROPs "Admin full access materials" (which used lowercase 'admin' /
--   'lecturer' role values) and replaces it with "Admin and Lecturer full
--   access materials", which matches BOTH casings. The corrected policy is used
--   and the superseded one is dropped, exactly as 0005 does.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read published materials" ON public.materials;
CREATE POLICY "Public read published materials" ON public.materials
  FOR SELECT USING (is_published = true AND (release_date IS NULL OR release_date <= now()) AND (expiry_date IS NULL OR expiry_date >= now()));

DROP POLICY IF EXISTS "Admin full access materials" ON public.materials;
DROP POLICY IF EXISTS "Admin and Lecturer full access materials" ON public.materials;
CREATE POLICY "Admin and Lecturer full access materials" ON public.materials
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'admin', 'Lecturer', 'lecturer'))
  );

DROP POLICY IF EXISTS "Users manage own data downloads" ON public.material_downloads;
CREATE POLICY "Users manage own data downloads" ON public.material_downloads FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own data saves" ON public.saved_materials;
CREATE POLICY "Users manage own data saves" ON public.saved_materials FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own data notes" ON public.material_notes;
CREATE POLICY "Users manage own data notes" ON public.material_notes FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own data progress" ON public.material_progress;
CREATE POLICY "Users manage own data progress" ON public.material_progress FOR ALL USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 9.2 course_modules + course_lessons  (source: 0037_material_publication_audit.sql)
--   0037 drops ALL policies on these tables before creating its own, and 0037
--   is the later migration, so its policies are the repository's final state.
--   0005's "Lecturers and Admins manage modules/lessons" policies are therefore
--   NOT reproduced (0037 removed them).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view published course modules" ON public.course_modules;
CREATE POLICY "Anyone can view published course modules" ON public.course_modules
    FOR SELECT USING (is_published = true OR is_published IS NULL);

DROP POLICY IF EXISTS "Staff can manage course modules" ON public.course_modules;
CREATE POLICY "Staff can manage course modules" ON public.course_modules
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Lecturer'))
    );

DROP POLICY IF EXISTS "Anyone can view published course lessons" ON public.course_lessons;
CREATE POLICY "Anyone can view published course lessons" ON public.course_lessons
    FOR SELECT USING (is_published = true OR is_published IS NULL);

DROP POLICY IF EXISTS "Staff can manage course lessons" ON public.course_lessons;
CREATE POLICY "Staff can manage course lessons" ON public.course_lessons
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Lecturer'))
    );

-- ---------------------------------------------------------------------------
-- 9.3 cbt_answers  (source: all_schemas.sql L74-82)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own answers" ON public.cbt_answers;
CREATE POLICY "Users can view their own answers" ON public.cbt_answers FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cbt_attempts WHERE id = attempt_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert their own answers" ON public.cbt_answers;
CREATE POLICY "Users can insert their own answers" ON public.cbt_answers FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.cbt_attempts WHERE id = attempt_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can update their own answers" ON public.cbt_answers;
CREATE POLICY "Users can update their own answers" ON public.cbt_answers FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.cbt_attempts WHERE id = attempt_id AND user_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- 9.4 assignment_submissions  (sources: all_schemas.sql L248, corrected by 0005)
--   0005 drops "Lecturers read/grade course submissions" and replaces it with
--   "Lecturers and Admins manage course submissions". Same treatment as 9.1.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Students manage own submissions" ON public.assignment_submissions;
CREATE POLICY "Students manage own submissions" ON public.assignment_submissions FOR ALL USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Lecturers read/grade course submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Lecturers and Admins manage course submissions" ON public.assignment_submissions;
CREATE POLICY "Lecturers and Admins manage course submissions" ON public.assignment_submissions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.assignments WHERE id = assignment_submissions.assignment_id AND lecturer_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'admin'))
);

-- ---------------------------------------------------------------------------
-- 9.5 Chat tables
--   [IMPORTANT] No repository file defines ANY policy for chat_rooms,
--   chat_members, chat_messages, pinned_messages, message_reads or
--   message_reactions — not in all_schemas.sql, not in supabase_chat_schema.sql,
--   not in any migration. Only ENABLE ROW LEVEL SECURITY exists (and only in
--   all_schemas.sql; supabase_chat_schema.sql does not even enable RLS).
--
--   Consequence: after this migration these six tables have RLS enabled and
--   ZERO policies, which means they are fully inaccessible to anon and
--   authenticated roles. This is the repository's own state, so it is
--   reproduced faithfully rather than invented around.
--   See section 11 — a human decision is REQUIRED if the chat feature is to
--   be usable.
-- ---------------------------------------------------------------------------
-- (no policies defined in repository — intentionally none created)

-- ---------------------------------------------------------------------------
-- 9.6 ai_settings  (source: 0009_ai_settings.sql)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage ai_settings" ON public.ai_settings;
CREATE POLICY "Admins can manage ai_settings"
ON public.ai_settings
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Anyone can read ai_settings" ON public.ai_settings;
CREATE POLICY "Anyone can read ai_settings"
ON public.ai_settings
FOR SELECT
TO authenticated
USING (true);

-- ---------------------------------------------------------------------------
-- 9.7 ai_conversations  (source: 0010_ai_conversations.sql)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert their own AI conversations" ON public.ai_conversations;
CREATE POLICY "Users can insert their own AI conversations"
    ON public.ai_conversations
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all AI conversations" ON public.ai_conversations;
CREATE POLICY "Admins can view all AI conversations"
    ON public.ai_conversations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- ---------------------------------------------------------------------------
-- 9.8 ai_knowledge_base  (source: 0012_ai_knowledge_base.sql)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage knowledge base" ON public.ai_knowledge_base;
CREATE POLICY "Admins can manage knowledge base"
    ON public.ai_knowledge_base
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Anyone can read knowledge base" ON public.ai_knowledge_base;
CREATE POLICY "Anyone can read knowledge base"
    ON public.ai_knowledge_base
    FOR SELECT
    USING (true);

-- ---------------------------------------------------------------------------
-- 9.9 ai_feedback  (source: 0015_ai_feedback.sql)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert their own feedback" ON public.ai_feedback;
CREATE POLICY "Users can insert their own feedback"
    ON public.ai_feedback
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read their own feedback" ON public.ai_feedback;
CREATE POLICY "Users can read their own feedback"
    ON public.ai_feedback
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all feedback" ON public.ai_feedback;
CREATE POLICY "Admins can view all feedback"
    ON public.ai_feedback
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- ---------------------------------------------------------------------------
-- 9.10 course_templates  (source: 0022_course_templates.sql)
--   *** THE ONE AUTHORISED POLICY CORRECTION IN THIS MIGRATION ***
--   The repository policy reads:  = 'admin'   (lowercase)
--   The application compares:    userProfile.role === 'Admin'  (App.tsx:47-50)
--   and every other migration in the repository uses 'Admin' (0005, 0044, 0046,
--   0047, 0050). As written, the repository policy never matches, so admin
--   access to course_templates is denied.
--   Per the approved plan this policy is corrected to 'Admin'. This is the ONLY
--   policy change made anywhere in this migration beyond reproducing repository
--   text verbatim.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin full access course_templates" ON public.course_templates;
CREATE POLICY "Admin full access course_templates" ON public.course_templates
  FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'Admin'
  );

-- ---------------------------------------------------------------------------
-- 9.11 lesson_ai_index  (sources: 0017 + 0038)
--   Four policies exist across the two migrations. Note their combined effect:
--   "Anyone can read lesson_ai_index" (USING true) and "Students can view
--   published ai index" (USING is_published = true) are both permissive SELECT
--   policies, so permissive OR semantics let any role read ALL rows, published
--   or not. That is the repository's own state and is reproduced faithfully.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read lesson_ai_index" ON public.lesson_ai_index;
CREATE POLICY "Anyone can read lesson_ai_index"
    ON public.lesson_ai_index
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Admins can manage lesson_ai_index" ON public.lesson_ai_index;
CREATE POLICY "Admins can manage lesson_ai_index"
    ON public.lesson_ai_index
    FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'lecturer')));

DROP POLICY IF EXISTS "Students can view published ai index" ON public.lesson_ai_index;
CREATE POLICY "Students can view published ai index" ON public.lesson_ai_index
    FOR SELECT USING (is_published = true);

DROP POLICY IF EXISTS "Staff can manage ai index" ON public.lesson_ai_index;
CREATE POLICY "Staff can manage ai index" ON public.lesson_ai_index
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Lecturer'))
    );

-- ---------------------------------------------------------------------------
-- 9.12 student_material_progress  (source: 0042)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Students can manage own material progress" ON public.student_material_progress;
CREATE POLICY "Students can manage own material progress" ON public.student_material_progress
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Staff can view student material progress" ON public.student_material_progress;
CREATE POLICY "Staff can view student material progress" ON public.student_material_progress
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Lecturer'))
    );

-- ---------------------------------------------------------------------------
-- 9.13 UTME tables  (source: 0026_utme_cbt_schema.sql)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view active utme subjects" ON public.utme_subjects;
CREATE POLICY "Anyone can view active utme subjects" ON public.utme_subjects FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage utme subjects" ON public.utme_subjects;
CREATE POLICY "Admins can manage utme subjects" ON public.utme_subjects FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
);

DROP POLICY IF EXISTS "Anyone can view utme topics" ON public.utme_topics;
CREATE POLICY "Anyone can view utme topics" ON public.utme_topics FOR SELECT USING (true);

DROP POLICY IF EXISTS "Staff can manage utme topics" ON public.utme_topics;
CREATE POLICY "Staff can manage utme topics" ON public.utme_topics FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'Admin' OR role = 'Lecturer'))
);

DROP POLICY IF EXISTS "Students can view published utme questions" ON public.utme_questions;
CREATE POLICY "Students can view published utme questions" ON public.utme_questions FOR SELECT USING (
  status = 'published' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Lecturer'))
);

DROP POLICY IF EXISTS "Staff can manage utme questions" ON public.utme_questions;
CREATE POLICY "Staff can manage utme questions" ON public.utme_questions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Lecturer'))
);

DROP POLICY IF EXISTS "Students can manage their own utme attempts" ON public.utme_attempts;
CREATE POLICY "Students can manage their own utme attempts" ON public.utme_attempts FOR ALL USING (
  student_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('Admin', 'Lecturer'))
);

DROP POLICY IF EXISTS "Admins can manage lecturer assignments" ON public.lecturer_utme_assignments;
CREATE POLICY "Admins can manage lecturer assignments" ON public.lecturer_utme_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
);

-- ---------------------------------------------------------------------------
-- 9.14 post-UTME tables  (source: 0034_post_utme_structure.sql)
--   0035_post_utme_security_audit.sql defines the same set; it is a later
--   duplicate, and 0034's set is reproduced here. Every policy is dropped
--   first, so re-running is safe regardless of which one applied.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view published post-utme exams" ON public.post_utme_exams;
CREATE POLICY "Public can view published post-utme exams" ON public.post_utme_exams
    FOR SELECT USING (is_published = true);

DROP POLICY IF EXISTS "Admin can manage all post-utme exams" ON public.post_utme_exams;
CREATE POLICY "Admin can manage all post-utme exams" ON public.post_utme_exams
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'Admin')
    );

DROP POLICY IF EXISTS "Lecturer can manage their own post-utme exams" ON public.post_utme_exams;
CREATE POLICY "Lecturer can manage their own post-utme exams" ON public.post_utme_exams
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'Lecturer')
        AND created_by = auth.uid()
    );

DROP POLICY IF EXISTS "Staff can manage post-utme questions" ON public.post_utme_questions;
CREATE POLICY "Staff can manage post-utme questions" ON public.post_utme_questions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('Admin', 'Lecturer'))
    );

DROP POLICY IF EXISTS "Students are denied direct post-utme question select" ON public.post_utme_questions;
CREATE POLICY "Students are denied direct post-utme question select" ON public.post_utme_questions
    FOR SELECT USING (false);

DROP POLICY IF EXISTS "Students can view their own post-utme attempts" ON public.post_utme_attempts;
CREATE POLICY "Students can view their own post-utme attempts" ON public.post_utme_attempts
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin can manage all post-utme attempts" ON public.post_utme_attempts;
CREATE POLICY "Admin can manage all post-utme attempts" ON public.post_utme_attempts
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'Admin')
    );

DROP POLICY IF EXISTS "Lecturer can manage attempts for their own post-utme exams" ON public.post_utme_attempts;
CREATE POLICY "Lecturer can manage attempts for their own post-utme exams" ON public.post_utme_attempts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.post_utme_exams
            WHERE post_utme_exams.id = post_utme_attempts.exam_id AND post_utme_exams.created_by = auth.uid()
        )
        AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'Lecturer')
    );

-- ---------------------------------------------------------------------------
-- 9.15 partner tables  (source: 0050_fix_partners_schema_cache.sql)
--   0050 already uses DROP POLICY IF EXISTS before each CREATE.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins have full access to partners" ON public.partners;
CREATE POLICY "Admins have full access to partners" ON public.partners
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'Admin'
        )
    );

DROP POLICY IF EXISTS "Public and authenticated can read partner referral codes" ON public.partners;
CREATE POLICY "Public and authenticated can read partner referral codes" ON public.partners
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins have full access to commission ledger" ON public.partner_commission_ledger;
CREATE POLICY "Admins have full access to commission ledger" ON public.partner_commission_ledger
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'Admin'
        )
    );

DROP POLICY IF EXISTS "Partners can view their own commission ledger" ON public.partner_commission_ledger;
CREATE POLICY "Partners can view their own commission ledger" ON public.partner_commission_ledger
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.partners
            WHERE partners.id = partner_commission_ledger.partner_id
            AND partners.email = (SELECT email FROM public.profiles WHERE id = auth.uid())
        ) OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'Admin'
        )
    );

DROP POLICY IF EXISTS "Admins have full access to partner payouts" ON public.partner_payouts;
CREATE POLICY "Admins have full access to partner payouts" ON public.partner_payouts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'Admin'
        )
    );

DROP POLICY IF EXISTS "Partners can view their own payouts" ON public.partner_payouts;
CREATE POLICY "Partners can view their own payouts" ON public.partner_payouts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.partners
            WHERE partners.id = partner_payouts.partner_id
            AND partners.email = (SELECT email FROM public.profiles WHERE id = auth.uid())
        ) OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'Admin'
        )
    );

-- ---------------------------------------------------------------------------
-- 9.16 platform_settings  (source: 0047_platform_settings.sql)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage platform settings" ON public.platform_settings;
CREATE POLICY "Admins can manage platform settings"
ON public.platform_settings
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'Admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'Admin'
    )
);

DROP POLICY IF EXISTS "Authenticated users can read platform settings" ON public.platform_settings;
CREATE POLICY "Authenticated users can read platform settings"
ON public.platform_settings
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 9.17 lecturer_access_codes
--   0004_access_codes.sql enables RLS on this table but defines NO policies.
--   Reproduced faithfully: RLS on, zero policies.
-- ---------------------------------------------------------------------------
-- (no policies defined in repository — intentionally none created)

-- ---------------------------------------------------------------------------
-- 9.18 STORAGE policies
--   Sources: 0003_avatars_bucket.sql, 0007_storage_buckets.sql,
--            0012_ai_knowledge_base.sql
--   Semantics preserved exactly as written, including the repository's use of
--   the legacy auth.role() helper (now commonly written `TO authenticated`).
--   No storage object or bucket data is deleted.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Auth Upload" ON storage.objects;
CREATE POLICY "Auth Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth Update" ON storage.objects;
CREATE POLICY "Auth Update" ON storage.objects FOR UPDATE WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth Delete" ON storage.objects;
CREATE POLICY "Auth Delete" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Public Access Materials" ON storage.objects;
CREATE POLICY "Public Access Materials" ON storage.objects FOR SELECT USING (bucket_id = 'course_materials');

DROP POLICY IF EXISTS "Auth Upload Materials" ON storage.objects;
CREATE POLICY "Auth Upload Materials" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'course_materials' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth Update Materials" ON storage.objects;
CREATE POLICY "Auth Update Materials" ON storage.objects FOR UPDATE WITH CHECK (bucket_id = 'course_materials' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth Delete Materials" ON storage.objects;
CREATE POLICY "Auth Delete Materials" ON storage.objects FOR DELETE USING (bucket_id = 'course_materials' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Lecturer Access Assignments" ON storage.objects;
CREATE POLICY "Lecturer Access Assignments" ON storage.objects FOR SELECT USING (bucket_id = 'assignments' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth Upload Assignments" ON storage.objects;
CREATE POLICY "Auth Upload Assignments" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'assignments' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin can upload KB files" ON storage.objects;
CREATE POLICY "Admin can upload KB files"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'knowledge_base' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admin can update KB files" ON storage.objects;
CREATE POLICY "Admin can update KB files"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'knowledge_base' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admin can delete KB files" ON storage.objects;
CREATE POLICY "Admin can delete KB files"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'knowledge_base' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Anyone can read KB files" ON storage.objects;
CREATE POLICY "Anyone can read KB files"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'knowledge_base');


-- ============================================================================
-- SECTION 10 — SCHEMA CACHE RELOAD
-- ============================================================================
-- Source: 0050_fix_partners_schema_cache.sql (final statement).
-- Without this, PostgREST may continue reporting the newly created tables as
-- missing (PGRST205) until its cache refreshes. Non-destructive.
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- SECTION 11 — DELIBERATELY DEFERRED OBJECTS AND KNOWN CONFLICTS
-- ============================================================================
--
-- ---------------------------------------------------------------------------
-- 11.1 DEFERRED — objects with NO repository definition (cannot be restored)
-- ---------------------------------------------------------------------------
--   public.course_enrollments  no CREATE TABLE in any .sql file in the repo.
--                              Only referenced by 0043 (guarded, will skip) and
--                              by src/components/lecturer/Overview.tsx,
--                              StudentInsights.tsx, src/lib/notificationService.ts.
--                              Notably: NOTHING in the repo ever INSERTs into it.
--   public.avatars (table)     no CREATE TABLE anywhere. 0003 creates only the
--                              *storage bucket*. AvatarSelectorModal.tsx:141-146
--                              issues an UPDATE against the table and never an
--                              INSERT, so no row-creation path exists.
--   public.audit_logs          no CREATE TABLE anywhere. server.ts:1349 writes
--                              {user_id, action, details, created_at};
--                              AuditLog.tsx:30-38 reads {id, created_at,
--                              action_details, performed_by}. The writer and the
--                              reader disagree, so the schema cannot be derived.
--   These three require a human schema decision and are NOT created here.
--
-- ---------------------------------------------------------------------------
-- 11.2 DEFERRED — realtime publication membership
-- ---------------------------------------------------------------------------
--   No ALTER PUBLICATION statement is included. The application subscribes to
--   postgres_changes on materials, partners, partner_commission_ledger and
--   ai_settings (CourseManagement.tsx:70, lecturer/CourseManagement.tsx:63,
--   UploadCenter.tsx:79, MaterialAdminDashboard.tsx:78,
--   PartnershipManagement.tsx:75-81, TunborzyAI.tsx:137), but NO repository
--   artifact ever adds these tables to supabase_realtime. After this migration
--   those subscriptions will still never fire; initial .select() loads will work.
--   Already-published: notifications (0002), user_study_logs + cbt_results (0048).
--
-- ---------------------------------------------------------------------------
-- 11.3 DEFERRED — ALTER TABLE public.profiles
-- ---------------------------------------------------------------------------
--   0044 and 0050 each add profiles.referred_by_partner_id. This mutates a live
--   table's shape and is deferred per the approved plan. Consequently
--   idx_profiles_referred_by_partner is also not created (7.3 note), and the
--   partners referral-tracking feature is incomplete until this is applied.
--
-- ---------------------------------------------------------------------------
-- 11.4 DEFERRED — migration 0008 (DATA-DESTRUCTIVE, must never be replayed)
-- ---------------------------------------------------------------------------
--   0008_update_admin_code.sql runs:
--     UPDATE public.admin_access_codes SET is_active = false;
--     INSERT INTO public.admin_access_codes (...) VALUES ('174ab8da...', true)
--         ON CONFLICT (access_code_sha256) DO UPDATE SET is_active = true, ...
--   Replaying it would deactivate every existing admin access code and re-enable
--   a hardcoded code. It is excluded from this migration in full. The hardcoded
--   hash is NOT reproduced anywhere in this file.
--
-- ---------------------------------------------------------------------------
-- 11.5 DEFERRED — migration 0001 (privileged-role trigger)
-- ---------------------------------------------------------------------------
--   public.prevent_privileged_role_self_assignment() + its trigger on
--   public.profiles. Its live status is UNVERIFIED: it RETURNS TRIGGER, so
--   PostgREST cannot expose it (a PGRST202 probe is uninformative), and unlike
--   the AI-index functions its parent table (profiles) exists live, so table
--   absence proves nothing. If it never ran, the live database has no
--   database-level guard against client-side role self-escalation to
--   Admin/Lecturer. Deferred per the approved plan; migration 0001 is fully
--   idempotent and can be applied on its own at any time.
--
-- ---------------------------------------------------------------------------
-- 11.6 DEFERRED — all seed / reference / backfill data statements
-- ---------------------------------------------------------------------------
--   Omitted because they are data operations rather than schema, and because
--   the approved plan authorised exactly one INSERT form (storage.buckets).
--   Each is listed so it can be added deliberately:
--     0009_ai_settings.sql           guarded INSERT of the default ai_settings row
--     0026_utme_cbt_schema.sql       INSERT of 5 UTME subjects (ON CONFLICT DO NOTHING)
--     0032_utme_subject_structure_fix.sql  same 5 subjects, ON CONFLICT DO UPDATE
--                                    (contains UPDATE — additionally excluded)
--     0047_platform_settings.sql     INSERT of 6 platform_settings category rows
--     0004_access_codes.sql          INSERT of access-code SHA-256 hashes for
--                                    admin_access_codes AND lecturer_access_codes
--                                    (these are credentials — excluded)
--     0017 / 0020 / all_schemas.sql  backfill INSERT INTO lesson_ai_index SELECT
--                                    ... FROM course_lessons / materials.
--                                    No-ops on freshly created empty tables.
--     0039_automatic_academic_material_fts.sql
--                                    UPDATE public.lesson_ai_index SET
--                                    search_vector = ... (contains UPDATE)
--   Consequence: after this migration, ai_settings, utme_subjects and
--   platform_settings will be EMPTY. The application may need those rows.
--
-- ---------------------------------------------------------------------------
-- 11.7 CONFLICT-A — lesson_ai_index has two incompatible definitions
-- ---------------------------------------------------------------------------
--   0017 (and all_schemas.sql) create it with: subject, course, topic, keywords
--   0038 creates it with: level, course_code, course_title, topic_name,
--                         material_type, is_published
--   Both use CREATE TABLE IF NOT EXISTS and neither ALTERs in the other's
--   columns, so in the repository's own ordering whichever ran first would win
--   and the other column set would be permanently missing.
--   The application needs BOTH: server.ts:221 writes `keywords` (0017 set) and
--   server.ts:522 calls search_undergraduate_materials_fts which reads the 0038
--   set. Section 3.6 therefore creates the UNION of all repository-defined
--   columns. No column is invented, but this object is a RECONCILIATION rather
--   than a literal copy and REQUIRES HUMAN SIGN-OFF before applying.
--
-- ---------------------------------------------------------------------------
-- 11.8 CONFLICT-B — 0006 indexes a column that does not exist
-- ---------------------------------------------------------------------------
--   0006_performance_indexes.sql L26:
--     CREATE INDEX IF NOT EXISTS idx_materials_course_id ON public.materials(course_id);
--   public.materials has no course_id column in any repository definition
--   (all_schemas.sql L258-289 and materials-schema.sql are identical and
--   neither contains course_id). This statement would fail with
--   "column course_id does not exist". It is excluded (see 7.2).
--
-- ---------------------------------------------------------------------------
-- 11.9 CONFLICT-C — chat tables and lecturer_access_codes have RLS with no policies
-- ---------------------------------------------------------------------------
--   No repository file defines policies for chat_rooms, chat_members,
--   chat_messages, pinned_messages, message_reads, message_reactions, or
--   lecturer_access_codes. With RLS enabled and no policies, these tables are
--   inaccessible to anon and authenticated roles. Reproduced faithfully; needs
--   a human decision if the chat feature or code redemption is to work.
--
-- ---------------------------------------------------------------------------
-- 11.10 CONFLICT-D — role-value casing is inconsistent across the repository
-- ---------------------------------------------------------------------------
--   Policies variously compare role to 'Admin'/'Lecturer' (0005, 0037, 0044,
--   0046, 0047, 0050) and to lowercase 'admin'/'lecturer' (0009, 0010, 0012,
--   0015, 0017, 0022, all_schemas). The application stores and compares
--   'Admin'/'Lecturer' (App.tsx:47-50). Only course_templates (9.10) was
--   authorised for correction in this migration. The remaining lowercase
--   comparisons are reproduced verbatim and are listed here because they are
--   LIKELY NON-MATCHING AT RUNTIME:
--     9.6  ai_settings          "Admins can manage ai_settings"        = 'admin'
--     9.7  ai_conversations     "Admins can view all AI conversations" = 'admin'
--     9.8  ai_knowledge_base    "Admins can manage knowledge base"     = 'admin'
--     9.9  ai_feedback          "Admins can view all feedback"          = 'admin'
--     9.11 lesson_ai_index      "Admins can manage lesson_ai_index"
--                               role IN ('admin', 'lecturer')
--     (materials and assignment_submissions were already corrected by 0005 and
--      are reproduced in their corrected form in 9.1 and 9.4.)
--   These are flagged for review; none was changed.
--
-- ============================================================================
-- END OF MIGRATION 0051
-- ============================================================================
