// Ready-made messages the office sends to tenants from Quick Notify (22 Oct 2026, Harry: "only tenant related
// messages … viewings coming up, communal standards, leave no trace, HMO licence application … received your report,
// awaiting landlord, contractor quoting / booked"). Tenant messages only — landlord and system emails live elsewhere.
//
// {house} and {address} fill themselves from the property; every other {key} is a field the sender fills in on screen.
// The email adds "Dear Ms Johnson," on its own, so messages start straight in. Renters' Rights wording throughout:
// no fixed terms or renewals, and at least 24 hours' written notice before anyone visits.

export type Purpose = 'compliance' | 'feedback' | 'guides' | 'hmo' | 'house' | 'maintenance' | 'other' | 'photography' | 'viewings'

// alphabetical, "Something else" last
export const PURPOSES: { key: Purpose; label: string; hint: string }[] = [
  { key: 'compliance', label: 'Compliance & safety', hint: 'Gas, electrics, fire alarms, inspections' },
  { key: 'feedback', label: 'Feedback', hint: 'Ask how we’re doing' },
  { key: 'guides', label: 'Guides', hint: 'Send a guide again' },
  { key: 'hmo', label: 'HMO licence', hint: 'Applications, council visits, licence granted' },
  { key: 'house', label: 'House standards', hint: 'Shared spaces, bins, noise, cleaning' },
  { key: 'maintenance', label: 'Maintenance updates', hint: 'Reports, quotes, bookings, works' },
  { key: 'photography', label: 'Photography', hint: 'Photos and video for listings' },
  { key: 'viewings', label: 'Viewings', hint: 'Viewings and new housemates' },
  { key: 'other', label: 'Something else', hint: 'Write your own or ask AI' },
]

export type FieldType = 'date' | 'time' | 'slot' | 'text' | 'longtext'
export interface Field { key: string; label: string; type: FieldType; placeholder?: string; default?: string }
export interface TenantMessage { id: string; purpose: Purpose; name: string; subject: string; body: string; fields: Field[]; link?: string }

export const SLOTS = [
  'between 8am and 11am', 'between 9am and 12pm', 'between 11am and 2pm', 'between 12pm and 3pm',
  'between 2pm and 5pm', 'between 3pm and 6pm', 'during the day (8am–6pm)',
]

const date = (key = 'date', label = 'Date'): Field => ({ key, label, type: 'date' })
const slot = (key = 'slot', label = 'Time'): Field => ({ key, label, type: 'slot', default: SLOTS[1] })
const issue: Field = { key: 'issue', label: 'The problem, in a few words', type: 'text', placeholder: 'the leaking kitchen tap' }

