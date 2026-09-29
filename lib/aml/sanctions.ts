// Screening against the official UK Sanctions List (FCDO), the single UK source of designations
// since 28 Jan 2026. The ~50 MB CSV is refreshed into a compact index in storage by a daily cron;
// screening reads the index.
import { svc } from '@/lib/landlordOnboarding/store'

const LIST_URL = 'https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv'
const BUCKET = 'aml-data'
const INDEX_PATH = 'uk-sanctions-index.json'

export interface SanctionsEntry { id: string; name: string; type: string; dob: string; nationality: string; regime: string }
export interface SanctionsIndex { reportDate: string; refreshedAt: string; entries: SanctionsEntry[] }
export interface ScreeningMatch { entry: SanctionsEntry; strength: 'strong' | 'possible' }
export interface ScreeningResult { name: string; dob?: string; listDate: string; matches: ScreeningMatch[] }

// RFC 4180 CSV parsing (quoted fields may contain commas and newlines).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

export async function refreshSanctionsIndex(): Promise<{ reportDate: string; entries: number }> {
  const res = await fetch(LIST_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sanctions list download failed (${res.status})`)
  const text = await res.text()
  const firstLine = text.slice(0, text.indexOf('\n'))
  const reportDate = (firstLine.match(/Report Date:\s*([^,\r\n]+)/)?.[1] ?? '').trim()
  const rows = parseCsv(text.slice(text.indexOf('\n') + 1))
  const header = rows[0]
  const col = (n: string) => header.indexOf(n)
  const C = {
    id: col('Unique ID'), n6: col('Name 6'), n1: col('Name 1'), n2: col('Name 2'), n3: col('Name 3'), n4: col('Name 4'), n5: col('Name 5'),
    type: col('Designation Type'), dob: col('D.O.B'), nat: col('Nationality(/ies)'), regime: col('Regime Name'),
  }
  const entries: SanctionsEntry[] = []
  for (const r of rows.slice(1)) {
    if (r.length < header.length / 2) continue
    const type = r[C.type] ?? ''
    if (type !== 'Individual' && type !== 'Entity') continue
    const given = [C.n1, C.n2, C.n3, C.n4, C.n5].map(i => r[i]).filter(Boolean).join(' ')
    const name = type === 'Individual' ? [given, r[C.n6]].filter(Boolean).join(' ') : [r[C.n6], given].filter(Boolean).join(' ')
    if (!name.trim()) continue
    entries.push({ id: r[C.id], name: name.trim(), type, dob: r[C.dob] ?? '', nationality: r[C.nat] ?? '', regime: r[C.regime] ?? '' })
  }
  const index: SanctionsIndex = { reportDate, refreshedAt: new Date().toISOString(), entries }
  await svc().storage.createBucket(BUCKET, { public: false }).catch(() => {})
  const { error } = await svc().storage.from(BUCKET)
    .upload(INDEX_PATH, Buffer.from(JSON.stringify(index)), { contentType: 'application/json', upsert: true })
  if (error) throw new Error(`Could not store sanctions index: ${error.message}`)
  cached = { index, at: Date.now() }
  return { reportDate, entries: entries.length }
}

let cached: { index: SanctionsIndex; at: number } | null = null

export async function loadSanctionsIndex(): Promise<SanctionsIndex | null> {
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.index
  const { data } = await svc().storage.from(BUCKET).download(INDEX_PATH)
  if (!data) return null
  const index = JSON.parse(await data.text()) as SanctionsIndex
  cached = { index, at: Date.now() }
  return index
}

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/-/g, ' ').split(/\s+/).filter(t => t.length > 1)

function close(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false
  let i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

// DOBs in the list are "dd/mm/yyyy" and may use 00 for unknown parts.
function dobMatches(listDob: string, isoDob: string): boolean | null {
  if (!listDob || !isoDob) return null
  const [y, m, d] = isoDob.split('-')
  return listDob.split('|').map(s => s.trim()).some(ld => {
    const [dd, mm, yyyy] = ld.split('/')
    return yyyy === y && (mm === '00' || mm === m) && (dd === '00' || dd === d)
  })
}

/**
 * Name screening. "strong": every token of the listed name matches the searched name (one-letter
 * slips allowed) and, where both have a DOB, it agrees. "possible": surname and first name match
 * but other names or the DOB are missing. Every match must be reviewed by a person.
 */
export async function screenName(name: string, isoDob?: string): Promise<ScreeningResult> {
  const index = await loadSanctionsIndex()
  if (!index) throw new Error('Sanctions list not yet downloaded')
  const q = norm(name)
  const matches: ScreeningMatch[] = []
  const seen = new Set<string>()
  if (q.length) {
    for (const e of index.entries) {
      const t = norm(e.name)
      if (!t.length || (t.length < 2 && e.type === 'Individual') || t.every(x => x.length < 3)) continue
      const allListed = t.every(x => q.some(y => close(x, y)))
      const firstLast = t.length >= 2 && close(t[0], q[0]) && close(t[t.length - 1], q[q.length - 1])
      if (!allListed && !firstLast) continue
      const dob = e.type === 'Individual' && isoDob ? dobMatches(e.dob, isoDob) : null
      if (dob === false) continue
      const strength = allListed && t.length >= 2 ? 'strong' : 'possible'
      const key = `${e.id}:${strength}`
      if (seen.has(key)) continue
      seen.add(key)
      matches.push({ entry: e, strength })
    }
  }
  return { name, dob: isoDob, listDate: index.reportDate, matches: matches.slice(0, 10) }
}
