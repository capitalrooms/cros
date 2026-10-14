// What a landlord sees in their app (14 Oct 2026, Harry: "Only I can click and add parts on his profile as and when I
// want him to see more functions"). Stored in people.access_areas — the same column as office access levels, which
// the database lets only an administrator change (migration 216), so a landlord can never switch parts on themselves.
// Set on the landlord's profile in the office app (components/admin/LandlordAppAccess).

export const LANDLORD_SECTIONS = [
  { key: 'planner', label: 'Shared planner', hint: 'A board you both add to and edit — notes, jobs, photos and links' },
  { key: 'statements', label: 'Statements & money', hint: 'Monthly statements, rent, fees and portfolio totals' },
  { key: 'notifications', label: 'Notification settings', hint: 'Lets them choose which updates they receive' },
] as const

export type LandlordSection = typeof LANDLORD_SECTIONS[number]['key']
const KEYS = LANDLORD_SECTIONS.map(s => s.key) as readonly string[]

/** Landlords set up before this (access_areas empty) keep what they always had: statements and notification
 *  settings, plus the planner when the office has opened a board with them. A chosen list means exactly that list. */
export function landlordSections(areas: string[] | null | undefined, hasBoard = false): LandlordSection[] {
  if (!Array.isArray(areas)) return (['statements', 'notifications', ...(hasBoard ? ['planner'] : [])] as LandlordSection[])
  return areas.filter(a => KEYS.includes(a)) as LandlordSection[]
}

export const cleanLandlordSections = (v: unknown): LandlordSection[] =>
  (Array.isArray(v) ? v : []).filter((k): k is LandlordSection => typeof k === 'string' && KEYS.includes(k))
