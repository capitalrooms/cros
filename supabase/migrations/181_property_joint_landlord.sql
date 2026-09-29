-- Add second landlord support to properties
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS landlord_id_2 UUID REFERENCES public.people(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_properties_landlord2 ON public.properties(landlord_id_2);
