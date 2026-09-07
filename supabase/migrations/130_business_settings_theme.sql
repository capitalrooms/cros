-- Migration 130: add theme + light logo to business_settings
-- Allows admin to switch between dark (Option E) and light email theme
-- and provide a separate logo for each theme.

ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS logo_url_light text NOT NULL DEFAULT 'https://cros-sigma.vercel.app/logo.png',
  ADD COLUMN IF NOT EXISTS email_theme    text NOT NULL DEFAULT 'dark'
    CHECK (email_theme IN ('dark', 'light'));

-- Update the seed row with the new defaults
UPDATE business_settings
SET    logo_url_light = 'https://cros-sigma.vercel.app/logo.png',
       email_theme    = 'dark'
WHERE  id = '00000000-0000-0000-0000-000000000001';
