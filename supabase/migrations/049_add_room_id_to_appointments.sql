-- Add room_id to property_appointments for viewing-specific targeting

ALTER TABLE property_appointments
ADD COLUMN room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;

-- Index for room-based queries
CREATE INDEX idx_property_appointments_room_id ON property_appointments(room_id);

-- Update RLS policy for tenants to show room-specific appointments
-- (existing policy already handles this via tenancies join)
