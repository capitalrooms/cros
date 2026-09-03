-- Landlord onboarding & AML pipeline
-- One row per prospective landlord, tracks from new enquiry through to fully onboarded

CREATE TABLE IF NOT EXISTS landlord_onboarding (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token           UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL, -- public form link token

  -- Contact
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,

  -- Stage 1–6 (see stage definitions in app)
  stage           INT NOT NULL DEFAULT 1,

  -- AML form: type flags set when landlord submits
  entity_type     TEXT CHECK (entity_type IN ('individual','company')),
  property_count  TEXT CHECK (property_count IN ('single','multiple')),

  -- AML form data (submitted by landlord, stored as JSONB)
  form_data       JSONB,

  -- Admin: verification checklist ticks (JSONB array of checked item keys)
  verification_checks JSONB DEFAULT '[]'::jsonb,
  verification_notes  TEXT,
  verified_by     UUID REFERENCES people(id),
  verified_at     TIMESTAMPTZ,

  -- Stage timestamps
  welcome_sent_at    TIMESTAMPTZ,
  docs_received_at   TIMESTAMPTZ,
  approval_sent_at   TIMESTAMPTZ,
  agreement_sent_at  TIMESTAMPTZ,
  onboarded_at       TIMESTAMPTZ,

  created_by      UUID REFERENCES people(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landlord_onboarding_stage   ON landlord_onboarding(stage);
CREATE INDEX IF NOT EXISTS idx_landlord_onboarding_email   ON landlord_onboarding(email);
CREATE INDEX IF NOT EXISTS idx_landlord_onboarding_token   ON landlord_onboarding(token);

-- RLS: admins full access, public can read/write their own row via token (no auth needed)
ALTER TABLE landlord_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "landlord_onboarding_admin" ON landlord_onboarding;
CREATE POLICY "landlord_onboarding_admin"
  ON landlord_onboarding FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM people p
      WHERE p.email = auth.jwt()->>'email'
        AND p.role IN ('administrator','admin','lettings')
    )
  );

-- Public insert (new enquiry created via API with service key — no policy needed for that)
-- Public select via token: used by the public form page (anon key)
DROP POLICY IF EXISTS "landlord_onboarding_public_token" ON landlord_onboarding;
CREATE POLICY "landlord_onboarding_public_token"
  ON landlord_onboarding FOR SELECT
  TO anon
  USING (true); -- token checked in application layer

DROP POLICY IF EXISTS "landlord_onboarding_public_submit" ON landlord_onboarding;
CREATE POLICY "landlord_onboarding_public_submit"
  ON landlord_onboarding FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
