-- 240 — Tenant guide content (22 Oct 2026). Five published guides had no pages at all — tenants opening Fire Safety,
-- Fire Door, Our Guide To The Process, Time To Check Out or Being a Great Housemate saw an empty screen, and Quick
-- Notify couldn't re-send them. This writes their pages, in the style of Mould & Condensation (a heading, then short
-- lines that show as points). And five new guides Harry asked for ("the 5 most important additional guides"), added
-- UNPUBLISHED so he can read them and add pictures in Comms → Guides before tenants see them:
--   Heating & hot water · Leaks & your stopcock · Electrical safety & e-bike batteries · Bins, recycling & pests ·
--   Keys, guests & security.
-- Renters' Rights wording: rolling tenancies, two months' notice from the tenant, no fixed terms.
-- Only fills a guide that has no pages yet, and only adds a guide whose slug doesn't exist: safe to run more than once,
-- and never overwrites anything written in the guides editor.

CREATE OR REPLACE FUNCTION pg_temp.fill_guide(p_slug TEXT, p_blocks JSONB) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE g UUID; b JSONB; n INT := 0;
BEGIN
  SELECT id INTO g FROM public.tenant_guides WHERE slug = p_slug;
  IF g IS NULL OR EXISTS (SELECT 1 FROM public.guide_blocks WHERE guide_id = g) THEN RETURN; END IF;
  FOR b IN SELECT * FROM jsonb_array_elements(p_blocks) LOOP
    n := n + 10;
    INSERT INTO public.guide_blocks (guide_id, sort_order, heading, body) VALUES (g, n, b->>'h', b->>'b');
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.new_guide(p_slug TEXT, p_title TEXT, p_emoji TEXT, p_order INT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenant_guides WHERE slug = p_slug) THEN
    INSERT INTO public.tenant_guides (slug, title, emoji, sort_order, visibility, acknowledgment_required, is_published, property_type_filter)
    VALUES (p_slug, p_title, p_emoji, p_order, 'essential', false, false, 'all');
  END IF;
END $$;

-- ── the five empty guides ───────────────────────────────────────────────────
SELECT pg_temp.fill_guide('fire-safety', $j$[
 {"h":"If the alarm goes off, get out","b":"Leave straight away — don't stop to pack or look for the fire.\nClose doors behind you as you go: it slows the fire and the smoke.\nUse the stairs and the hallway, never a lift or a window unless it's your only way out.\nOnce you're out, stay out and call 999."},
 {"h":"Know your way out","b":"Walk your route to the front door once, now, so you could do it in the dark.\nKeep hallways, stairs and landings completely clear — no bikes, bags, shoes or boxes.\nKeep your room key by your bed so you can unlock your door quickly."},
 {"h":"Smoke and heat alarms","b":"Every floor has alarms and they are tested regularly.\nNever cover an alarm, take its battery out or unplug it — it's a legal requirement and it could save your life.\nIf one beeps, keeps going off by mistake, or seems dead, report it in the app straight away."},
 {"h":"In the kitchen","b":"Most house fires start in the kitchen. Never leave cooking unattended — especially oil and grills.\nKeep tea towels and packaging away from the hob.\nIf a pan catches fire, turn off the heat if it's safe and cover it with a lid or damp tea towel. Never throw water on it.\nUse the extractor so the heat alarm isn't set off by steam."},
 {"h":"Candles, smoking and heaters","b":"No candles, incense or shisha in the house — use battery candles instead.\nSmoking is not allowed indoors.\nDon't use portable heaters; tell us if your room is cold and we'll fix the heating."},
 {"h":"Chargers and batteries","b":"Charge phones, laptops, e-bikes and e-scooters on a hard surface, never on your bed.\nUnplug chargers when they're done and never charge overnight while you sleep.\nNever keep or charge an e-bike or e-scooter in the hallway — it's your escape route."},
 {"h":"Fire doors","b":"The doors to your room, the kitchen and the hallway are fire doors. They hold back fire for 30 minutes.\nThey close by themselves for a reason: never wedge or prop them open.\nSee the Fire Door guide for what to check."},
 {"h":"If you smell gas","b":"Don't switch anything on or off, and don't use a naked flame.\nOpen the windows, turn off the gas at the meter if you can, and leave the house.\nCall the National Gas Emergency line on 0800 111 999, then tell us."}
]$j$::jsonb);

