-- 205 — Invoices made in CROS by contractors and cleaners.
-- Contractors: a professional invoice (their own details, a generated logo) for our completed jobs — or, once every
-- one of our jobs assigned to them has a booked date, for their other clients too. Numbers never repeat.
-- Cleaners: one invoice for a period's completed cleans (each clean can only ever be on one invoice), with products
-- bought and receipt photos. Invoices to Capital Rooms wait in the office for approval before anything reaches a
-- landlord's statement. On / off: system setting 'supplier_invoicing' plus a per-person switch.

CREATE TABLE IF NOT EXISTS public.supplier_profiles (
  person_id          UUID PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  invoicing_enabled  BOOLEAN NOT NULL DEFAULT TRUE,     -- the office can switch one person off
  trading_name       TEXT,
  address            TEXT,
  phone              TEXT,
  email              TEXT,
  bank_account_name  TEXT,
  bank_sort_code     TEXT,
  bank_account_no    TEXT,
  vat_registered     BOOLEAN NOT NULL DEFAULT FALSE,
  vat_number         TEXT,
  payment_days       SMALLINT NOT NULL DEFAULT 14 CHECK (payment_days BETWEEN 0 AND 90),
  logo_path          TEXT,                              -- their own logo (supplier-invoices bucket); otherwise a generated one
  logo_colour        TEXT,                              -- the generated logo's colour, kept so it never changes
  next_number        INTEGER NOT NULL DEFAULT 1001,
  clean_prices       JSONB NOT NULL DEFAULT '{}'::jsonb, -- cleaners: last price used per property, to prefill
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  kind            TEXT NOT NULL CHECK (kind IN ('contractor', 'cleaner')),
  number          INTEGER NOT NULL,
  to_capital_rooms BOOLEAN NOT NULL DEFAULT TRUE,
  client_name     TEXT NOT NULL,
  client_email    TEXT,
  client_address  TEXT,
  property_id     UUID REFERENCES public.properties(id) ON DELETE SET NULL,   -- contractors: the property it's for
  issue_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  period_from     DATE,                                -- cleaners: the period covered
  period_to       DATE,
  lines           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ description, where, labour, parts, cleanId?, ticketId?, propertyId?, receipt? }]
  labour_total    NUMERIC(10,2) NOT NULL DEFAULT 0,
  parts_total     NUMERIC(10,2) NOT NULL DEFAULT 0,
  vat_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'approved', 'paid', 'void')),
  sent_to         TEXT[],
  sent_at         TIMESTAMPTZ,
  pdf_path        TEXT,                                -- supplier-invoices bucket
  approved_at     TIMESTAMPTZ,
  approved_by     UUID REFERENCES public.people(id) ON DELETE SET NULL,
  expense_ids     UUID[],                              -- expenses made from it on approval
  paid_at         TIMESTAMPTZ,
  void_reason     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, number)
);
CREATE INDEX IF NOT EXISTS supplier_invoices_open_idx ON public.supplier_invoices (status, created_at DESC);

-- each clean / job can only ever be on one (live) invoice
ALTER TABLE public.cleans              ADD COLUMN IF NOT EXISTS supplier_invoice_id UUID REFERENCES public.supplier_invoices(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS supplier_invoice_id UUID REFERENCES public.supplier_invoices(id) ON DELETE SET NULL;

-- the next invoice number for a person, taken atomically so two invoices can never share one
CREATE OR REPLACE FUNCTION public.take_supplier_invoice_number(p_person UUID) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  INSERT INTO public.supplier_profiles (person_id) VALUES (p_person) ON CONFLICT (person_id) DO NOTHING;
  UPDATE public.supplier_profiles SET next_number = next_number + 1, updated_at = now() WHERE person_id = p_person RETURNING next_number - 1 INTO n;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.take_supplier_invoice_number(UUID) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.supplier_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_profiles, public.supplier_invoices FROM anon, authenticated;

INSERT INTO public.system_settings (key, value) VALUES ('supplier_invoicing', 'true') ON CONFLICT (key) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('supplier-invoices', 'supplier-invoices', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;
