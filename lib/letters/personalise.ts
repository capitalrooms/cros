// One letter, many landlords (4 Nov 2026): how the shared wording becomes each landlord's own copy, and the check that
// stops one landlord's name going to everyone. Used by /admin/document-generator/landlords; tested in
// scripts/test-personalise.mts against the real landlord list.
export interface Recipient { name: string; dear: string }

// a generic greeting left in by drafting — "Dear Sir or Madam", "Dear Landlord" — or the {name}/{dear} fields
const GENERIC = /\bDear\s+(Sir\s*(\/|or)\s*Madam|Sir|Madam|Landlord|Landlords|Client|Valued\s+Client|the\s+landlord|\{name\}|\{dear\})\s*,?/gi

/** {name} → their name as on the letter; {dear} → their greeting name; a generic "Dear …" → "Dear <them>," */
export const fill = (t: string, r: Recipient) => t.replace(GENERIC, `Dear ${r.dear},`).replace(/\{name\}/g, r.name).replace(/\{dear\}/g, r.dear)

/** The letter body: its own greeting is printed above it, so a greeting line at the very top is dropped. */
export const bodyFor = (body: string, r: Recipient) => fill(body.replace(/^\s*(Dear|Hi|Hello)\b[^\n]*\n+/i, ''), r)

/** The covering email always opens "Dear <them>,". */
export function messageFor(message: string, subject: string, r: Recipient) {
  const m = fill(message || `Dear {dear},\n\nPlease find attached a letter from Capital Rooms: ${subject}.\n\nKind regards,\nCapital Rooms`, r)
  return /^\s*(Dear|Hi|Hello)\b/i.test(m) ? m : `Dear ${r.dear},\n\n${m.trimStart()}`
}

const STOP = new Set(['Mr', 'Mrs', 'Miss', 'Ms', 'Mx', 'Dr', 'Prof', 'Ltd', 'Limited', 'Property', 'Properties', 'Holding', 'Holdings', 'Services', 'Group', 'and', 'The'])
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Words from a chosen landlord's own name found in the shared wording — each would go to every landlord. */
export function nameLeaks(shared: string, chosen: Recipient[]): { who: string; word: string }[] {
  return chosen.flatMap(r => [...new Set(`${r.name} ${r.dear}`.split(/[\s&,.]+/).filter(w => w.length >= 3 && !STOP.has(w)))]
    .filter(w => new RegExp(`\\b${esc(w)}\\b`).test(shared)).map(w => ({ who: r.name, word: w })))
}
