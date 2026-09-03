-- Suspected Activity Report log — internal SAR records for MLRO
-- Mirrors the Capital Rooms "Suspected Money Laundering Activity Report Form"

CREATE TABLE IF NOT EXISTS sar_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reporter
  reported_by           UUID REFERENCES people(id),
  reported_by_name      TEXT NOT NULL,
  reported_by_title     TEXT,
  is_urgent             BOOLEAN DEFAULT false,
  response_needed_by    DATE,

  -- Suspected activity
  subject_name          TEXT,           -- name(s) of person(s) involved
  subject_address       TEXT,
  subject_business      TEXT,           -- if company
  activity_description  TEXT NOT NULL,  -- what, when, where, how
  activity_value        TEXT,           -- approximate value if known
  suspicion_reason      TEXT NOT NULL,  -- nature of suspicions

  -- Investigation
  investigation_known   BOOLEAN DEFAULT false,
  investigation_details TEXT,
  discussed_with_others BOOLEAN DEFAULT false,
  discussed_with_whom   TEXT,
  other_info            TEXT,

  -- MLRO decision (filled in by MLRO)
  mlro_received_at      TIMESTAMPTZ,
  mlro_acknowledged_at  TIMESTAMPTZ,
  reasonable_grounds     BOOLEAN,       -- grounds for suspecting ML?
  report_to_nca         BOOLEAN,        -- will/did SAR go to NCA?
  nca_report_date       DATE,
  nca_liaison_details   TEXT,
  notice_period_from    DATE,
  notice_period_to      DATE,
  moratorium_from       DATE,
  moratorium_to         DATE,
  consent_required      BOOLEAN,
  consent_received_date DATE,
  non_disclosure_reason TEXT,           -- if grounds but NOT reporting to NCA
  mlro_other_info       TEXT,
  mlro_signed_by        UUID REFERENCES people(id),
  mlro_signed_at        TIMESTAMPTZ,

  -- Metadata
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Must be retained for at least 5 years (per form footer)
CREATE INDEX IF NOT EXISTS idx_sar_log_reported_by ON sar_log(reported_by);
CREATE INDEX IF NOT EXISTS idx_sar_log_created_at  ON sar_log(created_at DESC);

-- RLS: admin only
ALTER TABLE sar_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sar_log_admin" ON sar_log;
CREATE POLICY "sar_log_admin"
  ON sar_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM people p
      WHERE p.email = auth.jwt()->>'email'
        AND p.role IN ('administrator','admin','lettings')
    )
  );