SELECT pg_temp.fill_guide('fire-door', $j$[
 {"h":"Why fire doors matter","b":"In a shared house, fire doors keep a fire in the room it starts in for at least 30 minutes.\nThat's the time everyone needs to get out safely.\nYour bedroom door, the kitchen door and some hallway doors are fire doors."},
 {"h":"Let them close","b":"Fire doors have a closer that shuts them on their own — that's how they work.\nNever wedge, prop or tie a fire door open, not even for a few minutes.\nNever take the closer off or loosen it."},
 {"h":"Quick check you can do","b":"Open the door about halfway and let go: it should close fully and click shut on its own.\nThe gaps around the edge should be even and about the width of a pound coin.\nThe strips around the edge (seals) should be in place and not painted over or torn."},
 {"h":"Tell us straight away if","b":"The door doesn't close by itself, or slams so hard it bounces open.\nIt sticks, catches or doesn't latch.\nA seal, hinge or the closer is damaged or missing.\nReport it in the app — fire door repairs are always treated as urgent."},
 {"h":"Please don't","b":"Fit hooks, locks or bolts to a fire door, or drill into it.\nRemove the signs on it.\nHang heavy things over the top that stop it closing."}
]$j$::jsonb);

SELECT pg_temp.fill_guide('guide-to-the-process', $j$[
 {"h":"Welcome to Capital Rooms","b":"We manage your house for the landlord — rent, repairs, safety checks and anything else about the house comes to us.\nThe app is the quickest way to reach us and where your documents and the house guides live."},
 {"h":"Your tenancy","b":"Your tenancy is periodic (rolling) — it carries on month to month with no fixed end date.\nIf you decide to move on, give us two months' notice in writing, at any time. You can do it in the app under Give notice.\nWe can only end a tenancy for the reasons the law allows, with the proper notice."},
 {"h":"Paying rent","b":"Rent is due monthly in advance on the day shown in your tenancy agreement.\nPay by standing order and always use your payment reference so we can match it straight away.\nIf you're ever going to be late, tell us before the due date — we'll always try to help."},
 {"h":"Repairs","b":"Report anything that needs fixing in the app, with a photo if you can.\nEmergencies are made safe within 24 hours, urgent repairs within 5 working days and everyday repairs within 10 working days.\nWe'll tell you when a contractor is booked. If a repair goes wrong again, reopen it in the app."},
 {"h":"Visits to the house","b":"We'll always give you at least 24 hours' notice in writing before anyone visits, except in an emergency.\nYou don't need to be in — we let contractors in with the management keys.\nOur cleaner looks after the shared areas; your room is yours to keep clean."},
 {"h":"Your deposit","b":"Your deposit is protected with a government-approved scheme — you'll have the details by email.\nAt the end of your tenancy it's returned, less anything agreed for damage or cleaning, after your check-out."},
 {"h":"Living together","b":"You share the house with other people, so a little thought goes a long way — see Being a Great Housemate.\nIf something isn't working between housemates, tell us in the app (Housemate concern) and we'll help."}
]$j$::jsonb);

SELECT pg_temp.fill_guide('time-to-check-out', $j$[
 {"h":"Your last few weeks","b":"Thank you for letting us know you're moving on. Rent is due up to and including your last day.\nWe may arrange viewings of your room — always with at least 24 hours' notice, and someone from our team with the visitors.\nA tidy room means fewer viewings."},
 {"h":"Leave your room as you found it","b":"Clean the floor, skirting boards, windowsills, mirror and the inside of the wardrobe and drawers.\nTake down anything you've put up, and fill small holes only if you know how — otherwise leave them.\nEmpty your fridge shelf, food cupboard and the freezer."},
 {"h":"Take everything with you","b":"Anything left behind may have to be cleared, and the cost could come from your deposit.\nDon't leave things in the hallway, garden or by the bins — book a council bulky waste collection or a charity pick-up instead."},
 {"h":"On your last day","b":"Return all your keys and fobs as we've arranged, by the time agreed.\nTake meter photos if you pay any bills directly.\nGive us your forwarding address and the bank details for your deposit return."},
 {"h":"Your deposit","b":"We check your room against the inventory from when you moved in.\nWe'll write to you with what we propose to return. If you agree, we pay it back promptly.\nIf you don't agree with a deduction, the deposit scheme has a free dispute service."},
 {"h":"Changed your mind?","b":"If your plans change before you leave, tell us as soon as possible — you can ask to stay in the app.\nWe can't always say yes if the room has been re-let, so the sooner the better."}
]$j$::jsonb);

