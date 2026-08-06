-- Add lettings-specific columns to rooms table
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'occupied',
ADD COLUMN IF NOT EXISTS current_rent NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS asking_rent NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS available_date DATE,
ADD COLUMN IF NOT EXISTS days_on_market INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS marketing_status VARCHAR(50) DEFAULT 'not_listed';

-- Create viewings table
CREATE TABLE IF NOT EXISTS public.viewings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  viewing_date DATE NOT NULL,
  viewing_slot VARCHAR(50),
  status VARCHAR(20) DEFAULT 'scheduled',
  visitor_name VARCHAR(255),
  visitor_email VARCHAR(255),
  visitor_phone VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create rent tracking table
CREATE TABLE IF NOT EXISTS public.rent_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.people(id),
  tenant_email VARCHAR(255),
  lease_start_date DATE,
  lease_end_date DATE,
  amount_due NUMERIC(10, 2) NOT NULL,
  amount_paid NUMERIC(10, 2),
  due_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_available_date ON public.rooms(available_date);
CREATE INDEX IF NOT EXISTS idx_viewings_room_id ON public.viewings(room_id);
CREATE INDEX IF NOT EXISTS idx_viewings_viewing_date ON public.viewings(viewing_date);
CREATE INDEX IF NOT EXISTS idx_viewings_status ON public.viewings(status);
CREATE INDEX IF NOT EXISTS idx_rent_tracking_room_id ON public.rent_tracking(room_id);
CREATE INDEX IF NOT EXISTS idx_rent_tracking_status ON public.rent_tracking(status);
CREATE INDEX IF NOT EXISTS idx_rent_tracking_due_date ON public.rent_tracking(due_date);

-- Enable Row Level Security
ALTER TABLE public.viewings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_tracking ENABLE ROW LEVEL SECURITY;

-- Create triggers for updated_at
CREATE TRIGGER IF NOT EXISTS update_rooms_lettings_updated_at BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_viewings_updated_at BEFORE UPDATE ON public.viewings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_rent_tracking_updated_at BEFORE UPDATE ON public.rent_tracking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
