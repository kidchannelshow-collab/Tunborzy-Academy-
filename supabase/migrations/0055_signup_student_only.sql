-- ============================================================================
-- MIGRATION 0055 — PUBLIC SIGN-UP IS STUDENT-ONLY
-- Project: mnmuowgbbcczsqoxxjem
-- ============================================================================
-- WHY THIS IS REQUIRED (the frontend change alone is NOT sufficient)
--
--   SignUp.tsx now hard-codes role = 'Student' and no longer renders a role
--   selector, so the normal UI can only create students. But the profiles row is
--   written by the browser: after supabase.auth.signUp the client calls
--   `profiles.upsert({ ..., role })` directly. Anyone who edits the request can
--   send any role they like, so the restriction has to exist in the database.
--
--   Migration 0001 already added a guard trigger for this:
--
--       IF auth.role() <> 'service_role' AND NEW.role IN ('Admin', 'Lecturer')
--
--   That test is case-sensitive and only catches the capitalised spellings. The
--   RLS policies in 0052/0054 accept BOTH spellings, e.g.
--
--       role IN ('Admin','admin','Lecturer','lecturer')
--
--   so a client submitting the lowercase 'admin' passes every admin policy while
--   slipping straight past the 0001 trigger. The gap is real and this migration
--   closes it by comparing case-insensitively.
--
--   Admin and Lecturer accounts are unaffected: they are created by the
--   admin-provision-user Edge Function, which runs as service_role and is
--   deliberately let through by the branch above.
--
-- SAFETY
--   CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + CREATE TRIGGER.
--   Idempotent; safe to run repeatedly. No table is altered. No column is added
--   or dropped. No existing row is read, updated or deleted — the trigger is
--   BEFORE INSERT OR UPDATE only, so every existing user (Admin, Lecturer and
--   Student alike) keeps their current role untouched.
--
--   Updates that do not change the role are still allowed, so an existing admin
--   or lecturer can keep editing their own profile normally.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_privileged_role_self_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- service_role is the Edge Function's own key; it must stay able to provision
  -- Admin and Lecturer accounts.
  IF auth.role() <> 'service_role' THEN
    -- Case-insensitive: 'Admin', 'admin', 'ADMIN' are all equally privileged
    -- because the RLS policies match on both casings.
    IF lower(coalesce(NEW.role, '')) IN ('admin', 'lecturer') THEN
      -- A no-op update (role unchanged) is allowed, so staff can still save
      -- edits to the rest of their profile.
      IF TG_OP = 'UPDATE'
         AND lower(coalesce(OLD.role, '')) = lower(coalesce(NEW.role, '')) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Admin and Lecturer roles can only be assigned by a trusted server process.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_privileged_role_self_assignment ON public.profiles;

CREATE TRIGGER trg_prevent_privileged_role_self_assignment
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privileged_role_self_assignment();

NOTIFY pgrst, 'reload schema';