SELECT pg_temp.fill_guide('great-housemate', $j$[
 {"h":"Shared spaces are everyone's","b":"Wash, dry and put away your dishes after each meal.\nWipe the hob, worktops and table when you've used them.\nKeep your food in your own space and label anything in the fridge."},
 {"h":"Leave no trace","b":"Leave the kitchen, bathroom and living room the way you'd like to find them.\nTake your belongings back to your room — shared areas aren't storage.\nIt's what we ask of everyone, and what new housemates see when they view the house."},
 {"h":"Bins and recycling","b":"Take the rubbish out when the bin is full — don't wait for someone else.\nRinse recycling and flatten boxes.\nPut the bins out the night before collection day and bring them back in."},
 {"h":"Noise","b":"Keep music, calls and guests down between 11pm and 7am.\nUse headphones in shared areas.\nShut doors gently — fire doors close firmly by themselves."},
 {"h":"Guests","b":"Guests are welcome, but you're responsible for them while they're in the house.\nLet your housemates know if someone is staying over.\nNobody can move in — occasional overnight guests only."},
 {"h":"Talk to each other","b":"Most problems in a shared house are small and easy to sort with a friendly word.\nA simple cleaning rota helps everyone know what to do.\nIf it doesn't get better, tell us in the app (Housemate concern) — we'll handle it discreetly."}
]$j$::jsonb);

-- ── five new guides, unpublished for Harry to review ────────────────────────
SELECT pg_temp.new_guide('heating-hot-water', 'Heating & Hot Water', '🔥', 70);
SELECT pg_temp.fill_guide('heating-hot-water', $j$[
 {"h":"Keep it steady","b":"Heating low and steady all day keeps the house warmer and the bills lower than blasting it on and off.\nThe radiator in your room has a dial (TRV): 3 is comfortable, 5 is full — please don't turn the boiler thermostat up instead."},
 {"h":"If the radiators are cold","b":"Check the heating is on at the timer or thermostat.\nIf the top of a radiator is cold and the bottom warm, it may need bleeding — report it and we'll sort it.\nIf no radiator is warm, check the boiler (below)."},
 {"h":"Checking the boiler","b":"Look at the pressure gauge on the boiler: it should be between 1 and 2 when the heating is off.\nIf it's below 1, or the boiler shows a fault code, take a photo and report it in the app — the code helps the engineer.\nNever take the boiler cover off."},
 {"h":"No hot water","b":"If there's no hot water anywhere, report it in the app as urgent — we aim to fix it within 5 working days, sooner in winter.\nIf it's just one tap or the shower, say which one."},
 {"h":"Please don't","b":"Use portable or oil heaters — they're a fire risk and very expensive to run.\nDry washing on radiators — it causes condensation and mould.\nBlock radiators with furniture."}
]$j$::jsonb);

SELECT pg_temp.new_guide('leaks-and-stopcock', 'Leaks & Your Stopcock', '💧', 80);
SELECT pg_temp.fill_guide('leaks-and-stopcock', $j$[
 {"h":"Find your stopcock now","b":"The stopcock turns off all the water to the house. It's usually under the kitchen sink or where the water pipe comes in.\nTurn it clockwise to close. Knowing where it is before you need it can save the house from a flood."},
 {"h":"If water is pouring in","b":"Turn off the stopcock straight away.\nIf water is near lights or sockets, turn off the electricity at the fuse board if it's safe — don't touch wet switches.\nReport it in the app as an emergency, then call us."},
 {"h":"A drip or a slow leak","b":"Put a bowl or towel underneath and take a photo.\nReport it in the app the same day — small leaks become big ones and cause damp and mould."},
 {"h":"Blocked sink, toilet or shower","b":"Never pour fat, oil or food down the sink — let it cool and put it in the bin.\nOnly toilet paper goes down the toilet: no wipes, cotton buds or sanitary products.\nIf it's blocked, report it — don't use strong chemicals."},
 {"h":"Water from upstairs or next door","b":"If it's coming from a neighbour, tell us straight away and we'll contact them or the building's managing agent."}
]$j$::jsonb);

