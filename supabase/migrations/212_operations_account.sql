-- 212 — The Operations account (Harry, 8 Oct 2026). Once a month the business account's bank CSV is dropped into
-- CROS. Every payment out is filed once:
--   · a landlord expense on one house — or split across several (a cleaning invoice covering a cluster of houses);
--   · a company expense (CEX); or
--   · "not an expense" (a transfer between our own accounts, a refund, wages…).
-- CROS learns which house each payee and reference belongs to (OVO account 1234… → 12 Saltwell Street), so next
-- month the same bill comes pre-filled. A line can be filed before its receipt exists; the missing-receipts list
-- is what to chase for the accountant.
-- ADDITIVE ONLY. Idempotent: safe to run more than once.

-- ── 1. the bank lines ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ops_bank_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_date      DATE NOT NULL,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),     -- money paid out
  description    TEXT NOT NULL,                                  -- as the bank printed it
  match_key      TEXT NOT NULL,                                  -- the description without dates: payee + reference
  payee_key      TEXT NOT NULL,                                  -- the payee's name only (letters)
  dedup_hash     TEXT NOT NULL,                                  -- date | amount | description — one copy per line, ever
  file_name      TEXT,                                           -- the CSV it came from
  status         TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'filing', 'filed', 'not_expense')),
  filed_as       TEXT CHECK (filed_as IN ('landlord', 'split', 'company', 'not_expense')),
  filed_refs     JSONB,                                          -- [{ kind: 'expense'|'company', id, no, property? , amount }]
  receipt_path   TEXT,                                           -- finance-docs/… once attached
  receipt_name   TEXT,
  no_receipt_needed BOOLEAN NOT NULL DEFAULT FALSE,              -- e.g. a bank charge
  note           TEXT,
  is_practice    BOOLEAN NOT NULL DEFAULT FALSE,
  imported_by    UUID REFERENCES public.people(id) ON DELETE SET NULL,
  imported_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  filed_by       UUID REFERENCES public.people(id) ON DELETE SET NULL,
  filed_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ops_bank_lines_dedup_key ON public.ops_bank_lines (dedup_hash);
CREATE INDEX IF NOT EXISTS ops_bank_lines_status_idx ON public.ops_bank_lines (status, line_date);

-- ── 2. what CROS has learnt: this payee / reference → this house (or the company, or not an expense) ─────
CREATE TABLE IF NOT EXISTS public.ops_payee_rules (
  match_key      TEXT PRIMARY KEY,
  payee_key      TEXT NOT NULL,
  filed_as       TEXT NOT NULL CHECK (filed_as IN ('landlord', 'split', 'company', 'not_expense')),
  property_id    UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id        UUID,
  splits         JSONB,                                          -- a split's houses and shares, as last filed
  category       TEXT,
  description    TEXT,                                           -- what it was called last time
  last_amount    NUMERIC(12,2),
  times_used     INTEGER NOT NULL DEFAULT 1,
  updated_by     UUID REFERENCES public.people(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_payee_rules_payee_idx ON public.ops_payee_rules (payee_key);

-- ── 3. a company expense can be filed before its receipt arrives, and knows the bank line it came from ─────
ALTER TABLE public.company_documents ALTER COLUMN file_path DROP NOT NULL;
ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS source_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS company_documents_source_ref_key ON public.company_documents (source_ref) WHERE source_ref IS NOT NULL;

-- ── 4. a landlord expense can come from a bank line ──────────────────────────
ALTER TABLE public.recharge_expenses DROP CONSTRAINT IF EXISTS recharge_expenses_source_check;
ALTER TABLE public.recharge_expenses ADD CONSTRAINT recharge_expenses_source_check
  CHECK (source IN ('manual', 'statement_import', 'bank_import', 'supplier_invoice', 'capture', 'ops_bank'));

-- ── 5. privacy (migration 192): office-only tables, reached through the service key behind admin checks ─────
ALTER TABLE public.ops_bank_lines  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_payee_rules ENABLE ROW LEVEL SECURITY;
