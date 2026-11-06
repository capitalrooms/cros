-- 269 — a care guide for each appliance (6 Nov 2026, Harry: "it does background searching … finds the exact product
-- then generates its own summary of basic fixing or maintaining … we then accept the info and it's saved for tenants").
-- Researched from the manufacturer's own pages for the exact make and model (lib/house/careGuide), checked and approved
-- by the office; only then shown to tenants and used by the fault-reporting AI.
ALTER TABLE public.property_appliances ADD COLUMN IF NOT EXISTS guide jsonb;              -- { summary, sections:[{title,steps[]}], errorCodes:[{code,meaning}], manualUrl, sources:[{title,url}] }
ALTER TABLE public.property_appliances ADD COLUMN IF NOT EXISTS guide_status text;        -- researching | ready | approved | not_found | failed
ALTER TABLE public.property_appliances ADD COLUMN IF NOT EXISTS guide_at timestamptz;
ALTER TABLE public.property_appliances ADD COLUMN IF NOT EXISTS guide_approved_at timestamptz;
ALTER TABLE public.property_appliances ADD COLUMN IF NOT EXISTS guide_approved_by text;
