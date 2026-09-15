-- Migration 155: "Your Responsibilities" guide
-- Adds the tenant responsibilities guide based on tenancy clauses 2.34, 2.36, 2.38, 2.39.
-- guide_blocks uses (heading, body) columns per migration 139.

INSERT INTO tenant_guides (slug, title, emoji, sort_order, visibility, is_published, property_type_filter)
VALUES (
  'your-responsibilities',
  'Your responsibilities',
  '📋',
  5,
  'essential',
  true,
  'all'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  emoji = EXCLUDED.emoji,
  is_published = EXCLUDED.is_published;

INSERT INTO guide_blocks (guide_id, sort_order, heading, body)
SELECT g.id, t.ord, t.heading, t.body
FROM tenant_guides g
CROSS JOIN (VALUES
  (10, 'What you are responsible for',
       'Your tenancy agreement sets out a few things that are your responsibility to maintain. These are not unusual — most shared house tenancies work this way.'),
  (20, '🧹 Cleanliness (Clause 2.34)',
       'Keep your room and communal areas in the same condition of cleanliness and repair as when you moved in. Fair wear and tear is fine — this is about keeping things clean and not letting them deteriorate through neglect.' || chr(10) ||
       'This includes: cleaning sanitary appliances (toilets, sinks, baths), clearing shower wastes and plug holes, and cleaning your windows.'),
  (30, '💡 Light bulbs & batteries (Clause 2.36)',
       'You are responsible for replacing light bulbs, fluorescent tubes, and batteries when they need changing. If you are unsure which bulb to buy, the cap type and wattage are usually printed on the existing bulb or fitting.'),
  (40, '🤝 Shared facilities (Clause 2.38)',
       'Take proper care of any shared facilities — kitchen, bathroom, communal lounge — and clean them after you use them. This is both a tenancy requirement and basic courtesy to your housemates.'),
  (50, '🌳 Garden (Clause 2.39)',
       'Keep the garden tidy and cut the grass regularly. You do not need to improve the garden — just keep it maintained to the standard it was in when you moved in.'),
  (60, 'When to still report something',
       'If something needs professional attention — a persistent drain blockage, broken appliance, structural damage, or pest infestation — report it via the dashboard. The notes above are for things you can handle yourself; they are never a reason to live with a genuine maintenance problem.')
) AS t(ord, heading, body)
WHERE g.slug = 'your-responsibilities';
