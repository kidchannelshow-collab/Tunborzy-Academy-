-- ============================================================================
-- 0056 — PUBLIC READ OF GENERAL PLATFORM SETTINGS
-- ============================================================================
--
-- WHY THIS IS NEEDED
--
-- 0047 created `platform_settings` with two policies:
--   * "Admins can manage platform settings"      FOR ALL  (role = 'Admin')
--   * "Authenticated users can read platform settings" FOR SELECT
--         USING (auth.uid() IS NOT NULL)
--
-- The second one is the problem. A signed-OUT visitor has auth.uid() = NULL, so
-- they read zero rows — which means the frontend cannot learn that maintenance
-- mode is on. The maintenance screen therefore could never be shown on the
-- landing page, the login page or the sign-up page, i.e. exactly the public
-- surfaces it exists to cover.
--
-- WHAT THIS DOES
--
-- Adds one additive SELECT policy for the 'general' category only. It does not
-- drop, alter or relax any existing policy, and it does not expose any other
-- category: academic, cbt, premium, partnership and notification settings stay
-- admin-only, because the policy is scoped with `category = 'general'`.
--
-- The 'general' category contains only public-facing values — platform name,
-- description, support email, support phone and the maintenance flag. Every one
-- of these is already shown to visitors on the public site, so this reveals
-- nothing that is not intended to be public. No user data is involved.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

DROP POLICY IF EXISTS "Public can read general platform settings" ON public.platform_settings;

CREATE POLICY "Public can read general platform settings"
ON public.platform_settings
FOR SELECT
TO anon, authenticated
USING (category = 'general');
