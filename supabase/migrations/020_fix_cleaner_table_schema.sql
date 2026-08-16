-- Fix cleaner_jobs table: rename to cleans and align columns with app expectations

-- Check if cleaner_jobs exists before attempting operations
DO $$
BEGIN
  -- Only proceed if cleaner_jobs exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleaner_jobs') THEN
    -- Rename table
    ALTER TABLE cleaner_jobs RENAME TO cleans;

    -- Rename columns to match app expectations
    ALTER TABLE cleans RENAME COLUMN scheduled_date TO clean_date;
    ALTER TABLE cleans RENAME COLUMN scheduled_slot TO clean_time;

    -- Add missing fields required by the app
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS admin_note TEXT;
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS cleaner_note TEXT;
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS extra_charge NUMERIC(10,2);
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS extra_charge_note TEXT;
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS products_cost NUMERIC(10,2);
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS tenant_todos JSONB;
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS special_jobs JSONB;

    -- Rename FK constraints if they exist
    BEGIN
      ALTER TABLE cleans RENAME CONSTRAINT cleaner_jobs_property_id_fkey TO cleans_property_id_fkey;
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;

    BEGIN
      ALTER TABLE cleans RENAME CONSTRAINT cleaner_jobs_cleaner_id_fkey TO cleans_cleaner_id_fkey;
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;

    -- Drop old indexes if they exist
    DROP INDEX IF EXISTS idx_cleaner_jobs_property_id;
    DROP INDEX IF EXISTS idx_cleaner_jobs_cleaner_id;
    DROP INDEX IF EXISTS idx_cleaner_jobs_clean_date;

    -- Create new indexes
    CREATE INDEX IF NOT EXISTS idx_cleans_property_id ON cleans(property_id);
    CREATE INDEX IF NOT EXISTS idx_cleans_cleaner_id ON cleans(cleaner_id);
    CREATE INDEX IF NOT EXISTS idx_cleans_clean_date ON cleans(clean_date);

  END IF;
END $$;

-- Alternative: If cleans table already exists (migration was already run), just add missing columns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleans') THEN
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS admin_note TEXT;
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS cleaner_note TEXT;
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS extra_charge NUMERIC(10,2);
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS extra_charge_note TEXT;
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS products_cost NUMERIC(10,2);
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS tenant_todos JSONB;
    ALTER TABLE cleans ADD COLUMN IF NOT EXISTS special_jobs JSONB;
  END IF;
END $$;
