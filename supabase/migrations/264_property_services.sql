-- 264 · Bills & services on a property (5 Nov 2026, Harry: "something we are paying continuously … appear in the
-- property somewhere sensible so that we can then add an account number to it or some of the annoying details often
-- forgotten whilst setting up loads of different internets at properties, what is the email address login etc. … the
-- property information sheet … we write down who the supplier is for internet so they can troubleshoot — these need
-- to marry up somehow rather than being duplicated").
-- One row per account at a house: internet, gas & electricity, water, council tax, TV licence, appliance cover,
-- cleaning, gardening … who supplies it, the account number and login email, who pays (us, recharged to the landlord;
-- the landlord direct; the tenants; included in the rent), the cost, contract dates and meter numbers. For internet,
-- the network name and WiFi password tenants need: CROS writes those (and the supplier's support line) into the
-- house information the tenant app shows, so they're kept in one place. Account passwords are never stored here.
CREATE TABLE IF NOT EXISTS public.property_services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  kind             text NOT NULL,                 -- internet | energy | gas | electricity | water | council_tax | tv_licence | appliance_cover | cleaning | gardening | insurance | other
  supplier         text,
  account_number   text,
  account_holder   text,                          -- the name on the account (e.g. Capital Rooms Ltd, the landlord)
  login_email      text,                          -- the email the online account is registered to
  support_phone    text,                          -- the supplier's number for faults (shown to tenants for internet)
  who_pays         text NOT NULL DEFAULT 'we_recharge' CHECK (who_pays IN ('we_recharge', 'landlord', 'tenants', 'included')),
  payment_method   text,                          -- direct debit / card / bank transfer
  monthly_cost     numeric(10,2),
  contract_start   date,
  contract_end     date,                          -- when the deal ends (CROS reminds before it does)
  meter_refs       text,                          -- MPAN / MPRN / meter serial / water supply number
  wifi_network     text,                          -- internet only: shown to tenants
  wifi_password    text,                          -- internet only: the router's WiFi password tenants need (not the account password)
  notes            text,
  ended_at         date,                          -- the account was closed or moved — kept for the record
  created_by       uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_services_property_idx ON public.property_services (property_id);

ALTER TABLE public.property_services ENABLE ROW LEVEL SECURITY;
-- read and written only by the server (service role); office screens use the API
DROP POLICY IF EXISTS property_services_none ON public.property_services;
CREATE POLICY property_services_none ON public.property_services FOR SELECT USING (false);
