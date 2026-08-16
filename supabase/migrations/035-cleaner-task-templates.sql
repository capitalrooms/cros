-- Migration 035: Cleaner Task Templates
-- Preset tasks admin can select when adding notes for cleaner's next visit

CREATE TABLE IF NOT EXISTS public.cleaner_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_key VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT, -- e.g., "Clean bathroom ensuite including tiles and mirror"
  category VARCHAR(50), -- e.g., 'rooms', 'kitchen', 'communal', 'deep_clean'
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pre-seed common cleaner tasks
INSERT INTO public.cleaner_task_templates (task_key, display_name, description, category, sort_order) VALUES
  ('clean_ensuite', 'Clean ensuite/bathroom', 'Clean ensuite including tiles, mirror, fixtures', 'rooms', 10),
  ('clean_bedroom', 'Clean bedroom', 'Vacuum, dust, change linens if needed', 'rooms', 20),
  ('deep_clean_kitchen', 'Deep clean kitchen oven', 'Deep clean inside oven and stovetop', 'kitchen', 30),
  ('polish_windows', 'Polish windows', 'Clean and polish all windows', 'communal', 40),
  ('vacuum_hallway', 'Vacuum hallway', 'Vacuum stairs and hallway carpets thoroughly', 'communal', 50),
  ('clean_fridge', 'Clean fridge/freezer', 'Empty, wipe down shelves, discard expired items', 'kitchen', 60),
  ('deep_clean_bathroom', 'Deep clean bathroom', 'Scrub tiles, grout, fixtures thoroughly', 'deep_clean', 70),
  ('dust_surfaces', 'Dust all surfaces', 'Dust shelves, furniture, picture frames', 'communal', 80),
  ('mop_floors', 'Mop hard floors', 'Mop kitchen, hallway, bathroom tiles', 'communal', 90),
  ('clean_mirrors', 'Polish mirrors', 'Clean and polish all mirrors in property', 'communal', 100),
  ('organize_storage', 'Organize storage areas', 'Tidy cupboards and storage spaces', 'communal', 110)
ON CONFLICT (task_key) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cleaner_task_templates_is_active ON public.cleaner_task_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_cleaner_task_templates_category ON public.cleaner_task_templates(category);
CREATE INDEX IF NOT EXISTS idx_cleaner_task_templates_sort_order ON public.cleaner_task_templates(sort_order);

-- RLS (public read for app display)
ALTER TABLE public.cleaner_task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active task templates" ON public.cleaner_task_templates FOR SELECT
USING (is_active = true);

CREATE POLICY "Admin can manage task templates" ON public.cleaner_task_templates FOR ALL
USING ((SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin'))
WITH CHECK ((SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin'));
