-- Migration 156: Onboarding steps
-- Stores the slide content for the first-login onboarding flow for each portal role.
-- Title and body are editable by admin via the Message Templates page.

CREATE TABLE IF NOT EXISTS onboarding_steps (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  role        text    NOT NULL,                    -- 'tenant' | 'contractor' | 'cleaner' | 'lettings'
  sort_order  integer NOT NULL DEFAULT 0,
  screen      text    NOT NULL,                    -- which slide layout to render
  title       text    NOT NULL,
  body        text    NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Allow admins to manage, all authenticated users to read their own role's steps
ALTER TABLE onboarding_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage onboarding_steps"
  ON onboarding_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM people
      WHERE email = (auth.jwt() ->> 'email')
        AND role IN ('administrator', 'admin')
    )
  );

CREATE POLICY "Authenticated users read active steps"
  ON onboarding_steps FOR SELECT
  USING (active = true);

-- ── Seed: tenant steps ────────────────────────────────────────────────────────
INSERT INTO onboarding_steps (role, sort_order, screen, title, body) VALUES
  ('tenant', 1, 'brand',       'Your home, simply managed',       'Everything about your tenancy in one place.'),
  ('tenant', 2, 'dashboard',   'Your tenancy at a glance',        'See your rent, upcoming visits, and house notices the moment you open the app.'),
  ('tenant', 3, 'maintenance', 'Report repairs in seconds',       'Something broken? Submit a ticket and we''ll book a contractor — and keep you updated every step of the way.'),
  ('tenant', 4, 'notices',     'Stay in the loop',                'Tasks, announcements and reminders from your property manager — all in one place.'),
  ('tenant', 5, 'profile',     'Enable push notifications',       'Get instant alerts when contractors are visiting, or when there are important updates about your tenancy.'),
  ('tenant', 6, 'ready',       'You''re all set',                 'Your home is now in your pocket. Tap below to get started.');
