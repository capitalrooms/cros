-- Migration 183: restore tables + one column that live features expect but were never created in production.
--
-- Found by the 27 Sep 2026 admin audit (every query in the app validated against the live schema).
-- Definitions come from migrations that were written but never applied (094, 104, 138, 173, 045, 087,
-- _archive/030, 033, 035, 036) — adjusted to match what the code actually reads and writes.
--
-- ADDITIVE ONLY: creates missing tables/columns/indexes/policies. Never drops or alters existing data.
-- Idempotent: safe to run more than once.
--
-- Access rule used throughout: staff = people row whose email matches the signed-in user
-- (people.id is NOT auth.uid() in this project).

-- ── helper: is the signed-in user staff? ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cros_is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.people
    WHERE lower(people.email) = lower(auth.jwt()->>'email')
      AND people.role IN ('administrator', 'admin', 'lettings')
  )
$$;

-- Create a policy only if it isn't there yet (CREATE POLICY has no IF NOT EXISTS)
CREATE OR REPLACE FUNCTION pg_temp.ensure_policy(tbl text, pol text, ddl text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = pol) THEN
    EXECUTE ddl;
  END IF;
END $$;

-- ── people.signature_url (138) — profile page + PDF sign-off ──────────────────
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS signature_url TEXT DEFAULT NULL;

-- ── columns screens save but that never existed ─────────────────────────────
ALTER TABLE public.people            ADD COLUMN IF NOT EXISTS bank_details TEXT;                 -- Edit person
ALTER TABLE public.property_notes    ADD COLUMN IF NOT EXISTS is_internal  BOOLEAN DEFAULT false; -- internal vs notice board
ALTER TABLE public.applicant_documents ADD COLUMN IF NOT EXISTS description TEXT;                -- applicant document upload
ALTER TABLE public.viewings          ADD COLUMN IF NOT EXISTS notes        TEXT;                 -- booking notes

-- ── valuations_log (094) — Valuations → history ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.valuations_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type             TEXT NOT NULL,
  property_address TEXT NOT NULL,
  recipient_name   TEXT NOT NULL,
  letter_date      DATE,
  generated_by     UUID REFERENCES public.people(id) ON DELETE SET NULL,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  pdf_storage_path TEXT,
  room_count       INT,
  notes            TEXT
);
CREATE INDEX IF NOT EXISTS idx_valuations_log_generated_at ON public.valuations_log(generated_at DESC);
ALTER TABLE public.valuations_log ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.ensure_policy('valuations_log', 'staff manage valuations_log',
  $p$CREATE POLICY "staff manage valuations_log" ON public.valuations_log FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff())$p$);

