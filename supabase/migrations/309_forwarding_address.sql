-- 309 — where post for a tenant goes after they leave (family home, a new address) (24 Nov 2026).
-- Kept apart from home_address, which is the address on the tenancy. Staff see it; the tenant can change it.
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS forwarding_address TEXT;
