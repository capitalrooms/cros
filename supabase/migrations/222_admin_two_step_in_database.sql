-- 222 — Administrators need two-step sign-in, enforced by the database itself (14 Oct 2026, "fort knox").
-- The app already refuses an administrator who hasn't set up / entered their authenticator code (lib/auth/aal);
-- this makes the database's own access rules agree, so a stolen password alone can't read anything by talking to
-- the database directly. An administrator's role only counts when the session token says "aal2" (code entered).
-- Lettings and other roles are unchanged.
--
-- RUN THIS ONLY AFTER Harry has set up two-step sign-in on /account and signed in with the code — otherwise the
-- office screens show nothing until he does. Safe to run more than once.

CREATE OR REPLACE FUNCTION public.cros_my_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
           WHEN p.role IN ('administrator', 'admin') AND COALESCE(auth.jwt()->>'aal', 'aal1') <> 'aal2' THEN 'unverified'
           ELSE p.role
         END
    FROM public.people p
   WHERE lower(p.email) = lower(auth.jwt()->>'email')
   ORDER BY p.created_at LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.cros_is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.cros_my_role() IN ('administrator', 'admin'), FALSE)
$$;

CREATE OR REPLACE FUNCTION public.cros_is_staff() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.cros_my_role() IN ('administrator', 'admin', 'lettings'), FALSE)
$$;
