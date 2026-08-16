-- Fix Cleaner Table Schema
-- Renames cleaner_jobs to cleans, aligns field names with app expectations, and adds missing fields

-- 1. Rename cleaner_jobs table to cleans
ALTER TABLE IF EXISTS public.cleaner_jobs RENAME TO cleans;

-- 2. Rename columns to match app expectations
ALTER TABLE public.cleans RENAME COLUMN scheduled_date TO clean_date;
ALTER TABLE public.cleans RENAME COLUMN scheduled_slot TO clean_time;

-- 3. Add missing fields that the app expects
ALTER TABLE public.cleans ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE public.cleans ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.cleans ADD COLUMN IF NOT EXISTS cleaner_note TEXT;
ALTER TABLE public.cleans ADD COLUMN IF NOT EXISTS extra_charge NUMERIC(10, 2);
ALTER TABLE public.cleans ADD COLUMN IF NOT EXISTS extra_charge_note TEXT;
ALTER TABLE public.cleans ADD COLUMN IF NOT EXISTS products_cost NUMERIC(10, 2);
ALTER TABLE public.cleans ADD COLUMN IF NOT EXISTS tenant_todos JSONB;
ALTER TABLE public.cleans ADD COLUMN IF NOT EXISTS special_jobs JSONB;

-- 4. Rename constraint names to reflect new table name
ALTER TABLE public.cleans RENAME CONSTRAINT cleaner_jobs_property_id_fkey TO cleans_property_id_fkey;
ALTER TABLE public.cleans RENAME CONSTRAINT cleaner_jobs_cleaner_id_fkey TO cleans_cleaner_id_fkey;
ALTER TABLE public.cleans RENAME CONSTRAINT cleaner_jobs_status_check TO cleans_status_check;

-- 5. Drop and recreate indexes with new names
DROP INDEX IF EXISTS idx_cleaner_jobs_property;
CREATE INDEX IF NOT EXISTS idx_cleans_property_id ON public.cleans(property_id);

DROP INDEX IF EXISTS idx_cleaner_jobs_scheduled_date;
CREATE INDEX IF NOT EXISTS idx_cleans_clean_date ON public.cleans(clean_date);

DROP INDEX IF EXISTS idx_cleaner_jobs_cleaner_id;
CREATE INDEX IF NOT EXISTS idx_cleans_cleaner_id ON public.cleans(cleaner_id);

DROP INDEX IF EXISTS idx_cleaner_jobs_status;
CREATE INDEX IF NOT EXISTS idx_cleans_status ON public.cleans(status);

-- 6. Drop old RLS policies and create new ones with updated table name
DROP POLICY IF EXISTS "anyone_can_read_cleaner_jobs" ON public.cleans;
DROP POLICY IF EXISTS "authenticated_can_insert_cleaner_jobs" ON public.cleans;
DROP POLICY IF EXISTS "authenticated_can_update_cleaner_jobs" ON public.cleans;
DROP POLICY IF EXISTS "authenticated_can_delete_cleaner_jobs" ON public.cleans;

CREATE POLICY "anyone_can_read_cleans" ON public.cleans
  FOR SELECT USING (true);

CREATE POLICY "authenticated_can_insert_cleans" ON public.cleans
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_update_cleans" ON public.cleans
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_delete_cleans" ON public.cleans
  FOR DELETE USING (auth.role() = 'authenticated');

-- 7. Update trigger name (the function update_cleaner_jobs_updated_at → drop and recreate)
DROP TRIGGER IF EXISTS update_cleaner_jobs_updated_at ON public.cleans;
CREATE TRIGGER update_cleans_updated_at BEFORE UPDATE ON public.cleans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