-- ── sms_confirmations (104) — Y/N replies to viewing + contractor texts ──────
CREATE TABLE IF NOT EXISTS public.sms_confirmations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           VARCHAR(20) NOT NULL,
  type            VARCHAR(50) NOT NULL,
  related_id      UUID NOT NULL,
  context_text    TEXT,
  sent_at         TIMESTAMPTZ DEFAULT now(),
  response        VARCHAR(10),
  response_raw    TEXT,
  responded_at    TIMESTAMPTZ,
  agent_notified  BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_conf_phone   ON public.sms_confirmations(phone, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_conf_related ON public.sms_confirmations(related_id);
ALTER TABLE public.sms_confirmations ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.ensure_policy('sms_confirmations', 'staff manage sms_confirmations',
  $p$CREATE POLICY "staff manage sms_confirmations" ON public.sms_confirmations FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (true)$p$);

-- ── audit_logs (_archive/030) — lib/auditLog ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.people(id) ON DELETE SET NULL,
  action      VARCHAR(50) NOT NULL,
  table_name  VARCHAR(100),
  record_id   VARCHAR(255),
  details     TEXT,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at   ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.ensure_policy('audit_logs', 'staff read audit_logs',
  $p$CREATE POLICY "staff read audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.cros_is_staff())$p$);
SELECT pg_temp.ensure_policy('audit_logs', 'signed-in users write audit_logs',
  $p$CREATE POLICY "signed-in users write audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true)$p$);

-- ── documents_pending (045) — Documents → Pending Review ─────────────────────
CREATE TABLE IF NOT EXISTS public.documents_pending (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source                     VARCHAR(50) NOT NULL,
  source_email               VARCHAR(255),
  document_type              VARCHAR(50) NOT NULL,
  confidence                 NUMERIC(3, 2),
  summary                    TEXT,
  extracted_data             JSONB NOT NULL DEFAULT '{}'::jsonb,
  property_id                UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  property_address_extracted VARCHAR(500),
  property_matched_by        UUID REFERENCES public.people(id),
  property_matched_at        TIMESTAMPTZ,
  status                     VARCHAR(50) NOT NULL DEFAULT 'pending_review',
  filed_at                   TIMESTAMPTZ,
  filed_to_tables            TEXT[],
  created_at                 TIMESTAMPTZ DEFAULT now(),
  created_by                 UUID REFERENCES public.people(id),
  updated_at                 TIMESTAMPTZ DEFAULT now(),
  updated_by                 UUID REFERENCES public.people(id),
  admin_notes                TEXT
);
CREATE INDEX IF NOT EXISTS idx_documents_pending_status   ON public.documents_pending(status);
CREATE INDEX IF NOT EXISTS idx_documents_pending_property ON public.documents_pending(property_id);
ALTER TABLE public.documents_pending ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.ensure_policy('documents_pending', 'staff manage documents_pending',
  $p$CREATE POLICY "staff manage documents_pending" ON public.documents_pending FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff())$p$);

-- ── documents — certificate files uploaded from Property Tasks ───────────────
CREATE TABLE IF NOT EXISTS public.documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  document_type  TEXT,
  file_name      TEXT,
  file_path      TEXT,
  storage_url    TEXT,
  status         TEXT DEFAULT 'approved',
  source         TEXT,
  extracted_data JSONB DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_property ON public.documents(property_id);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.ensure_policy('documents', 'staff manage documents',
  $p$CREATE POLICY "staff manage documents" ON public.documents FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff())$p$);

-- ── cleaner_task_templates (_archive/035) — Property Notes → cleaner tasks ───
CREATE TABLE IF NOT EXISTS public.cleaner_task_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_key     VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description  TEXT,
  category     VARCHAR(50),
  is_active    BOOLEAN DEFAULT true,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);
INSERT INTO public.cleaner_task_templates (task_key, display_name, description, category, sort_order) VALUES
  ('clean_ensuite',       'Clean ensuite/bathroom', 'Clean ensuite including tiles, mirror, fixtures',   'rooms',      10),
  ('clean_bedroom',       'Clean bedroom',          'Vacuum, dust, change linens if needed',              'rooms',      20),
  ('deep_clean_kitchen',  'Deep clean kitchen oven','Deep clean inside oven and stovetop',                'kitchen',    30),
  ('polish_windows',      'Polish windows',         'Clean and polish all windows',                       'communal',   40),
  ('vacuum_hallway',      'Vacuum hallway',         'Vacuum stairs and hallway carpets thoroughly',       'communal',   50),
  ('clean_fridge',        'Clean fridge/freezer',   'Empty, wipe down shelves, discard expired items',    'kitchen',    60),
  ('deep_clean_bathroom', 'Deep clean bathroom',    'Scrub tiles, grout, fixtures thoroughly',            'deep_clean', 70),
  ('dust_surfaces',       'Dust all surfaces',      'Dust shelves, furniture, picture frames',            'communal',   80),
  ('mop_floors',          'Mop hard floors',        'Mop kitchen, hallway, bathroom tiles',               'communal',   90),
  ('clean_mirrors',       'Polish mirrors',         'Clean and polish all mirrors in property',           'communal',  100),
  ('organize_storage',    'Organise storage areas', 'Tidy cupboards and storage spaces',                  'communal',  110)
