-- Migration 129: business_settings table
-- Admin-editable source of truth for company name, address, email, phone.
-- Every email and generated PDF pulls from here via getBusinessSettings().
-- Changing a row here updates every outbound email automatically.

CREATE TABLE IF NOT EXISTS business_settings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'Capital Rooms',
  address_line1 text NOT NULL DEFAULT 'Third Floor',
  address_line2 text NOT NULL DEFAULT '86–90 Paul Street',
  city         text NOT NULL DEFAULT 'London',
  postcode     text NOT NULL DEFAULT 'EC2A 4NE',
  email        text NOT NULL DEFAULT 'management@capitalrooms.co.uk',
  phone        text NOT NULL DEFAULT '0207 112 9163',
  logo_url     text NOT NULL DEFAULT 'https://cros-sigma.vercel.app/footer-logo.png',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed the single settings row if it doesn't exist
INSERT INTO business_settings (
  id, company_name, address_line1, address_line2, city, postcode, email, phone, logo_url
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Capital Rooms',
  'Third Floor',
  '86–90 Paul Street',
  'London',
  'EC2A 4NE',
  'management@capitalrooms.co.uk',
  '0207 112 9163',
  'https://cros-sigma.vercel.app/footer-logo.png'
)
ON CONFLICT (id) DO NOTHING;

-- RLS: admins can read/write; service role always bypasses
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_business_settings" ON business_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM people WHERE email = auth.jwt() ->> 'email' AND role = 'administrator'
    )
  );

CREATE POLICY "admin_write_business_settings" ON business_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM people WHERE email = auth.jwt() ->> 'email' AND role = 'administrator'
    )
  );
