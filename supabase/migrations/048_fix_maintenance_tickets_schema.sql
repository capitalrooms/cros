-- Migration 048: Add missing columns to maintenance_tickets
-- Enables contractor scheduling and completion tracking

-- Scheduling fields (critical for contractor booking)
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS booked_date DATE;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS booked_slot VARCHAR(50); -- e.g., "14:00-15:00"

-- Approval & workflow
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS on_hold BOOLEAN DEFAULT false;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS hold_reason TEXT;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS cause TEXT;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- Completion tracking
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS completion_notes TEXT;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS photo_before_url TEXT;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS photo_after_url TEXT;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2);
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS cost_notes TEXT;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS return_visit_needed BOOLEAN DEFAULT false;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS return_visit_reason TEXT;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS return_visit_notes TEXT;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS return_visit_date_estimate DATE;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_booked_date ON maintenance_tickets(booked_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_approved_at ON maintenance_tickets(approved_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_contractor_booked ON maintenance_tickets(contractor_id, booked_date) WHERE booked_date IS NOT NULL;
