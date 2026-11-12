// Official local rents (12 Nov 2026) — the ONS Price Index of Private Rents (PIPR), monthly: the average rent for every
// local authority, by bedrooms and property type, and the change on a year ago. Whole homes, not rooms. Source:
// ons.gov.uk, "Price Index of Private Rents, UK: monthly price statistics" — official statistics in development, Crown
// copyright (Open Government Licence). refreshOnsRents reads the newest release's workbook and keeps the latest month
// per area (table ons_rents, migration 280); localRents finds a house's borough from its postcode (postcodes.io).
// Server-only.
import type { SupabaseClient } from '@supabase/supabase-js'
import JSZip from 'jszip'

const ONS = 'https://www.ons.gov.uk'
const DATASET = '/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics'
const UA = { 'User-Agent': 'CapitalRooms-CROS/1.0 (lettings software)' }
export const ONS_SOURCE = 'ONS Price Index of Private Rents (official statistics in development)'

export interface LocalRents {
  areaCode: string; areaName: string; region: string | null; period: string
  all: number | null; one: number | null; two: number | null; three: number | null; fourPlus: number | null
  flat: number | null; terraced: number | null
  changeAll: number | null; changeOne: number | null; changeTwo: number | null; changeThree: number | null; changeFour: number | null
}

const COLS: Record<string, string> = {
  'Rental price': 'rent_all', 'Rental price one bed': 'rent_1', 'Rental price two bed': 'rent_2', 'Rental price three bed': 'rent_3', 'Rental price four or more bed': 'rent_4',
  'Rental price flat maisonette': 'rent_flat', 'Rental price terraced': 'rent_terraced', 'Rental price semidetached': 'rent_semi', 'Rental price detached': 'rent_detached',
  'Annual change': 'change_all', 'Annual change one bed': 'change_1', 'Annual change two bed': 'change_2', 'Annual change three bed': 'change_3', 'Annual change four or more bed': 'change_4',
}
const colIndex = (ref: string) => { const l = ref.replace(/\d+/g, ''); let n = 0; for (const ch of l) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1 }
const excelDate = (n: number) => new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10)
const unxml = (t: string) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")

/** The newest release's address and workbook link. */
async function latestRelease(): Promise<{ uri: string; file: string }> {
  const list = await fetch(`${ONS}${DATASET}/data`, { headers: UA }).then(r => r.json())
  const uri = list?.datasets?.[0]?.uri
  if (!uri) throw new Error('ONS: no release found')
  const rel = await fetch(`${ONS}${uri}/data`, { headers: UA }).then(r => r.json())
  const file = rel?.downloads?.find((d: any) => /\.xlsx$/i.test(d.file))?.file
  if (!file) throw new Error('ONS: no workbook in the release')
  return { uri, file: `${ONS}/file?uri=${uri}/${file}` }
}

/** Read the workbook: the latest month for every area. */
export async function parseWorkbook(buf: ArrayBuffer): Promise<Record<string, any>[]> {
  const zip = await JSZip.loadAsync(buf)
  const shared = [...((await zip.file('xl/sharedStrings.xml')?.async('string')) ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')))
  // the data sheet is "Table 1"
  const wb = (await zip.file('xl/workbook.xml')!.async('string'))
  const rid = wb.match(/<sheet name="Table 1"[^>]*r:id="([^"]+)"/)?.[1]
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
  const target = rels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] ?? rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`))?.[1]
  const xml = await zip.file(`xl/${String(target).replace(/^\/?xl\//, '')}`)!.async('string')
  let header: string[] | null = null
  const latest = new Map<string, Record<string, any>>()
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g
  const cellRe = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(xml))) {
    const cells: (string | number | null)[] = []
    let c: RegExpExecArray | null
    cellRe.lastIndex = 0
    while ((c = cellRe.exec(m[1]))) {
      const i = colIndex(c[1]); const t = c[2].match(/ t="(\w+)"/)?.[1] ?? ''
      const inner = c[3] ?? ''
      const raw = inner.match(/<v>([^<]*)<\/v>/)?.[1] ?? inner.match(/<t[^>]*>([^<]*)<\/t>/)?.[1] ?? null
      cells[i] = raw == null ? null : t === 's' ? shared[Number(raw)] : t === 'inlineStr' || t === 'str' ? unxml(raw) : Number(raw)
    }
    if (!header) { if (cells[0] === 'Time period') header = cells.map(x => String(x ?? '')); continue }
    const code = String(cells[1] ?? ''), when = cells[0]
    if (!code || typeof when !== 'number') continue
    const prev = latest.get(code)
    if (prev && prev._when >= when) continue
    const row: Record<string, any> = { _when: when, area_code: code, area_name: String(cells[2] ?? ''), region: cells[3] && !/^\[/.test(String(cells[3])) ? String(cells[3]) : null, period: excelDate(when) }
    header.forEach((h, i) => { const k = COLS[h]; if (k) { const v = cells[i]; row[k] = typeof v === 'number' ? (k.startsWith('rent') ? Math.round(v) : Math.round(v * 10) / 10) : null } })
    latest.set(code, row)
  }
  return [...latest.values()].map(({ _when, ...r }) => r)
}

/** Fetch the newest release if it's new to us. Returns what happened, in words. */
export async function refreshOnsRents(s: SupabaseClient, force = false): Promise<string> {
  const rel = await latestRelease()
  if (!force) {
    const { data } = await s.from('ons_rents').select('release').limit(1).maybeSingle() as { data: any }
    if (data?.release === rel.uri) return `Already up to date (${rel.uri.split('/').pop()})`
  }
  const res = await fetch(rel.file, { headers: UA })
  if (!res.ok) throw new Error(`ONS workbook: ${res.status}`)
  const rows = (await parseWorkbook(await res.arrayBuffer())).map(r => ({ ...r, release: rel.uri, updated_at: new Date().toISOString() }))
  if (rows.length < 100) throw new Error(`ONS workbook read only ${rows.length} areas — the layout may have changed`)
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await s.from('ons_rents').upsert(rows.slice(i, i + 200), { onConflict: 'area_code' })
    if (error) throw new Error(error.message)
  }
  return `Loaded ${rows.length} areas for ${(rows[0] as any).period} (${rel.uri.split('/').pop()})`
}

/** A house's borough rents, from its postcode. */
export async function localRents(s: SupabaseClient, postcode: string | null | undefined): Promise<LocalRents | null> {
  const pc = String(postcode ?? '').trim()
  if (!pc) return null
  const look = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`).then(r => r.ok ? r.json() : null).catch(() => null)
  const code = look?.result?.codes?.admin_district
  if (!code) return null
  const { data: r } = await s.from('ons_rents').select('*').eq('area_code', code).maybeSingle() as { data: any }
  if (!r) return null
  return { areaCode: r.area_code, areaName: r.area_name, region: r.region, period: r.period, all: r.rent_all, one: r.rent_1, two: r.rent_2, three: r.rent_3, fourPlus: r.rent_4,
    flat: r.rent_flat, terraced: r.rent_terraced, changeAll: r.change_all, changeOne: r.change_1, changeTwo: r.change_2, changeThree: r.change_3, changeFour: r.change_4 }
}
