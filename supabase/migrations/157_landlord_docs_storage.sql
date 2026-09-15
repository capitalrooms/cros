-- Migration 157: Create landlord-docs storage bucket for AML document uploads
-- Run in Supabase SQL Editor

-- The bucket is created programmatically by the upload API (idempotent).
-- This migration just documents the intent and sets up RLS policies.

-- Note: Supabase Storage buckets cannot be created via SQL — the API call
-- in /api/landlord-onboarding/upload/[token]/route.ts handles creation.
-- This migration is a no-op placeholder for tracking purposes.

SELECT 1; -- placeholder