ON CONFLICT (task_key) DO NOTHING;
ALTER TABLE public.cleaner_task_templates ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.ensure_policy('cleaner_task_templates', 'signed-in users read task templates',
  $p$CREATE POLICY "signed-in users read task templates" ON public.cleaner_task_templates FOR SELECT TO authenticated USING (true)$p$);
SELECT pg_temp.ensure_policy('cleaner_task_templates', 'staff manage task templates',
  $p$CREATE POLICY "staff manage task templates" ON public.cleaner_task_templates FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff())$p$);

-- ── compliance_cert_history + hmo_licence_history (173) ──────────────────────
CREATE TABLE IF NOT EXISTS public.compliance_cert_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  cert_type    TEXT NOT NULL,
  issue_date   DATE,
  expiry_date  DATE,
  provider     TEXT,
  notes        TEXT,
  recorded_by  UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cch_property_id ON public.compliance_cert_history(property_id);
ALTER TABLE public.compliance_cert_history ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.ensure_policy('compliance_cert_history', 'staff manage cert history',
  $p$CREATE POLICY "staff manage cert history" ON public.compliance_cert_history FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff())$p$);

CREATE TABLE IF NOT EXISTS public.hmo_licence_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  licence_number    TEXT,
  issue_date        DATE,
  expiry_date       DATE,
  issuing_authority TEXT,
  notes             TEXT,
  recorded_by       UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hlh_property_id ON public.hmo_licence_history(property_id);
ALTER TABLE public.hmo_licence_history ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.ensure_policy('hmo_licence_history', 'staff manage licence history',
  $p$CREATE POLICY "staff manage licence history" ON public.hmo_licence_history FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff())$p$);

-- ── tenant_self_check_issues (087) — issue list tenants pick from ────────────
CREATE TABLE IF NOT EXISTS public.tenant_self_check_issues (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_key    VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  category     VARCHAR(50) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
INSERT INTO public.tenant_self_check_issues (issue_key, display_name, category) VALUES
  ('door_not_closing',   'Door not closing properly',     'fire_door'),
  ('strike_plate_loose', 'Strike plate is loose',         'fire_door'),
  ('gap_around_door',    'Gap visible around door edges', 'fire_door'),
  ('handle_broken',      'Door handle is broken',         'fire_door'),
  ('seal_damaged',       'Door seal is damaged',          'fire_door'),
  ('battery_low',        'Battery low warning',           'smoke_alarm'),
  ('sensor_not_working', 'Sensor appears unresponsive',   'smoke_alarm'),
  ('missing_batteries',  'Batteries missing',             'smoke_alarm'),
  ('damaged_casing',     'Casing is cracked or damaged',  'smoke_alarm'),
  ('false_alarms',       'Frequent false alarms',         'smoke_alarm'),
  ('missing_unit',       'Smoke alarm is missing',        'smoke_alarm')
ON CONFLICT (issue_key) DO NOTHING;
ALTER TABLE public.tenant_self_check_issues ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.ensure_policy('tenant_self_check_issues', 'signed-in users read issue list',
  $p$CREATE POLICY "signed-in users read issue list" ON public.tenant_self_check_issues FOR SELECT TO authenticated USING (true)$p$);

-- ── property_photo_requests (_archive/033) — compliance photo requests ───────
CREATE TABLE IF NOT EXISTS public.property_photo_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  check_type         VARCHAR(50) NOT NULL,
  requested_by       UUID REFERENCES public.people(id),
  requested_at       TIMESTAMPTZ DEFAULT now(),
  request_deadline   DATE,
  status             VARCHAR(50) DEFAULT 'pending',
  responses_received INTEGER DEFAULT 0,
  total_tenants      INTEGER,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_photo_requests_property ON public.property_photo_requests(property_id);
ALTER TABLE public.property_photo_requests ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.ensure_policy('property_photo_requests', 'staff manage photo requests',
  $p$CREATE POLICY "staff manage photo requests" ON public.property_photo_requests FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff())$p$);

