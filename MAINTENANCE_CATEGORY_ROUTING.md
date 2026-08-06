# Maintenance Issue Routing System
## Modern Category-First Interface

Instead of one generic form, users select their issue type first, then get an optimized form with the right questions.

---

## 🎨 Landing Screen: Visual Category Cards

### **User Flow**
```
Click "Report Maintenance"
        ↓
See 9 modern category cards with icons
        ↓
Click category
        ↓
Go to optimized form for that category
        ↓
Submit ticket with category-specific data
```

### **Visual Layout**
```
┌─────────────────────────────────────────────────────┐
│  What type of issue are you reporting?              │
├─────────────────────────────────────────────────────┤
│                                                      │
│  [🔧] Appliances      [🪑] Furniture               │
│  Dishwasher, oven,    Bed, sofa, chair             │
│  washing machine      table, cupboard               │
│                                                      │
│  [💧] Plumbing        [⚡] Electrical               │
│  Leaks, blockages,    Lights, sockets,              │
│  taps, toilets        switches, breakers            │
│                                                      │
│  [🔥] Heating/Cooling [🏠] Structure/Building      │
│  Boiler, radiator,    Walls, doors, windows,       │
│  thermostat, AC       floors, damp, cracks         │
│                                                      │
│  [🔐] Safety/Security [🧹] Cleanliness             │
│  Locks, alarms,       Stains, odors, mold,         │
│  emergency items      pest issues                   │
│                                                      │
│  [🎨] Decoration      [❓] Other                    │
│  Paint, wallpaper,    Anything else                │
│  tiles, grout                                       │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 1️⃣ APPLIANCES Route

### **Issues Covered**
- Dishwasher (not washing, not draining, won't start)
- Washing Machine (not spinning, won't drain, noise)
- Dryer (not heating, won't start)
- Oven/Cooker (won't heat, broken element, temperature issues)
- Microwave (won't heat, display broken)
- Fridge/Freezer (not cold enough, making noise, leaking)
- Kettle/Toaster (specific issues)

### **Optimized Form**

```
┌─────────────────────────────────────────────────────┐
│  Appliance Issue Report                             │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. Which appliance?  [Dropdown]                    │
│     ├─ Dishwasher                                   │
│     ├─ Washing Machine                              │
│     ├─ Dryer                                        │
│     ├─ Oven/Cooker                                  │
│     ├─ Microwave                                    │
│     ├─ Fridge/Freezer                               │
│     └─ Other                                        │
│                                                      │
│  2. Equipment Details (Auto-filled if in registry)  │
│     Brand: [Bosch]                                  │
│     Model: [SMV50C10GB]                             │
│     Serial: [DW123456789]                           │
│                                                      │
│  3. What's the problem? [Multiple selection]        │
│     ☐ Won't start/power up                         │
│     ☐ Making strange noise                          │
│     ☐ Not heating/cooling properly                  │
│     ☐ Leaking water                                 │
│     ☐ Display/buttons not working                   │
│     ☐ Smell coming from it                          │
│     ☐ Spinning/cycle won't finish                   │
│     ☐ Other: [text field]                           │
│                                                      │
│  4. Troubleshooting: Have you tried?               │
│     ☐ Checked power is on                          │
│     ☐ Checked door is properly closed              │
│     ☐ Restarted the appliance                      │
│     ☐ Checked water/gas supply                     │
│     ☐ None of the above                            │
│                                                      │
│  5. How urgent? [Priority]                          │
│     ◯ Low (still works, minor issue)               │
│     ◉ Medium (partially working)                   │
│     ◯ High (doesn't work at all)                   │
│                                                      │
│  6. Photos (Required)                               │
│     📷 Equipment label/nameplate                    │
│     📷 The problem (e.g., leaked water)            │
│     📹 Video demo (optional)                        │
│                                                      │
│  7. When can we access? [Time slots]                │
│     Next 24 hours / This week / No preference       │
│                                                      │
│  [Submit Report] [Cancel]                          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### **System Captures**
```javascript
{
  category: "appliances",
  appliance_type: "dishwasher",
  equipment_id: "dishwasher-001",
  problems: ["not_draining", "leaking_water"],
  troubleshooting_done: ["checked_power", "restarted"],
  priority: "high",
  photos: [{ type: "label" }, { type: "issue" }],
  video: "demo.mp4",
  access_time: "24-hours"
}
```

---

## 2️⃣ FURNITURE Route

### **Issues Covered**
- Bed (broken frame, wobbly, broken slats, mattress issues)
- Sofa/Couch (torn fabric, broken spring, wobbly legs)
- Chairs (broken seat, wobbly, torn fabric, can't sit)
- Tables (wobbly, cracked top, broken leg)
- Cupboards/Storage (stuck door, broken shelf, loose hinge)
- Desk/Vanity (unstable, broken drawer, cracked surface)

### **Optimized Form**

```
┌─────────────────────────────────────────────────────┐
│  Furniture Issue Report                             │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. What furniture? [Dropdown]                      │
│     ├─ Bed/Mattress                                 │
│     ├─ Sofa/Couch                                   │
│     ├─ Chair                                        │
│     ├─ Table                                        │
│     ├─ Cupboard/Wardrobe                            │
│     ├─ Desk                                         │
│     └─ Other                                        │
│                                                      │
│  2. Location                                        │
│     [Select from room list]                         │
│                                                      │
│  3. What's wrong? [Multiple selection]              │
│     ☐ Wobbly/unstable                              │
│     ☐ Torn fabric/upholstery                       │
│     ☐ Broken leg/support                           │
│     ☐ Cracked/split surface                        │
│     ☐ Stuck door/drawer                            │
│     ☐ Broken spring/support                        │
│     ☐ Damaged frame                                │
│     ☐ Stained/discolored                           │
│     ☐ Other: [text]                                │
│                                                      │
│  4. Is it still usable?                            │
│     ◯ Yes, fully usable                            │
│     ◉ Partially usable                             │
│     ◯ Not usable at all                            │
│                                                      │
│  5. Safety concern?                                 │
│     ☐ Could cause injury (sharp edges, collapse)   │
│     ☐ No safety issue                              │
│                                                      │
│  6. Is it replaceable? (belongs to property)       │
│     ◉ Yes, will replace                            │
│     ◯ No, tenant's responsibility                  │
│                                                      │
│  7. Priority                                        │
│     ◯ Low (cosmetic, still works)                  │
│     ◉ Medium (partially broken)                    │
│     ◯ High (broken, safety issue)                  │
│                                                      │
│  8. Photos (Required)                               │
│     📷 Overall view of damage                       │
│     📷 Close-up of problem area                     │
│     📷 Any stains/marks (if applicable)             │
│                                                      │
│  [Submit Report] [Cancel]                          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 3️⃣ PLUMBING Route

### **Issues Covered**
- Taps (dripping, won't stop, low pressure, broken handle)
- Toilets (won't flush, constantly running, leaking, overflow)
- Showers (low pressure, won't turn off, broken head, leak)
- Pipes (visible leak, gurgling sounds, water staining)
- Drains (blockage, slow drain, backing up, smell)

### **Optimized Form**

```
┌─────────────────────────────────────────────────────┐
│  Plumbing Issue Report                              │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. What's the issue? [Dropdown]                    │
│     ├─ Leaking tap                                  │
│     ├─ Toilet not flushing/running                  │
│     ├─ Low water pressure                           │
│     ├─ Blocked drain/toilet                         │
│     ├─ Pipe leak                                    │
│     ├─ Shower issues                                │
│     └─ Other                                        │
│                                                      │
│  2. Location                                        │
│     [Select from: Kitchen, Bathroom 1, Bathroom 2] │
│                                                      │
│  3. When did it start?                              │
│     ◯ Just now                                      │
│     ◯ Today                                         │
│     ◯ A few days ago                                │
│     ◯ A week or more                                │
│                                                      │
│  4. Is water actively leaking/flooding?             │
│     ☐ YES - Active leak/flood                       │
│     ☐ No - Dripping/slow leak only                 │
│                                                      │
│  5. Describe the problem                            │
│     [Text area for details]                         │
│                                                      │
│  6. Have you tried? [Multiple selection]            │
│     ☐ Turned off the tap                           │
│     ☐ Used a plunger                               │
│     ☐ Checked shutoff valve                        │
│     ☐ Cleared visible blockage                     │
│     ☐ None of the above                            │
│                                                      │
│  7. Priority                                        │
│     ◯ Low (slow drip, minor leak)                  │
│     ◉ Medium (reducing water pressure)             │
│     ◯ HIGH (active leak/flooding)                  │
│                                                      │
│  8. Photos (Required if leak)                       │
│     📷 The leak/problem                             │
│     📷 Water damage (if any)                        │
│     📸 Before & after location                      │
│                                                      │
│  [URGENT: Active Leak?] [Call Plumber Immediately] │
│                                                      │
│  [Submit Report] [Cancel]                          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 4️⃣ ELECTRICAL Route

### **Issues Covered**
- Lights (won't turn on, flickering, dimming, breaker trip)
- Sockets (won't hold plug, sparking, not working)
- Switches (won't click, broken, stuck)
- Breaker/Panel (tripped, won't reset)
- Appliances (won't power up - triaged here if electrical)

### **Optimized Form**

```
┌─────────────────────────────────────────────────────┐
│  Electrical Issue Report                            │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ⚠️ SAFETY FIRST: No sparking, burning, or smell?  │
│     If YES, turn OFF and don't use. Report as HIGH. │
│                                                      │
│  1. What's broken? [Dropdown]                       │
│     ├─ Light bulb/fixture                           │
│     ├─ Light switch                                 │
│     ├─ Power socket/outlet                          │
│     ├─ Breaker/circuit                              │
│     ├─ Appliance won't power up                     │
│     └─ Other                                        │
│                                                      │
│  2. Location                                        │
│     [Select room and specific location]             │
│                                                      │
│  3. What's happening?                               │
│     ☐ Won't turn on                                 │
│     ☐ Turns on but flickers                         │
│     ☐ Dims inconsistently                           │
│     ☐ Breaker keeps tripping                        │
│     ☐ Sparking/burning smell                        │
│     ☐ Plug won't stay in socket                     │
│     ☐ Hot to touch                                  │
│                                                      │
│  4. When did it happen?                             │
│     ◯ Just now                                      │
│     ◯ After storm/power outage                      │
│     ◯ Gradually over time                           │
│     ◯ Random/intermittent                           │
│                                                      │
│  5. Have you tried? [Multiple selection]            │
│     ☐ Checked if breaker tripped                   │
│     ☐ Tried different bulb (if light)              │
│     ☐ Unplugged and replugged                      │
│     ☐ Tried different socket                       │
│     ☐ None of the above                            │
│                                                      │
│  6. Safety concerns?                                │
│     ◉ No - seems safe                              │
│     ◯ YES - sparking/burning/hot                   │
│                                                      │
│  7. Priority                                        │
│     ◯ Low (minor convenience)                      │
│     ◉ Medium (affects comfort/use)                 │
│     ◯ HIGH (safety risk, sparking, burning)        │
│                                                      │
│  8. Photos                                          │
│     📷 The problem area                             │
│     📷 Circuit breaker panel (if tripped)           │
│                                                      │
│  [Submit Report] [Cancel]                          │
│                                                      │
│  [⚠️  If HIGH PRIORITY, we'll contact immediately] │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 5️⃣ HEATING/COOLING Route

### **Issues Covered**
- Boiler (won't ignite, pressure low, no hot water)
- Radiators (cold, noisy, leaking)
- Thermostat (won't respond, broken display)
- AC/Cooling (won't cool, noisy, leak)

### **Optimized Form**

```
┌─────────────────────────────────────────────────────┐
│  Heating/Cooling Issue Report                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. What's the issue? [Dropdown]                    │
│     ├─ No hot water                                 │
│     ├─ Radiators not heating                        │
│     ├─ Boiler making noise                          │
│     ├─ Boiler leaking                               │
│     ├─ Thermostat not working                       │
│     ├─ AC not cooling                               │
│     └─ Other                                        │
│                                                      │
│  2. How many rooms affected?                        │
│     ◯ Just one                                      │
│     ◯ A few rooms                                   │
│     ◉ Whole property                                │
│                                                      │
│  3. Current temperature?                            │
│     Too hot: ___°C  /  Too cold: ___°C              │
│     (Comfortable range: 18-21°C)                    │
│                                                      │
│  4. How long?                                       │
│     ◯ Just started                                  │
│     ◯ A few hours                                   │
│     ◯ All day                                       │
│     ◯ Several days                                  │
│                                                      │
│  5. Boiler details (if applicable)                  │
│     Model: [Auto-filled or manual entry]            │
│     Pressure gauge: [Low / Normal / High]           │
│     Any error codes? [Text field]                   │
│                                                      │
│  6. Noises/Smells? [Multiple selection]             │
│     ☐ Banging/knocking                              │
│     ☐ Whistling                                     │
│     ☐ Gurgling                                      │
│     ☐ Burning smell                                 │
│     ☐ None                                          │
│                                                      │
│  7. Have you tried? [Multiple selection]            │
│     ☐ Checked thermostat battery                   │
│     ☐ Bled radiators                                │
│     ☐ Reset boiler                                  │
│     ☐ Checked boiler pressure                       │
│     ☐ None of the above                             │
│                                                      │
│  8. Priority                                        │
│     ◯ Low (mild discomfort, seasonal)              │
│     ◉ Medium (rooms noticeably cold/hot)           │
│     ◯ High (no heat/cooling, winter/summer)        │
│                                                      │
│  9. Photos                                          │
│     📷 Boiler display (if error shown)              │
│     📷 Thermostat (if not responding)               │
│     📷 Radiators/AC unit                            │
│                                                      │
│  [Submit Report] [Cancel]                          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 6️⃣ STRUCTURE/BUILDING Route

### **Issues Covered**
- Walls (cracks, holes, damp, mold, paint)
- Doors (won't close, sticky, handle broken, frame cracked)
- Windows (won't open, cracked glass, rotten frame, stuck)
- Floors (loose boards, cracked tile, cracked concrete)
- Ceiling (water stains, cracked plaster, peeling paint)
- Roof (visible leak, missing tiles)

### **Optimized Form**

```
┌─────────────────────────────────────────────────────┐
│  Structure/Building Issue Report                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. What's the issue? [Dropdown]                    │
│     ├─ Wall crack/damage                            │
│     ├─ Damp/mold                                    │
│     ├─ Door/window frame                            │
│     ├─ Floor damage                                 │
│     ├─ Ceiling leak/damage                          │
│     ├─ Window glass cracked                         │
│     ├─ Paint peeling                                │
│     └─ Other                                        │
│                                                      │
│  2. Location                                        │
│     [Room and specific wall/area]                   │
│                                                      │
│  3. How long? (important for tracking growth)       │
│     ◯ Just noticed                                  │
│     ◯ A few weeks                                   │
│     ◯ A few months                                  │
│     ◯ Over a year                                   │
│                                                      │
│  4. Is it getting worse?                            │
│     ◯ No, stable                                    │
│     ◉ Yes, spreading/growing                       │
│     ◯ Only when raining/cold                        │
│                                                      │
│  5. For cracks: Estimate size                       │
│     Width: Hair-thin / Pencil-thin / Wider than 5mm│
│     Length: A few inches / A foot / Several feet    │
│                                                      │
│  6. For damp/mold: Coverage                         │
│     ◯ Small patch (less than hand)                 │
│     ◯ Medium area (hand-sized to larger)           │
│     ◯ Large area (significant coverage)            │
│                                                      │
│  7. Could affect structural safety?                 │
│     ◯ No - cosmetic only                           │
│     ◉ Maybe - need inspection                      │
│     ◯ Yes - looks serious                          │
│                                                      │
│  8. Priority                                        │
│     ◯ Low (cosmetic, stable)                       │
│     ◉ Medium (progressive, concerning)             │
│     ◯ High (safety concern, rapid growth)          │
│                                                      │
│  9. Photos (Required - help us assess)              │
│     📷 Overall view of damaged area                 │
│     📷 Close-up showing crack/damage detail         │
│     📷 Any water staining/evidence                  │
│                                                      │
│  [Submit Report] [Cancel]                          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 7️⃣ SAFETY/SECURITY Route

### **Issues Covered**
- Locks (won't lock, key stuck, broken lock)
- Alarms (won't arm, battery dead, false alarms)
- Hazards (sharp objects, exposed wires, trip hazard)
- Fire safety (smoke alarm, sprinkler)
- Emergency items (first aid, emergency exit)

### **Optimized Form**

```
┌─────────────────────────────────────────────────────┐
│  Safety & Security Issue Report                     │
├─────────────────────────────────────────────────────┤
│  ⚠️  URGENT SAFETY ISSUES? CALL IMMEDIATELY        │
│     Don't wait to submit form                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. What's the issue? [Dropdown]                    │
│     ├─ Door/window lock broken                      │
│     ├─ Key stuck or won't work                      │
│     ├─ Alarm won't arm/disarm                       │
│     ├─ Alarm battery dead                           │
│     ├─ Smoke alarm not working                      │
│     ├─ Exposed hazard (wires, sharp)               │
│     ├─ Trip/fall hazard                             │
│     ├─ Emergency exit blocked                       │
│     └─ Other safety issue                           │
│                                                      │
│  2. Severity                                        │
│     ◯ Minor (inconvenience)                        │
│     ◉ Moderate (affects security/safety)          │
│     ◯ URGENT (immediate danger)                    │
│                                                      │
│  3. Location                                        │
│     [Select from property areas]                    │
│                                                      │
│  4. Describe the issue                              │
│     [Text area with specific details]               │
│                                                      │
│  5. Has anyone been harmed?                         │
│     ◯ No                                            │
│     ◯ Yes - describe: [Text field]                  │
│                                                      │
│  6. Is property secured? (if lock issue)            │
│     ◯ Yes - door can be locked another way        │
│     ◯ No - property unsecured                      │
│                                                      │
│  7. Photos                                          │
│     📷 The hazard/problem                           │
│     📷 Lock/alarm/device showing damage            │
│                                                      │
│  [Submit Report] [Cancel]                          │
│                                                      │
│  ⚠️  URGENT: We'll contact within 1 hour          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 8️⃣ CLEANLINESS/PEST Route

### **Issues Covered**
- Stains (carpet, walls, furniture)
- Odors (musty, rotten, pet)
- Mold/Fungus (growing on surfaces)
- Pest issues (insects, rodents, droppings)
- General cleanliness (building cleanliness issue)

### **Optimized Form**

```
┌─────────────────────────────────────────────────────┐
│  Cleanliness & Pest Report                          │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. What's the issue? [Dropdown]                    │
│     ├─ Stain (carpet, walls, furniture)             │
│     ├─ Odor (musty, rotten, other)                  │
│     ├─ Mold/fungus growth                           │
│     ├─ Pest sighting (insects/rodents)              │
│     ├─ Pest droppings                               │
│     ├─ General cleanliness issue                    │
│     └─ Other                                        │
│                                                      │
│  2. Location                                        │
│     [Select room and specific area]                 │
│                                                      │
│  3. Severity/Coverage                               │
│     ◯ Small (localized to one area)                │
│     ◉ Medium (affecting room/area)                 │
│     ◯ Large (spreading/widespread)                 │
│                                                      │
│  4. How long?                                       │
│     ◯ Just appeared                                 │
│     ◯ A few days                                    │
│     ◯ A week or more                                │
│     ◯ Long-standing                                 │
│                                                      │
│  5. Is it growing/spreading?                        │
│     ◯ No - stable                                   │
│     ◉ Yes - getting worse                          │
│     ◯ Not sure                                      │
│                                                      │
│  6. For pests: Any activity?                        │
│     ☐ Seen live pest                                │
│     ☐ Seen droppings                                │
│     ☐ Heard sounds (scratching, etc.)               │
│     ☐ Damage to items (gnawed, etc.)                │
│                                                      │
│  7. Have you tried cleaning?                        │
│     ◯ Yes - didn't help                             │
│     ◯ No - not sure how to clean                    │
│     ◯ No - need professional help                   │
│                                                      │
│  8. Priority                                        │
│     ◯ Low (minor cosmetic issue)                   │
│     ◉ Medium (noticeable, need addressing)         │
│     ◯ High (hygiene/health concern)                │
│                                                      │
│  9. Photos (Required)                               │
│     📷 The stain/mold/pest evidence                 │
│     📷 Area showing extent of issue                 │
│     📷 Close-up if possible                         │
│                                                      │
│  [Submit Report] [Cancel]                          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 9️⃣ DECORATION Route

### **Issues Covered**
- Paint (peeling, stained, faded, scratched)
- Wallpaper (peeling, torn, stained, bubbling)
- Tiles (cracked, broken, grout failing)
- Grout (failing, stained, moldy)
- Flooring decoration (scuffs, stains)

### **Optimized Form**

```
┌─────────────────────────────────────────────────────┐
│  Decoration & Finishes Report                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. What's the issue? [Dropdown]                    │
│     ├─ Paint peeling/bubbling                       │
│     ├─ Paint stain/mark                             │
│     ├─ Wallpaper peeling                            │
│     ├─ Wallpaper torn/damaged                       │
│     ├─ Tile cracked/broken                          │
│     ├─ Grout failing/cracked                        │
│     ├─ Scratches/marks on surface                   │
│     └─ Other                                        │
│                                                      │
│  2. Location                                        │
│     [Room and specific surface/area]                │
│                                                      │
│  3. Type of surface                                 │
│     ◯ Wall                                          │
│     ◯ Ceiling                                       │
│     ◯ Floor                                         │
│     ◯ Trim/molding                                  │
│     ◯ Other                                         │
│                                                      │
│  4. Extent of damage                                │
│     ◯ Single small area                             │
│     ◯ Multiple small areas                          │
│     ◉ Larger area or multiple areas                 │
│     ◯ Extensive throughout room                     │
│                                                      │
│  5. What caused it? (if known)                      │
│     ☐ Water damage/moisture                         │
│     ☐ Impact/wear                                   │
│     ☐ Stain (dirt, mark, spill)                     │
│     ☐ Natural aging/wear                           │
│     ☐ Unknown                                       │
│                                                      │
│  6. Is it affecting function?                       │
│     ◯ No - cosmetic only                            │
│     ◉ Slightly - cosmetic mainly                    │
│     ◯ Yes - exposing underlying issues              │
│                                                      │
│  7. Can it wait or is urgent?                       │
│     ◯ Can wait (cosmetic)                           │
│     ◉ Prefer sooner (noticeable)                    │
│     ◯ Urgent (progressing/unsightly)                │
│                                                      │
│  8. Photos (Required)                               │
│     📷 Overall view of decorated area               │
│     📷 Close-up of damage/issue                     │
│     📷 Color/finish if relevant                     │
│                                                      │
│  [Submit Report] [Cancel]                          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 🔟 OTHER Route

### **Fallback for Uncategorized Issues**

```
┌─────────────────────────────────────────────────────┐
│  Other Issue Report                                 │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. Brief title/summary                             │
│     [Text field]                                    │
│                                                      │
│  2. Detailed description                            │
│     [Large text area - use this space]              │
│                                                      │
│  3. Location                                        │
│     [Select from property areas]                    │
│                                                      │
│  4. How urgent?                                     │
│     ◯ Low                                           │
│     ◉ Medium                                        │
│     ◯ High                                          │
│                                                      │
│  5. Photos                                          │
│     📷 Upload relevant photos                       │
│                                                      │
│  [Submit Report] [Cancel]                          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 🎨 Why This Works

### **User Benefits**
- ✓ Feels modern and intuitive
- ✓ Visual cards make it clear what to select
- ✓ Optimized form for each issue type
- ✓ Asks the right questions
- ✓ Collects proper diagnostic data
- ✓ Faster to fill out targeted form

### **Admin/Contractor Benefits**
- ✓ Consistent data per category
- ✓ Always get the info they need
- ✓ Faster triage and assignment
- ✓ Better diagnostics from the start
- ✓ Can set category-specific SLAs (appliances: 24hrs, safety: 1hr, etc.)

### **System Benefits**
- ✓ Standardized data structure per category
- ✓ Easy to build category-specific workflows
- ✓ Can track category-specific metrics
- ✓ Scalable to add new categories

---

## 🚀 Implementation Steps

1. **Create category selection screen** with visual cards
2. **Build optimized form for each category** (9 total)
3. **Add category-specific routing** in database
4. **Set category-based priorities** and SLAs
5. **Create contractor category preferences** (some do appliances, some do plumbing)
6. **Dashboard filters by category** for easier management

This transforms from "generic maintenance form" to **professional category-driven triage system**! 🎯

