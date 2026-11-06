// The questions a great room advert answers (6 Nov 2026 — see lib/marketing/advert for why these). Shared by the
// Advert studio in the browser and the server — no server code here.
export type FactScope = 'room' | 'house'
export interface Fact { key: string; scope: FactScope; label: string; ask: string; placeholder?: string; options?: string[] }

/** In the order a good advert answers them. */
export const FACTS: Fact[] = [
  // the room
  { key: 'bed', scope: 'room', label: 'Bed', ask: 'What size is the bed?', options: ['Single', 'Small double', 'Double', 'King'] },
  { key: 'storage', scope: 'room', label: 'Storage & furniture', ask: 'What’s in the room besides the bed?', placeholder: 'e.g. 3 wardrobes, chest of drawers, desk and chair' },
  { key: 'bathroom', scope: 'room', label: 'Bathroom', ask: 'Bathroom — en-suite, or shared with how many?', placeholder: 'e.g. en-suite shower room / shared with 2' },
  { key: 'room_light', scope: 'room', label: 'Light & view', ask: 'Anything special about the light or view?', placeholder: 'e.g. south-facing, big bay window over the park' },
  { key: 'room_size', scope: 'room', label: 'Size', ask: 'Roughly how big is the room?', placeholder: 'e.g. 12 m², fits a double and a desk' },
  // money and moving in
  { key: 'bills', scope: 'house', label: 'Bills', ask: 'What’s included in the rent?', placeholder: 'e.g. all bills, WiFi, council tax and a fortnightly cleaner' },
  { key: 'deposit', scope: 'room', label: 'Deposit', ask: 'Deposit?', placeholder: 'e.g. 5 weeks’ rent' },
  { key: 'available', scope: 'room', label: 'Available', ask: 'Available from?', placeholder: 'e.g. 1 December' },
  // the house and who lives there
  { key: 'housemates', scope: 'house', label: 'Who lives there', ask: 'Who lives in the house — how many, roughly what ages, what they do, what it’s like?', placeholder: 'e.g. 4 professionals in their late 20s, friendly but quiet in the week' },
  { key: 'communal', scope: 'house', label: 'Shared spaces', ask: 'What are the shared spaces like?', placeholder: 'e.g. big kitchen with island, lounge with smart TV, garden' },
  { key: 'appliances', scope: 'house', label: 'Laundry & kitchen', ask: 'Laundry and kitchen kit?', placeholder: 'e.g. washing machine, dryer, dishwasher' },
  { key: 'broadband', scope: 'house', label: 'Internet', ask: 'Broadband?', placeholder: 'e.g. 900 Mb full fibre' },
  { key: 'cleaner', scope: 'house', label: 'Cleaner', ask: 'Is there a cleaner for the shared areas?', options: ['Weekly', 'Fortnightly', 'No'] },
  // the area
  { key: 'transport', scope: 'house', label: 'Transport', ask: 'Nearest station and how long a walk? Any good bus routes?', placeholder: 'e.g. Surrey Quays (Overground) 8 min, Canada Water (Jubilee) 12 min, 188 bus outside' },
  { key: 'road', scope: 'house', label: 'The street', ask: 'Is it a quiet road or a busy one?', options: ['Quiet residential', 'Some traffic', 'Busy road / bus route'] },
  { key: 'nearby', scope: 'house', label: 'Nearby', ask: 'Parks, shops, gyms, places to eat nearby — with how far?', placeholder: 'e.g. Southwark Park 5 min, Tesco 3 min, Gym Group 10 min' },
  // house rules
  { key: 'suits', scope: 'house', label: 'Would suit', ask: 'Who would it suit? Couples, pets, smokers?', placeholder: 'e.g. a working professional; no couples, no pets, no smoking' },
  { key: 'parking', scope: 'house', label: 'Parking', ask: 'Parking or bike storage?', placeholder: 'e.g. permit parking, bike shed' },
]
export const FACT_BY_KEY: Record<string, Fact> = Object.fromEntries(FACTS.map(f => [f.key, f]))

