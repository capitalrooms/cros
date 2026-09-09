-- Migration 139: Tenant guide template system
-- One template serves all guides — no per-guide hardcoding ever.
-- Guides are fully admin-editable: content, visibility, acknowledgment, images.

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_guides (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 TEXT UNIQUE NOT NULL,
  title                TEXT NOT NULL,
  emoji                TEXT NOT NULL DEFAULT '📖',
  sort_order           INT NOT NULL DEFAULT 0,
  -- 'essential' = always shown; 'stage-triggered' = only at a specific tenancy stage
  visibility           TEXT NOT NULL DEFAULT 'essential'
                         CHECK (visibility IN ('essential', 'stage-triggered')),
  -- when visibility = 'stage-triggered', which tenancy status triggers it
  -- matches tenancies.status values: 'active', 'on_notice', 'completed'
  -- or 'any' (always visible when using stage-triggered as a flag)
  trigger_stage        TEXT,
  acknowledgment_required BOOL NOT NULL DEFAULT false,
  hero_image_url       TEXT,          -- Supabase Storage public URL
  is_published         BOOL NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guide_blocks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id         UUID NOT NULL REFERENCES tenant_guides(id) ON DELETE CASCADE,
  sort_order       INT NOT NULL DEFAULT 0,
  heading          TEXT NOT NULL,
  body             TEXT NOT NULL,  -- plain text; newlines separate bullet points
  inline_image_url TEXT,           -- Supabase Storage public URL
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guide_acknowledgments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id         UUID NOT NULL REFERENCES tenant_guides(id) ON DELETE CASCADE,
  tenancy_id       UUID NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  person_id        UUID NOT NULL REFERENCES people(id),
  acknowledged_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(guide_id, tenancy_id)  -- one acknowledgment per guide per tenancy
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_guide_blocks_guide_id ON guide_blocks(guide_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_guide_acks_tenancy ON guide_acknowledgments(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_guide_acks_guide ON guide_acknowledgments(guide_id, tenancy_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE tenant_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_acknowledgments ENABLE ROW LEVEL SECURITY;

-- Guides: tenants can read published guides; admins can do everything
DROP POLICY IF EXISTS tenant_guides_read ON tenant_guides;
CREATE POLICY tenant_guides_read ON tenant_guides FOR SELECT TO authenticated USING (is_published = true);

DROP POLICY IF EXISTS tenant_guides_admin ON tenant_guides;
CREATE POLICY tenant_guides_admin ON tenant_guides FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM people WHERE email = auth.jwt()->>'email'
            AND role IN ('administrator', 'admin', 'lettings'))
  );

-- Blocks: same as guides
DROP POLICY IF EXISTS guide_blocks_read ON guide_blocks;
CREATE POLICY guide_blocks_read ON guide_blocks FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM tenant_guides g WHERE g.id = guide_id AND g.is_published = true)
);

DROP POLICY IF EXISTS guide_blocks_admin ON guide_blocks;
CREATE POLICY guide_blocks_admin ON guide_blocks FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM people WHERE email = auth.jwt()->>'email'
            AND role IN ('administrator', 'admin', 'lettings'))
  );

-- Acknowledgments: tenant can insert/read own; admin can read all
DROP POLICY IF EXISTS guide_acks_own ON guide_acknowledgments;
CREATE POLICY guide_acks_own ON guide_acknowledgments FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM people WHERE id = person_id AND email = auth.jwt()->>'email')
    OR EXISTS (SELECT 1 FROM people WHERE email = auth.jwt()->>'email'
               AND role IN ('administrator', 'admin', 'lettings'))
  );

-- ─── Seed: six guides (M&C populated; others shell only) ─────────────────────

INSERT INTO tenant_guides (slug, title, emoji, sort_order, visibility, trigger_stage, acknowledgment_required, is_published)
VALUES
  ('mould-and-condensation', 'Mould & Condensation', '🪟', 10, 'essential',  NULL,        true,  true),
  ('fire-safety',            'Fire Safety',           '🔥', 20, 'essential',  NULL,        false, true),
  ('fire-door',              'Fire Door',             '🚪', 30, 'essential',  NULL,        false, true),
  ('guide-to-the-process',   'Our Guide To The Process', '📋', 40, 'stage-triggered', 'active', false, true),
  ('time-to-check-out',      'Time To Check Out',    '🧳', 50, 'stage-triggered', 'on_notice', false, true),
  ('great-housemate',        'Being a Great Housemate', '🤝', 60, 'essential', NULL,       false, true)
