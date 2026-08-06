-- Clean Lettings Schema - ONLY what's needed
-- Adds lettings-specific columns to rooms table

ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'occupied',
ADD COLUMN IF NOT EXISTS previous_rent NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS current_asking_rent NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS available_date DATE,
ADD COLUMN IF NOT EXISTS days_on_market INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS marketing_status VARCHAR(50) DEFAULT 'not_listed',
ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT false;

-- Create viewings table (for managing room viewings)
CREATE TABLE IF NOT EXISTS public.viewings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  viewing_date DATE NOT NULL,
  viewing_slot VARCHAR(50),
  visitor_name VARCHAR(255),
  visitor_email VARCHAR(255),
  visitor_phone VARCHAR(20),
  viewing_status VARCHAR(50) DEFAULT 'scheduled',
  feedback TEXT,
  viewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_available_date ON public.rooms(available_date);
CREATE INDEX IF NOT EXISTS idx_rooms_is_priority ON public.rooms(is_priority);
CREATE INDEX IF NOT EXISTS idx_viewings_room_id ON public.viewings(room_id);
CREATE INDEX IF NOT EXISTS idx_viewings_viewing_date ON public.viewings(viewing_date);
CREATE INDEX IF NOT EXISTS idx_viewings_viewing_status ON public.viewings(viewing_status);

-- Enable Row Level Security
ALTER TABLE public.viewings ENABLE ROW LEVEL SECURITY;

-- Create trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_viewings_updated_at BEFORE UPDATE ON public.viewings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
