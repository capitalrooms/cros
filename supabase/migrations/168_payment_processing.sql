-- Migration 168: Payment processing infrastructure
--
-- Three concerns:
--   1. bank_import_batches   — one row per CSV upload (audit trail of every import)
--   2. bank_transactions     — one row per credit line in a bank statement
--                              deduped by hash so re-importing a CSV is always safe
--   3. rent_charges extended — full audit trail for every financial state change
--
-- Safety model:
--   • dedup_hash on bank_transactions is UNIQUE → same transaction imported N times = 1 row
--   • A transaction whose payment_reference matches an already-paid charge is flagged
--     status='possible_duplicate' and NEVER auto-allocated.
--     Admin must decide: hold as credit, refund, or ignore.
--   • Every mutation to rent_charges is recorded in payment_audit_log.

-- ─── Bank import batches ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_import_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename         TEXT NOT NULL,
  bank_name        TEXT,                    -- detected or entered by user
  period_from      DATE,
  period_to        DATE,
  transaction_count INT NOT NULL DEFAULT 0, -- total credit lines in the file
  credit_total     NUMERIC(12,2),           -- sum of all credit amounts
  new_matched      INT NOT NULL DEFAULT 0,  -- matched to a rent_charge
  new_unmatched    INT NOT NULL DEFAULT 0,  -- could not match
  duplicates_skipped INT NOT NULL DEFAULT 0,-- dedup hash already existed
  possible_dupes   INT NOT NULL DEFAULT 0,  -- possible double payments flagged
  imported_by      UUID REFERENCES public.people(id) ON DELETE SET NULL,
  imported_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes            TEXT
);

-- ─── Bank transactions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         UUID NOT NULL REFERENCES public.bank_import_batches(id) ON DELETE CASCADE,
  property_id      UUID REFERENCES public.properties(id) ON DELETE SET NULL,

  -- Raw data from the bank CSV
  transaction_date DATE NOT NULL,
  amount           NUMERIC(10,2) NOT NULL CHECK (amount > 0), -- credits only, always positive
  description      TEXT NOT NULL,

  -- Extracted from description
  extracted_ref    TEXT,   -- e.g. "008ROC-R1" found in the description

  -- Deduplication — SHA-256 of (date|amount|description). Unique across all imports.
  -- Re-importing the same file is always safe: ON CONFLICT DO NOTHING.
  dedup_hash       TEXT NOT NULL,

  -- Allocation state
  status           TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (status IN (
      'unmatched',         -- no rent_charge found
      'matched',           -- linked to a rent_charge and confirmed paid
      'possible_duplicate',-- rent_charge for this period already paid; needs human review
      'unallocated_credit',-- manually held as credit against the tenant/property
      'ignored'            -- admin dismissed this transaction
    )),

  -- When matched, which rent_charge this pays
  matched_rent_charge_id UUID REFERENCES public.rent_charges(id) ON DELETE SET NULL,
  matched_at             TIMESTAMPTZ,
  matched_by             UUID REFERENCES public.people(id) ON DELETE SET NULL,

  imported_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_by      UUID REFERENCES public.people(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_txn_dedup
  ON public.bank_transactions(dedup_hash);
CREATE INDEX IF NOT EXISTS idx_bank_txn_batch
  ON public.bank_transactions(batch_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_status
  ON public.bank_transactions(status) WHERE status != 'matched';
CREATE INDEX IF NOT EXISTS idx_bank_txn_matched
  ON public.bank_transactions(matched_rent_charge_id) WHERE matched_rent_charge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_txn_ref
  ON public.bank_transactions(extracted_ref) WHERE extracted_ref IS NOT NULL;

-- ─── Extend rent_charges ──────────────────────────────────────────────────────
ALTER TABLE public.rent_charges
  -- Amount editing with audit trail
  ADD COLUMN IF NOT EXISTS amount_due_original    NUMERIC(10,2),   -- set once, first time amount_due is changed
  ADD COLUMN IF NOT EXISTS amount_due_note        TEXT,
  ADD COLUMN IF NOT EXISTS amount_due_changed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS amount_due_changed_by  UUID REFERENCES public.people(id) ON DELETE SET NULL,

  -- Payment provenance
  ADD COLUMN IF NOT EXISTS paid_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by                UUID REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method         TEXT
    CHECK (payment_method IS NULL OR payment_method IN (
      'bank_transfer', 'standing_order', 'cash', 'cheque', 'other'
    )),
  ADD COLUMN IF NOT EXISTS payment_notes          TEXT,
  ADD COLUMN IF NOT EXISTS bank_transaction_id    UUID REFERENCES public.bank_transactions(id) ON DELETE SET NULL,

  -- Void (reversal of a paid charge)
  ADD COLUMN IF NOT EXISTS voided                 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voided_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by              UUID REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_note            TEXT;

-- ─── Payment audit log ────────────────────────────────────────────────────────
-- Every financial state change on a rent_charge is logged here.
-- This is immutable — rows are only inserted, never updated or deleted.
CREATE TABLE IF NOT EXISTS public.payment_audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rent_charge_id   UUID NOT NULL REFERENCES public.rent_charges(id) ON DELETE CASCADE,
  action           TEXT NOT NULL CHECK (action IN (
    'created',             -- rent charge row created
    'amount_due_edited',   -- amount_due changed (note required)
    'manually_paid',       -- admin recorded manual payment
    'csv_matched',         -- matched and paid via bank CSV import
    'voided',              -- payment reversed
    'status_changed',      -- any other status change
    'amount_received_adjusted' -- amount_received changed without full payment
  )),
  performed_by     UUID REFERENCES public.people(id) ON DELETE SET NULL,
  performed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  old_value        JSONB,   -- snapshot of relevant fields before change
  new_value        JSONB,   -- snapshot after change
  note             TEXT,
  bank_transaction_id UUID REFERENCES public.bank_transactions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pal_rent_charge
  ON public.payment_audit_log(rent_charge_id);
CREATE INDEX IF NOT EXISTS idx_pal_performed_at
  ON public.payment_audit_log(performed_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.bank_import_batches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_audit_log    ENABLE ROW LEVEL SECURITY;

-- Admins and lettings staff can do everything
CREATE POLICY "admins_manage_bank_batches" ON public.bank_import_batches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.people
            WHERE email = (auth.jwt() ->> 'email')
              AND role IN ('administrator','admin','lettings'))
  );

CREATE POLICY "admins_manage_bank_txns" ON public.bank_transactions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.people
            WHERE email = (auth.jwt() ->> 'email')
              AND role IN ('administrator','admin','lettings'))
  );

CREATE POLICY "admins_read_audit_log" ON public.payment_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.people
            WHERE email = (auth.jwt() ->> 'email')
              AND role IN ('administrator','admin','lettings'))
  );

CREATE POLICY "system_insert_audit_log" ON public.payment_audit_log
  FOR INSERT WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