-- ── job_completion_log — written when a contractor completes a job ───────────
CREATE TABLE IF NOT EXISTS public.job_completion_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     UUID REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
  status_before TEXT,
  status_after  TEXT,
  completed_by  UUID REFERENCES public.people(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_completion_log_ticket ON public.job_completion_log(ticket_id);
ALTER TABLE public.job_completion_log ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.ensure_policy('job_completion_log', 'signed-in users write completion log',
  $p$CREATE POLICY "signed-in users write completion log" ON public.job_completion_log FOR INSERT TO authenticated WITH CHECK (true)$p$);
SELECT pg_temp.ensure_policy('job_completion_log', 'staff read completion log',
  $p$CREATE POLICY "staff read completion log" ON public.job_completion_log FOR SELECT TO authenticated USING (public.cros_is_staff())$p$);

-- ── maintenance_diagnostic_attempts (_archive/036) — tenant AI troubleshooting ─
CREATE TABLE IF NOT EXISTS public.maintenance_diagnostic_attempts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID REFERENCES public.people(id) ON DELETE CASCADE,
  tenancy_id            UUID REFERENCES public.tenancies(id) ON DELETE CASCADE,
  property_id           UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id               UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  category              VARCHAR(50) NOT NULL,
  initial_description   TEXT NOT NULL,
  ai_questions          JSONB,
  user_answers          JSONB,
  ai_recommendation     VARCHAR(50),
  ai_guidance           TEXT,
  user_choice           VARCHAR(50),
  maintenance_ticket_id UUID REFERENCES public.maintenance_tickets(id) ON DELETE SET NULL,
  diy_attempted         BOOLEAN DEFAULT false,
  diy_successful        BOOLEAN,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  resolved_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_diagnostic_attempts_property ON public.maintenance_diagnostic_attempts(property_id);
ALTER TABLE public.maintenance_diagnostic_attempts ENABLE ROW LEVEL SECURITY;
SELECT pg_temp.ensure_policy('maintenance_diagnostic_attempts', 'signed-in users write diagnostics',
  $p$CREATE POLICY "signed-in users write diagnostics" ON public.maintenance_diagnostic_attempts FOR INSERT TO authenticated WITH CHECK (true)$p$);
SELECT pg_temp.ensure_policy('maintenance_diagnostic_attempts', 'staff read diagnostics',
  $p$CREATE POLICY "staff read diagnostics" ON public.maintenance_diagnostic_attempts FOR SELECT TO authenticated USING (public.cros_is_staff())$p$);

-- ── landlord_notification_prefs: fix access rules (migration 101) ────────────
-- The original policies join auth.users, which the signed-in role cannot read, so every read by staff or
-- landlords errors (HTTP 403) — the Landlords list and landlord page couldn't load preferences.
-- Replace them with the email-based rule used everywhere else. Policies only; no data is touched.
DO $$ BEGIN
  IF to_regclass('public.landlord_notification_prefs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "admins_manage_landlord_prefs" ON public.landlord_notification_prefs;
    DROP POLICY IF EXISTS "landlord_own_prefs" ON public.landlord_notification_prefs;
    PERFORM pg_temp.ensure_policy('landlord_notification_prefs', 'staff manage landlord prefs',
      $p$CREATE POLICY "staff manage landlord prefs" ON public.landlord_notification_prefs FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff())$p$);
    PERFORM pg_temp.ensure_policy('landlord_notification_prefs', 'landlords manage own prefs',
      $p$CREATE POLICY "landlords manage own prefs" ON public.landlord_notification_prefs FOR ALL TO authenticated
         USING (person_id IN (SELECT id FROM public.people WHERE lower(email) = lower(auth.jwt()->>'email')))
         WITH CHECK (person_id IN (SELECT id FROM public.people WHERE lower(email) = lower(auth.jwt()->>'email')))$p$);
  END IF;
END $$;

-- Refresh PostgREST so the API sees the new tables immediately
NOTIFY pgrst, 'reload schema';
