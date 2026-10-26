// The jobs a cleaner does now and then on top of the usual clean (26 Oct 2026, Harry: "when was the oven last cleaned…
// if she completes a clean maybe she could tick if any other cleaning jobs were done… clean behind fridges, clean
// windows, clean inside kitchen cupboards, clean inside bathroom cupboards"). Ticked when a clean is finished and saved
// on that clean (cleans.special_jobs, by label), so each house's record — when each was last done, and what's due —
// is worked out from its finished cleans. No separate table to keep in step.
// `weeks`: how often it's worth doing in a shared house; after that it shows as due.

export type DeepTask = { label: string; area: Area; weeks: number; aka?: string[] }
export type Area = 'Kitchen' | 'Bathrooms' | 'Whole house' | 'Outside'
export const AREAS: Area[] = ['Kitchen', 'Bathrooms', 'Whole house', 'Outside']

export const DEEP_TASKS: DeepTask[] = [
  { label: 'Cleaned oven', area: 'Kitchen', weeks: 12 },
  { label: 'Cleaned hob and extractor hood filter', area: 'Kitchen', weeks: 8 },
  { label: 'Cleaned inside fridge', area: 'Kitchen', weeks: 4 },
  { label: 'Defrosted freezer', area: 'Kitchen', weeks: 26 },
  { label: 'Cleaned microwave inside', area: 'Kitchen', weeks: 4 },
  { label: 'Cleaned inside kitchen cupboards', area: 'Kitchen', weeks: 12, aka: ['Cleaned inside cupboards'] },
  { label: 'Cleaned behind fridge and cooker', area: 'Kitchen', weeks: 26, aka: ['Cleaned behind appliances'] },
  { label: 'Cleaned washing machine drawer and seal', area: 'Kitchen', weeks: 8 },
  { label: 'Descaled kettle', area: 'Kitchen', weeks: 8 },
  { label: 'Degreased kitchen tiles and splashback', area: 'Kitchen', weeks: 8 },
  { label: 'Descaled shower head', area: 'Bathrooms', weeks: 8 },
  { label: 'Descaled taps and shower screen', area: 'Bathrooms', weeks: 4 },
  { label: 'Cleaned inside bathroom cupboards', area: 'Bathrooms', weeks: 12 },
  { label: 'Cleaned grout and treated mould', area: 'Bathrooms', weeks: 12 },
  { label: 'Cleaned extractor fan covers', area: 'Bathrooms', weeks: 12 },
  { label: 'Cleaned internal windows and sills', area: 'Whole house', weeks: 12 },
  { label: 'Cleaned external windows', area: 'Whole house', weeks: 12 },
  { label: 'Dusted skirting boards', area: 'Whole house', weeks: 8 },
  { label: 'Wiped doors, frames and light switches', area: 'Whole house', weeks: 8 },
  { label: 'Dusted light fittings and lampshades', area: 'Whole house', weeks: 12 },
  { label: 'Cleaned radiators', area: 'Whole house', weeks: 12 },
  { label: 'Vacuumed under sofas and furniture', area: 'Whole house', weeks: 8 },
  { label: 'Washed curtains or wiped blinds', area: 'Whole house', weeks: 26 },
  { label: 'Spot-cleaned carpets and stairs', area: 'Whole house', weeks: 12 },
  { label: 'Swept front yard', area: 'Outside', weeks: 4 },
  { label: 'Cleared back yard or garden of litter', area: 'Outside', weeks: 4 },
  { label: 'Washed bins out', area: 'Outside', weeks: 8 },
]

const OTHER = 'Other: '
/** A free-text extra the cleaner typed is saved as "Other: …". */
export const otherJob = (text: string) => `${OTHER}${text.trim().slice(0, 120)}`
export const isOther = (job: string) => job.startsWith(OTHER)

/** The list's own label for a saved job (older cleans used a few different words). */
export function taskFor(job: string): DeepTask | null {
  return DEEP_TASKS.find(t => t.label === job || t.aka?.includes(job)) ?? null
}

export type DeepStatus = 'due' | 'soon' | 'ok' | 'never'
export type DeepRow = DeepTask & { last: string | null; status: DeepStatus; weeksSince: number | null }

/** Each job's last date at the house and whether it's due, from the house's finished cleans. */
export function deepRecord(cleans: { clean_date?: string | null; completed_at?: string | null; status?: string | null; special_jobs?: string[] | null }[], today = new Date()) {
  const last = new Map<string, string>()
  const others: { job: string; date: string }[] = []
  for (const c of cleans) {
    if (c.status !== 'completed') continue
    const date = (c.completed_at ?? c.clean_date ?? '').slice(0, 10)
    if (!date) continue
    for (const job of c.special_jobs ?? []) {
      if (isOther(job)) { others.push({ job: job.slice(OTHER.length), date }); continue }
      const t = taskFor(job)
      if (t && (!last.has(t.label) || last.get(t.label)! < date)) last.set(t.label, date)
    }
  }
  const rows: DeepRow[] = DEEP_TASKS.map(t => {
    const d = last.get(t.label) ?? null
    if (!d) return { ...t, last: null, status: 'never', weeksSince: null }
    const weeksSince = Math.floor((today.getTime() - new Date(`${d}T12:00:00Z`).getTime()) / (7 * 86_400_000))
    return { ...t, last: d, weeksSince, status: weeksSince >= t.weeks ? 'due' : weeksSince >= t.weeks - 2 ? 'soon' : 'ok' }
  })
  return { rows, others: others.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10) }
}

/** "the oven, the inside of the fridge and the windows" — for the tenants' "clean finished" email. */
export function extrasLine(jobs: string[]): string {
  const words = jobs.filter(j => !isOther(j)).map(j => (taskFor(j)?.label ?? j).replace(/^(Cleaned|Descaled|Dusted|Washed|Wiped|Defrosted|Degreased|Vacuumed|Swept|Spot-cleaned|Cleared) /, (m) => m.toLowerCase()))
  if (!words.length) return ''
  return words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}
