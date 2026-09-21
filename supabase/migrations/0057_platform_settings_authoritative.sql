-- ============================================================================
-- 0057 — PLATFORM SETTINGS BECOME AUTHORITATIVE
-- ============================================================================
--
-- WHY THIS IS NEEDED
--
-- 0047 created `platform_settings` and seeded six categories. Three of them are
-- read by real code (`general` drives branding + the maintenance gate). The rest
-- — `academic`, `cbt` — were written by the admin form in
-- src/components/admin/SystemSettings.tsx and read by NOTHING. An admin could
-- close the UTME session or switch the semester and not one student-facing page
-- or server route changed behaviour.
--
-- The counterpart gap: `academic.undergraduate_levels` advertised
-- ["100L","200L","300L","400L","500L"], but the platform only ever writes
-- '100 Level' (CourseManagement.tsx:530, CourseTemplatesModal.tsx:24) and only
-- 100 Level content exists. The setting promised support that was never built.
--
-- WHAT THIS DOES
--
--   1. Ensures the `general`, `academic` and `cbt` rows exist, filling in any
--      missing keys WITHOUT overwriting a value an admin has already saved.
--   2. Corrects `academic` to describe the platform as it actually is:
--      undergraduate level is 100 Level only, and the semester is one of exactly
--      two values (a single active semester, so "only one at a time" is
--      structural rather than something that has to be enforced by a trigger).
--   3. Corrects `cbt` to carry the keys the gates now read.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
--   * No RLS change. 0047 already grants SELECT on every category to any
--     authenticated user, which is exactly what the student-facing consumers
--     need, and 0056 already grants anon SELECT on `general` for the maintenance
--     screen. No policy is dropped, altered or relaxed here.
--   * No new table. `cbt` already carries the per-portal enable flags; the UTME
--     and Post-UTME "session open/closed" state IS that flag. Creating a second
--     session table would have duplicated an existing configuration system.
--   * No DELETEs anywhere. Closing a session changes a boolean; it never touches
--     attempts, scores, users or any historical row.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Guarantee the public read policy exists.
--
-- 0056 introduced this policy so a signed-OUT visitor can read the `general`
-- row — without it a visitor reads zero rows, the frontend cannot learn that
-- maintenance mode is on, and the maintenance screen can never appear on the
-- landing, sign-in or sign-up pages, i.e. exactly the public surfaces it exists
-- to cover. Whether 0056 has been applied to this database is not knowable from
-- the frontend, so the policy is restated here rather than assumed.
--
-- This is the SAME policy 0056 defines: additive, scoped to category = 'general'
-- only, and it drops nothing. academic, cbt, premium, partnership and
-- notification stay readable only by signed-in users, as 0047 set them up.
-- Idempotent either way — reapplying it changes nothing.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can read general platform settings" ON public.platform_settings;

CREATE POLICY "Public can read general platform settings"
ON public.platform_settings
FOR SELECT
TO anon, authenticated
USING (category = 'general');

-- ---------------------------------------------------------------------------
-- 1. Ensure the three rows exist.
--
-- ON CONFLICT DO NOTHING, so a row an admin has already customised is left
-- exactly as it is. Only a genuinely absent row gets the seed.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (category, settings) VALUES
  ('general', '{}'::jsonb),
  ('academic', '{}'::jsonb),
  ('cbt', '{}'::jsonb)
ON CONFLICT (category) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Fill in missing keys only.
--
-- `defaults || settings` is jsonb concatenation: for a duplicated key the
-- RIGHT-hand operand wins, so a saved value is preserved and only absent keys
-- are supplied by the defaults on the left.
-- ---------------------------------------------------------------------------

-- General — platform identity and the maintenance flag read by App.tsx.
UPDATE public.platform_settings
SET settings = '{
      "platform_name": "Tunborzy Academy",
      "platform_description": "Excellence in Academic and CBT Preparation",
      "support_email": "support@tunborzy.edu.ng",
      "support_phone": "+234 800 000 0000",
      "maintenance_mode": false
    }'::jsonb || settings,
    updated_at = NOW()
WHERE category = 'general';

-- Academic — the active session label and the single active semester.
UPDATE public.platform_settings
SET settings = '{
      "current_academic_session": "2026/2027",
      "current_semester": "First Semester"
    }'::jsonb || settings,
    updated_at = NOW()
WHERE category = 'academic';

-- CBT — the per-portal session flags and the shared exam defaults.
UPDATE public.platform_settings
SET settings = '{
      "undergraduate_cbt_enabled": true,
      "utme_cbt_enabled": true,
      "post_utme_cbt_enabled": true,
      "default_exam_duration_mins": 30,
      "default_question_count": 40
    }'::jsonb || settings,
    updated_at = NOW()
WHERE category = 'cbt';

-- ---------------------------------------------------------------------------
-- 3. Correct the academic row to match the platform as built.
--
-- These are deliberate OVERWRITES, not merges — the old values described
-- capability that does not exist.
-- ---------------------------------------------------------------------------

-- Undergraduate supports 100 Level only. 200–500 Level were never built: no
-- writer anywhere sets courses.level to anything but '100 Level', and no
-- student-facing page reads this setting. Storing the unsupported levels made
-- the admin UI advertise levels that have no content behind them.
UPDATE public.platform_settings
SET settings = jsonb_set(settings, '{undergraduate_levels}', '["100 Level"]'::jsonb, true),
    updated_at = NOW()
WHERE category = 'academic'
  AND COALESCE(settings -> 'undergraduate_levels', 'null'::jsonb) <> '["100 Level"]'::jsonb;

-- A single active semester means exactly two legal values. Anything else (the
-- old "Summer / Rain Semester" option, or a hand-edited value) falls back to
-- First Semester so the student-facing semester filter is never left with a
-- value that matches no course.
UPDATE public.platform_settings
SET settings = jsonb_set(settings, '{current_semester}', '"First Semester"'::jsonb, true),
    updated_at = NOW()
WHERE category = 'academic'
  AND settings ->> 'current_semester' IS DISTINCT FROM 'First Semester'
  AND settings ->> 'current_semester' IS DISTINCT FROM 'Second Semester';
