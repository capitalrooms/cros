-- Migration 151: Notice Board v2
-- Adds new notice types: 'house_reminder' (anonymous from housemate concern flow)
-- and 'update' (transient peer-to-peer updates).
-- Also adds optional deadline field for task notices.

-- Drop old check constraint and replace with updated list
ALTER TABLE communal_notices
  DROP CONSTRAINT IF EXISTS communal_notices_notice_type_check;

ALTER TABLE communal_notices
  ADD CONSTRAINT communal_notices_notice_type_check
    CHECK (notice_type IN ('info', 'task', 'house_reminder', 'update'));

-- Add optional deadline for task notices
ALTER TABLE communal_notices
  ADD COLUMN IF NOT EXISTS deadline DATE;

-- Allow created_by to be NULL (for anonymous house_reminder notices)
ALTER TABLE communal_notices
  ALTER COLUMN created_by DROP NOT NULL;

-- Index for type filtering
CREATE INDEX IF NOT EXISTS idx_communal_notices_type ON communal_notices(notice_type);
