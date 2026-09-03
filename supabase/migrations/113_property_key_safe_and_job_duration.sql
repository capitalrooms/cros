-- Migration 113: Key safe code on properties + duration estimate on maintenance tickets

-- Key safe code: stored on the property, shown to contractor/cleaner only after they have
-- booked/confirmed a job through the system (enforced at the app layer).
ALTER TABLE properties ADD COLUMN IF NOT EXISTS key_safe_code TEXT;

-- Estimated job duration: AI-generated hint set at job creation, always editable.
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS duration_estimate_minutes INTEGER;
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS duration_estimate_label TEXT; -- e.g. "1–2 hours"

-- Time confirmation flag: set when contractor/cleaner commits to an exact slot
-- (as opposed to just a day). The day-then-time flow uses booked_date + booked_slot;
-- this flag makes the "unconfirmed time" state explicit for the red clock indicator.
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS time_confirmed BOOLEAN DEFAULT false;
