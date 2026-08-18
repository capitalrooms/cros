-- Add tenant visibility flag to property_documents.
-- Documents default to admin-only (false). Admin must explicitly opt them
-- in to the tenant info pack by toggling visible_to_tenants = true.
-- Applied directly to production DB via Supabase Management API (2026-08-17).

ALTER TABLE public.property_documents
  ADD COLUMN IF NOT EXISTS visible_to_tenants BOOLEAN NOT NULL DEFAULT false;
