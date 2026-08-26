-- Migration 067: Create room images table for galleries
-- Stores images of individual rooms (bedroom, ensuite, floor plan, etc.)

CREATE TABLE IF NOT EXISTS public.room_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  image_type VARCHAR(50) NOT NULL, -- e.g., 'bedroom', 'ensuite', 'floor_plan', 'gallery'
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL, -- URL to the image in storage
  storage_path VARCHAR(255), -- Path in Supabase storage
  display_order INTEGER DEFAULT 0,
  uploaded_by UUID REFERENCES public.people(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_room_images_room_id ON public.room_images(room_id);
CREATE INDEX IF NOT EXISTS idx_room_images_type ON public.room_images(image_type);
CREATE INDEX IF NOT EXISTS idx_room_images_order ON public.room_images(room_id, display_order);

-- Enable RLS
ALTER TABLE public.room_images ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "anyone_can_read_room_images" ON public.room_images
  FOR SELECT USING (true);

CREATE POLICY "authenticated_can_insert_room_images" ON public.room_images
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_update_room_images" ON public.room_images
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_delete_room_images" ON public.room_images
  FOR DELETE USING (auth.role() = 'authenticated');

-- Trigger for updated_at
CREATE TRIGGER update_room_images_updated_at BEFORE UPDATE ON public.room_images
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
