-- Migration 131: Demote test/dummy admin accounts
--
-- These accounts were created by the setup scripts during development and
-- should not be in the admin pool in production. Changing their role to
-- 'inactive' stops them from:
--   • being picked up by AutoLedger's admin fan-out query
--   • appearing in any role-based admin guard check
--   • receiving in-app notifications
--
-- Roles changed: 'administrator' / 'admin'  →  'inactive'
-- Accounts affected:
--   admin+test@capitalrooms.co.uk   (created by quick-setup / finalize-setup scripts)
--   admin@example.com               (dummy account — example.com is a reserved test domain)
--
-- Nothing in the live app grants access based on role = 'inactive', so
-- this is safe to run without breaking any live workflow.

UPDATE public.people
SET role = 'inactive'
WHERE email IN ('admin+test@capitalrooms.co.uk', 'admin@example.com')
  AND role IN ('administrator', 'admin');