export const TENANT_MESSAGES: TenantMessage[] = [
  // ── compliance & safety ──
  { id: 'gas-safety', purpose: 'compliance', name: 'Gas safety check', subject: 'Gas safety check – {date}',
    body: 'Our Gas Safe engineer will visit {house} on {date} {slot} for the yearly gas safety check. It’s a legal check and takes about 45 minutes.\n\nThey’ll need to reach the boiler, the cooker and any gas fires, so please keep the boiler cupboard clear. You don’t need to be in – we’ll let them in with the management keys.\n\nIf the time doesn’t work for you, reply and we’ll rearrange.',
    fields: [date(), slot()] },
  { id: 'eicr', purpose: 'compliance', name: 'Electrical safety check (EICR)', subject: 'Electrical safety check – {date}',
    body: 'A qualified electrician will visit {house} on {date} {slot} for the electrical safety check (EICR), which the law asks for at least every five years.\n\nThe power will go off for short spells, so please save any work and don’t rely on anything charging. They’ll need to test the sockets and lights in every room, including bedrooms – they’ll be quick and respectful of your things.\n\nThis is your notice of the visit. If the time doesn’t work, reply and we’ll rearrange.',
    fields: [date(), slot()] },
  { id: 'fire-alarm-test', purpose: 'compliance', name: 'Fire alarm test', subject: 'Fire alarm test – {date}',
    body: 'We’ll be testing the fire alarms and emergency lighting at {house} on {date} {slot}. The alarms will sound for a few minutes at a time.\n\nYou don’t need to leave the house during the test – but if the alarm sounds at any other time, always get out.',
    fields: [date(), slot()] },
  { id: 'fire-drill', purpose: 'compliance', name: 'Fire safety drill', subject: 'Fire drill – {date} at {time}',
    body: 'We’re running a short fire drill at {house} on {date} at {time}.\n\nWhen the alarm sounds, please leave by the nearest safe exit, close the doors behind you and meet at {meeting_point}. It takes about ten minutes.\n\nTake a moment beforehand to check your way out – and please never wedge a fire door open.',
    fields: [date(), { key: 'time', label: 'Time', type: 'time' }, { key: 'meeting_point', label: 'Meeting point', type: 'text', default: 'the front of the house' }] },
  { id: 'smoke-alarms', purpose: 'compliance', name: 'Keep smoke alarms working', subject: 'Please keep the smoke alarms working',
    body: 'A quick safety reminder for everyone at {house}: please don’t cover the smoke and heat alarms, take their batteries out or unplug them – they’re a legal requirement and they could save your life.\n\nIf an alarm keeps beeping or doesn’t seem to work, report it in the app straight away and we’ll fix it.',
    fields: [] },
  { id: 'inspection', purpose: 'compliance', name: 'Routine inspection', subject: 'Routine visit to {house} – {date}',
    body: 'We’ll visit {house} on {date} {slot} for a routine check of the house. It helps us spot repairs early and keep the house in good order. This is your written notice of the visit (the law asks for at least 24 hours).\n\nYou don’t need to be in. If there’s anything you’d like us to look at, report it in the app before then.',
    fields: [date(), slot()] },

  // ── feedback ──
  { id: 'feedback', purpose: 'feedback', name: 'How are we doing?', subject: 'How are we doing at {house}?', link: '/tenant/feedback',
    body: 'We’d love to know how living at {house} is going. It takes two minutes: score each part of the house from 1 to 5 – your room, the kitchen, bathroom, cleaning, repairs, how we keep in touch – and tell us how it could be better.\n\nTap Open to fill it in. Your answers go to the office only, never to your housemates or the landlord.',
    fields: [] },

  // ── HMO licence ──
  { id: 'hmo-application', purpose: 'hmo', name: 'HMO licence application', subject: 'HMO licence application for {house}',
    body: 'We’re applying to {council_name} for an HMO licence for {house}, on or before {submit_by}. The landlord, {holder_name}, will hold the licence and Capital Rooms will carry on managing the house for them.\n\nYou don’t need to do anything. If you’d like to know more, ask us – or contact the council: {council_contact}.\n\nThe council may arrange to inspect the house as part of the application. We’ll always tell you beforehand.',
    fields: [{ key: 'council_name', label: 'Council', type: 'text' }, date('submit_by', 'Applying on or before'), { key: 'holder_name', label: 'Landlord (licence holder)', type: 'text' }, { key: 'council_contact', label: 'Council’s contact details', type: 'longtext' }] },
  { id: 'council-inspection', purpose: 'hmo', name: 'Council inspection', subject: 'Council visit to {house} – {date}',
    body: 'An officer from {council_name} will visit {house} on {date} {slot} as part of the HMO licence. We’ll be there with them.\n\nThey may ask to see each room, including bedrooms, to check room sizes and fire safety. Please make sure the hallways and fire doors are clear. This is your written notice of the visit.',
    fields: [{ key: 'council_name', label: 'Council', type: 'text' }, date(), slot()] },
  { id: 'hmo-granted', purpose: 'hmo', name: 'HMO licence granted', subject: 'The HMO licence for {house} has been granted',
    body: 'Good news: {council_name} has granted the HMO licence for {house} (licence {licence_number}, valid until {licence_expiry}).\n\nThe licence means the house has been checked against the council’s standards for room sizes, fire safety and facilities. You can ask us for a copy at any time.',
    fields: [{ key: 'council_name', label: 'Council', type: 'text' }, { key: 'licence_number', label: 'Licence number', type: 'text' }, date('licence_expiry', 'Valid until')] },

  // ── house standards ──
  { id: 'communal-standards', purpose: 'house', name: 'Shared spaces', subject: 'Keeping the shared spaces nice',
    body: 'A friendly reminder to everyone at {house}: please wash, dry and put away your dishes after each meal, wipe the hob and worktops, and take the rubbish and recycling out when the bin is full.\n\nThe kitchen, bathroom and living room are for everyone – thank you for helping keep them pleasant.',
    fields: [] },
  { id: 'leave-no-trace', purpose: 'house', name: 'Leave no trace', subject: 'Leave no trace',
    body: 'Please leave the kitchen, bathroom and living room at {house} the way you’d like to find them: no dishes in the sink, no food on the side and nothing of yours left behind.\n\nBelongings left in shared areas get in the way of the cleaners and your housemates. Thank you!',
    fields: [] },
  { id: 'bins', purpose: 'house', name: 'Bin day', subject: 'Bin day at {house} – {day}',
    body: 'Bins at {house} are collected on {day}. Please put them out the night before and bring them back in after collection.\n\nRubbish left beside the bins isn’t collected and attracts pests – if the bins are full, please let us know.',
    fields: [{ key: 'day', label: 'Collection day', type: 'text', placeholder: 'Thursday mornings' }] },
  { id: 'quiet-hours', purpose: 'house', name: 'Noise and quiet hours', subject: 'Keeping the noise down',
    body: 'Please keep noise down at {house} between 11pm and 7am – music, calls and guests. Sound carries in a shared house and your housemates may be up early for work.\n\nIf noise is a problem for you, tell us in the app (Housemate concern) and we’ll deal with it discreetly.',
    fields: [] },
  { id: 'cleaning-day', purpose: 'house', name: 'Cleaning day', subject: 'Cleaning day at {house}',
    body: 'Our cleaner visits {house} on {day}. Please clear the kitchen worktops, the sink and the bathroom beforehand so they can clean properly – anything left out makes the job harder.',
    fields: [{ key: 'day', label: 'Cleaning day', type: 'text', placeholder: 'Friday mornings' }] },
  { id: 'heating', purpose: 'house', name: 'Heating and ventilation', subject: 'Staying warm and keeping mould away',
    body: 'With the colder weather: keep the heating low and steady rather than on and off, and open the windows for a few minutes after showers and cooking. Run the extractor fans and keep the trickle vents open.\n\nIt stops condensation and mould – and if you do spot any mould, report it in the app straight away.',
    fields: [] },
  { id: 'get-the-app', purpose: 'house', name: 'Get the app on your phone', subject: 'Get updates straight to your phone',
    body: 'To get updates from us straight away, add the Capital Rooms app to your phone: open cros-sigma.vercel.app, sign in, then tap Share → Add to Home Screen (iPhone, in Safari) or ⋮ → Install app (Android, in Chrome). Allow notifications when it asks.\n\nIt’s where you report repairs, see visits booked at {house} and read the house guides.',
    fields: [] },

  // ── maintenance updates ──
  { id: 'report-landlord', purpose: 'maintenance', name: 'Report received – waiting on the landlord', subject: 'Update on your report: {issue}',
    body: 'Thanks for reporting {issue}. We’ve passed it to the landlord to approve the work and we’ll let you know as soon as we hear back.\n\nIf it gets worse in the meantime, tell us straight away in the app.',
    fields: [issue] },
  { id: 'quoting', purpose: 'maintenance', name: 'Getting quotes', subject: 'Update on your report: {issue}',
    body: 'Thanks for reporting {issue}. We’re getting quotes from contractors so it’s done properly at a fair price, and we’ll update you as soon as a visit is booked.',
    fields: [issue] },
  { id: 'booked', purpose: 'maintenance', name: 'Repair booked', subject: 'Repair booked – {date}',
    body: 'A contractor is booked to fix {issue} at {house} on {date} {slot}.\n\nYou don’t need to be in – we’ll arrange access with the management keys. If you’d rather be there, or the time doesn’t suit, reply and we’ll rearrange.',
    fields: [issue, date(), slot()] },
  { id: 'parts', purpose: 'maintenance', name: 'Parts on order', subject: 'Update on your report: {issue}',
    body: 'The part needed to fix {issue} is on order and should arrive by {date}. We’ll book the visit as soon as it does – sorry for the wait.',
    fields: [issue, date('date', 'Expected by')] },
  { id: 'works', purpose: 'maintenance', name: 'Works at the house', subject: 'Works at {house} from {start_date}',
    body: 'Works will take place at {house} from {start_date} to {end_date}: {details}.\n\nThere may be some noise and dust during working hours (8am–6pm). We’ll keep it as tidy as we can and tell you if anything changes.',
    fields: [date('start_date', 'From'), date('end_date', 'To'), { key: 'details', label: 'What’s being done', type: 'text', placeholder: 'the bathroom is being refitted' }] },
  { id: 'service-off', purpose: 'maintenance', name: 'Water, gas or power off', subject: 'The {service} will be off on {date}',
    body: 'The {service} at {house} will be off on {date} {slot} while {reason}. Please plan around it – sorry for the inconvenience.',
    fields: [{ key: 'service', label: 'What will be off', type: 'text', default: 'water' }, date(), slot(), { key: 'reason', label: 'Why', type: 'text', placeholder: 'a plumber replaces the stopcock' }] },
  { id: 'pest-control', purpose: 'maintenance', name: 'Pest control visit', subject: 'Pest control visit – {date}',
    body: 'A pest control technician will visit {house} on {date} {slot}. Please clear food from the worktops and floors and keep it in sealed containers – it makes the treatment work much better.\n\nThey may need to check bedrooms too. This is your written notice of the visit.',
    fields: [date(), slot()] },

  // ── photography ──
  { id: 'photographer', purpose: 'photography', name: 'Photographer visiting', subject: 'Photographer at {house} – {date}',
    body: 'A photographer will visit {house} on {date} {slot} to take photos for our listings. They’ll photograph the shared areas and any empty rooms only – never your room or your things without asking you first.\n\nIt would really help if the kitchen and living room were tidy, with anything personal put away.',
    fields: [date(), slot()] },
  { id: 'room-photos', purpose: 'photography', name: 'Photos of your room (asking first)', subject: 'Could we photograph your room?',
    body: 'As you’ll be moving on, we’d like to take a few photos of your room at {house} for the listing, on {date} {slot}. It’s entirely up to you – reply yes or no.\n\nIf yes, a tidy room with personal things put away is perfect, and we won’t photograph anything personal.',
    fields: [date(), slot()] },

  // ── viewings ──
  { id: 'viewings-start', purpose: 'viewings', name: 'Viewings starting soon – how the house should look', subject: 'Viewings at {house} start {date}',
    body: 'We’ll start showing {room} at {house} to people looking for a home from {date}. The people who view are choosing who they’ll live with – a clean, tidy house attracts clean, tidy housemates.\n\nHow we’d like each shared area to look:\n• Kitchen – worktops and hob wiped, sink empty, no dishes or food left out, bins not overflowing\n• Bathroom – wiped down, no toiletries or towels left on the floor, toilet clean\n• Hallway and stairs – clear of shoes, bags, bikes and post\n• Living room – tidy, nothing personal left behind\n\nPlease follow our leave-no-trace rule: once you’ve used a shared space, leave it as you found it. We’ll be asking everyone to confirm they’re keeping to this. Thank you!',
    fields: [{ key: 'room', label: 'Which room', type: 'text', placeholder: 'Room 3' }, date('date', 'Viewings start')] },
  { id: 'viewings-soon', purpose: 'viewings', name: 'Viewings coming up', subject: 'Viewings at {house} – {date}',
    body: 'We’ll be showing {room} at {house} to people looking for a home on {date} {slot}. One of us will be with them the whole time.\n\nA tidy kitchen and hallway really help – thank you.',
    fields: [{ key: 'room', label: 'Which room', type: 'text', placeholder: 'Room 3' }, date(), slot()] },
  { id: 'viewing-late', purpose: 'viewings', name: 'Running late for a viewing', subject: 'Viewing running late – now {time}',
    body: 'Just to let you know, today’s viewing of {room} at {house} is running late – we now expect to arrive at about {time}. Sorry for the change.',
    fields: [{ key: 'room', label: 'Which room', type: 'text', placeholder: 'Room 3' }, { key: 'time', label: 'New time', type: 'time' }] },
  { id: 'new-housemate', purpose: 'viewings', name: 'A new housemate is moving in', subject: 'A new housemate is moving in',
    body: '{room} at {house} has been let and your new housemate moves in on {date}. Please make them welcome!\n\nThey’ll be able to say hello in the app under Meet your housemates.',
    fields: [{ key: 'room', label: 'Which room', type: 'text', placeholder: 'Room 3' }, date('date', 'Moving in')] },
]

/** Words in curly brackets still waiting to be filled in. */
export const unfilled = (text: string) => [...new Set([...text.matchAll(/\{([a-z_]+)\}/g)].map(m => m[1]))]

/** "Tuesday 27 October" from YYYY-MM-DD; "2:30pm" from HH:MM; anything else as typed. */
export function fieldText(f: Field, raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  if (f.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v))
    return new Date(`${v}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  if (f.type === 'time' && /^\d{2}:\d{2}$/.test(v)) {
    const [h, m] = v.split(':').map(Number)
    return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
  }
  return v
}

/** The message with the house and every filled field put in; unfilled ones stay as {key}. */
export function fillMessage(text: string, msg: TenantMessage | null, values: Record<string, string>, house: { name: string; address: string }): string {
  let out = text.split('{house}').join(house.name).split('{address}').join(house.address)
  for (const f of msg?.fields ?? []) {
    const v = fieldText(f, values[f.key] ?? f.default ?? '')
    if (v) out = out.split(`{${f.key}}`).join(v)
  }
  return out
}
