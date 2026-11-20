-- The cleaner's or contractor's own invoice reference (Nov 2026), printed as 'Your ref' beside the CROS number.
-- Optional. Not applied to any database yet — run only with Harry's go-ahead.
ALTER TABLE public.supplier_invoices ADD COLUMN IF NOT EXISTS your_ref TEXT;
