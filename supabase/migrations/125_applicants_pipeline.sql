-- Applicant pipeline: unified applicants table + cross-links
-- Covers:
--   1. Create applicants table (was migration 050, never applied to live DB)
--   2. Add pipeline_stage + viewing_id + offer_id + converted_person_id
--   3. Link offers back to applicants (offers.applicant_id)
--   4. Link people back to applicants (people.applicant_id)
--
-- Safe to run multiple times: all DDL uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

-- ─── 1. Core applicants table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  -- Where did this applicant come from?
  viewing_id UUID REFERENCES viewings(id) ON DELETE SET NULL,

  -- Pipeline stage (progresses forward only in normal flow)
  -- invited            → invite email/SMS sent, no form submitted yet
  -- applied            → applicant submitted the /applicant/apply form
  -- offer_sent         → "The Search Is Over" / offer letter sent
  -- referencing        → passed to Homeppl / referencing provider
  -- referencing_passed → references cleared
  -- docs_uploaded      → tenancy docs signed/uploaded
  -- converted          → tenant record created in people table
  pipeline_stage VARCHAR(50) NOT NULL DEFAULT 'invited',

  -- Set when offer is sent
  offer_id UUID,  -- FK added after offers table confirmed to exist

  -- Set when converted to tenant
  converted_person_id UUID REFERENCES people(id) ON DELETE SET NULL,

  -- Personal info
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  date_of_birth DATE,

  -- Current situation
  current_address TEXT,
  profession VARCHAR(255),
  salary VARCHAR(50),
  linkedin_url TEXT,

  -- Rental preferences
  preferred_start_date DATE,
  preferred_term VARCHAR(50),

  -- Tell Us About Yourself
  bio TEXT,
  interests TEXT,
  profession_description TEXT,

  -- What Are You Like to Live With
  sociability VARCHAR(50),
  house_preferences TEXT,
  communication_style TEXT,

  -- About This Room
  room_requirements TEXT,
  room_conditions TEXT,

  -- Rent negotiation
  advertised_rent DECIMAL(10,2),
  rent_offer_type VARCHAR(50) DEFAULT 'asking',
  offered_rent DECIMAL(10,2),

  -- Rental history
  previous_addresses JSONB DEFAULT '[]',

  -- Review tracking (admin)
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES people(id) ON DELETE SET NULL,
  admin_notes TEXT,

  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── 2. Add FK to offers (safe: offers table already exists) ─────────────────

ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES offers(id) ON DELETE SET NULL;

-- ─── 3. Back-link: offers → applicants ───────────────────────────────────────

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS applicant_id UUID REFERENCES applicants(id) ON DELETE SET NULL;

-- ─── 4. Back-link: people → applicants ───────────────────────────────────────

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS applicant_id UUID REFERENCES applicants(id) ON DELETE SET NULL;

-- ─── 5. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_applicants_room_id       ON applicants(room_id);
CREATE INDEX IF NOT EXISTS idx_applicants_property_id   ON applicants(property_id);
CREATE INDEX IF NOT EXISTS idx_applicants_email         ON applicants(email);
CREATE INDEX IF NOT EXISTS idx_applicants_stage         ON applicants(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_applicants_viewing_id    ON applicants(viewing_id);
CREATE INDEX IF NOT EXISTS idx_applicants_converted     ON applicants(converted_person_id) WHERE converted_person_id IS NOT NULL;

-- ─── 6. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE applicants ENABLE ROW LEVEL SECURITY;

-- Admins and lettings agents can see and manage all applicants
CREATE POLICY IF NOT EXISTS "applicants_admin_all" ON applicants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE people.email = auth.jwt()->>'email'
        AND people.role IN ('administrator', 'admin', 'lettings')
    )
  );

-- Applicants can read their own record by email (for the /applicant/review page)
CREATE POLICY IF NOT EXISTS "applicants_self_read" ON applicants
  FOR SELECT
  USING (email = auth.jwt()->>'email');