ON CONFLICT (slug) DO NOTHING;

-- ─── Seed: Mould & Condensation blocks ───────────────────────────────────────

WITH g AS (SELECT id FROM tenant_guides WHERE slug = 'mould-and-condensation')
INSERT INTO guide_blocks (guide_id, sort_order, heading, body, inline_image_url)
SELECT g.id, blk.sort_order, blk.heading, blk.body, NULL
FROM g, (VALUES
  (10, 'Why mould and condensation happen',
   'Warm, moist air from cooking, showering, and breathing meets cold surfaces — windows, walls, corners — and turns to water.
In a shared house, moisture builds up faster because more people are producing it throughout the day.
Cold spots attract the most condensation, so outside walls and north-facing rooms need extra attention.
The good news: a few simple daily habits stop it almost entirely — and they cost nothing.'),

  (20, 'Open windows every day',
   'Even five minutes with a window open lets built-up moisture escape.
Keep trickle vents in frames open year-round — they are designed exactly for this.
After cooking or showering, open a window in that room for at least ten minutes.
Resist the urge to seal every draught: a house that can breathe stays dry.'),

  (30, 'Use extractor fans every time',
   'Turn the kitchen extractor on before you start cooking — not partway through.
Run the bathroom extractor for at least ten minutes after you leave the shower.
If a fan sounds noisy, rattles, or moves slowly, report it to us — a broken fan is a cause of mould.
Keep vent grilles free from dust and lint so air can actually move.'),

  (40, 'Cover pans when cooking',
   'A lid on a boiling pot cuts the steam it releases into the room by up to 90%.
Cook on lower heat where possible — high heat means more steam, more moisture.
Keep the kitchen door closed while cooking to stop moisture spreading to the rest of the house.
Wipe down hob surfaces and counters after cooking — damp residue keeps evaporating after you leave.'),

  (50, 'Dry clothes the right way',
   'Never hang wet washing over radiators — it dumps enormous amounts of moisture directly into the air.
Dry clothes outside whenever the weather allows.
If using an indoor airer, put it in a room with a window open or the extractor running.
Tumble dryers must be vented to outside or use a condenser type — door-to-hallway is not ventilation.'),

  (60, 'Keep a steady background heat',
   'Keeping the heating on low (around 18°C) all day is more effective than blasting it and switching off.
Cold walls attract condensation — consistent warmth keeps surface temperatures above the dew point.
Do not block radiators with furniture or drying laundry; you need the warm air to circulate.
If the boiler or a radiator is not working properly, report it — unheated rooms are high-risk for mould.'),

  (70, 'Furniture and your bedroom',
   'Leave a small gap (a few centimetres) between large furniture and outside walls — especially external corners.
Cold air trapped behind a wardrobe against an outside wall is exactly where mould thrives.
Keep wardrobes and cupboards reasonably tidy so air can move inside them.
Report any persistent cold patches on walls — they can indicate a gap in the insulation.'),

  (80, 'After showers and baths',
   'Squeegee or wipe down shower walls and glass before you leave — it takes thirty seconds.
Wipe condensation off mirrors and windowsills with a dry cloth.
Keep the bathroom extractor on for ten minutes after you finish.
Do not leave wet towels hanging in a closed bathroom; hang them in a ventilated space or outside.'),

  (90, 'If you spot mould, report it straight away',
   'Early treatment stops mould spreading — do not leave it and hope it goes away.
Report it through the maintenance section of the app so we can treat it properly.
For small surface spots you can treat with a mould-specific spray (such as HG Mould Spray) — wear gloves.
Never paint over mould without treating it first; paint just seals it in and it comes back worse.'),

  (100, 'The simple habit that makes the biggest difference',
   'Open a window, run the extractor, cover the pan — every one of these takes less than a minute.
Done consistently, they reduce indoor moisture enough to prevent mould from ever taking hold.
A well-ventilated, evenly heated home is comfortable to live in and stays in good condition.
If you ever have any concerns about damp, mould, or ventilation, contact us — we would always rather know early.')
) AS blk(sort_order, heading, body)
ON CONFLICT DO NOTHING;