SELECT pg_temp.new_guide('electrical-safety', 'Electrical Safety & E-bike Batteries', '🔌', 90);
SELECT pg_temp.fill_guide('electrical-safety', $j$[
 {"h":"E-bikes and e-scooters","b":"Faulty lithium batteries are now one of the biggest causes of fires in London homes.\nOnly use the charger that came with it, from a reputable seller.\nCharge in your room on a hard floor, while you're awake, and unplug it when it's done.\nNever keep or charge one in the hallway or by the front door — it's everyone's way out."},
 {"h":"Plugs and sockets","b":"Don't plug extension leads into extension leads, or run lots of high-power things from one socket.\nKettles, heaters and hair dryers should go straight into a wall socket.\nIf a plug or socket feels hot, smells of burning or crackles, stop using it and report it."},
 {"h":"If the power goes off","b":"Find the fuse board (consumer unit). If a switch has flipped down, unplug everything on that circuit and flip it back up.\nIf it trips again straight away, leave it off and report it in the app.\nIf the whole street is dark, it's a power cut — call 105."},
 {"h":"Damaged leads and chargers","b":"Throw away chargers and leads with cracked casing or bare wires.\nDon't run leads under rugs or trap them behind furniture."},
 {"h":"Our checks","b":"A qualified electrician checks the whole house at least every five years (the EICR), and we give you a copy.\nWe'll always give you notice before they visit."}
]$j$::jsonb);

SELECT pg_temp.new_guide('bins-recycling-pests', 'Bins, Recycling & Pests', '♻️', 100);
SELECT pg_temp.fill_guide('bins-recycling-pests', $j$[
 {"h":"Which bin","b":"General waste in the black bin, bagged.\nRecycling (clean paper, card, cans, plastic bottles and pots, glass) in the recycling bin — rinsed and loose, not in bags.\nCheck the council's website for your house's collection day."},
 {"h":"Collection day","b":"Put the bins out the night before and bring them back in after collection.\nNever leave bags next to the bins — they won't be collected and they attract foxes and rats."},
 {"h":"Big items","b":"Furniture, mattresses and electricals can't go in the bins. Book the council's bulky waste collection or a charity pick-up.\nNever leave them in the front garden or the street — it can lead to a fine."},
 {"h":"Keeping pests away","b":"Keep food in sealed containers and wipe up crumbs.\nEmpty the kitchen bin regularly and keep its lid shut.\nIf you see mice, rats, cockroaches or bed bugs, report it in the app straight away — the sooner it's treated, the easier it is."}
]$j$::jsonb);

SELECT pg_temp.new_guide('keys-guests-security', 'Keys, Guests & Security', '🔑', 110);
SELECT pg_temp.fill_guide('keys-guests-security', $j$[
 {"h":"Keep the house secure","b":"Always close and lock the front door behind you, even if you're popping out.\nClose ground-floor windows when you go out.\nNever let someone you don't know into the house — ask them to call the person they're visiting."},
 {"h":"Your keys","b":"Don't lend your keys or have copies cut — tell us if someone needs access.\nIf you lose a key or fob, tell us straight away so we can keep the house secure. A replacement may be charged."},
 {"h":"Locked out?","b":"Message us in the app. Out of hours we'll do our best, but a locksmith call-out may be charged if the lock isn't faulty."},
 {"h":"Parcels","b":"Use a safe-place or pick-up point where you can — parcels left in the hallway can block the way out.\nCollect anything left for you the same day."},
 {"h":"Guests","b":"You're responsible for your guests while they're in the house.\nOccasional overnight guests are fine; let your housemates know.\nNo one else can live in your room — the house is licensed for a set number of people."}
]$j$::jsonb);
