// Making Tax Digital for Income Tax — quarterly figures per landlord (compulsory from April 2026 for landlords with
// over £50,000 of qualifying income). Built from every landlord statement (the previous agent's and CROS's) by
// statement date — property income is on the cash basis by default. Expenses are sorted into HMRC's UK property
// categories; these are suggestions for the landlord's accountant to confirm, not tax advice.
import type { SupabaseClient } from '@supabase/supabase-js'
import { dropDemo } from '@/lib/demoProperties'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const HMRC_BOXES = {
  premisesRunningCosts: 'Rent, rates, insurance, ground rents',
  repairsAndMaintenance: 'Property repairs and maintenance',
  costOfServices: 'Cost of services provided (cleaning, utilities, gardening)',
  professionalFees: 'Legal, management and other professional fees',
  other: 'Other allowable property expenses (incl. replacement furniture — check domestic items relief)',
} as const
export type HmrcBox = keyof typeof HMRC_BOXES

const BOX: Record<string, HmrcBox> = {
  insurance: 'premisesRunningCosts', council_tax: 'premisesRunningCosts', hmo_licence: 'premisesRunningCosts', water_bill: 'premisesRunningCosts',
  tv_licensing: 'premisesRunningCosts', appliance_cover: 'premisesRunningCosts',
  roof_exterior: 'repairsAndMaintenance', boiler_heating: 'repairsAndMaintenance', plumbing: 'repairsAndMaintenance', electrical: 'repairsAndMaintenance',
  decorating: 'repairsAndMaintenance', maintenance_repair: 'repairsAndMaintenance', room_maintenance: 'repairsAndMaintenance', room_decorating: 'repairsAndMaintenance',
  pest_control: 'repairsAndMaintenance', security: 'repairsAndMaintenance', communal_areas: 'repairsAndMaintenance', fire_safety: 'repairsAndMaintenance',
  appliances_property: 'repairsAndMaintenance',
  cleaning: 'costOfServices', broadband: 'costOfServices', utility_bill: 'costOfServices', garden_outdoor: 'costOfServices', communal_kitchen: 'costOfServices',
  management_fee: 'professionalFees', letting_fee: 'professionalFees', legal_professional: 'professionalFees', compliance_certs: 'professionalFees',
}
export const boxFor = (category: string | null | undefined): HmrcBox => BOX[String(category || '')] ?? 'other'

/** The four standard MTD quarters of a tax year starting 6 April `year`. */
export function mtdQuarters(year: number) {
  return [
    { label: 'Q1', from: `${year}-04-06`, to: `${year}-07-05` },
    { label: 'Q2', from: `${year}-07-06`, to: `${year}-10-05` },
    { label: 'Q3', from: `${year}-10-06`, to: `${year + 1}-01-05` },
    { label: 'Q4', from: `${year + 1}-01-06`, to: `${year + 1}-04-05` },
  ]
}

export interface MtdRow {
  landlordId: string; landlord: string; quarter: string; from: string; to: string
  income: number; boxes: Record<HmrcBox, number>; totalExpenses: number; profit: number; statements: string[]
}

export async function mtdFigures(s: SupabaseClient, year: number, landlordId?: string | null): Promise<MtdRow[]> {
  const qs = mtdQuarters(year)
  let q = s.from('landlord_statements').select('*').gte('statement_date', qs[0].from).lte('statement_date', qs[3].to)
  if (landlordId) q = q.eq('landlord_id', landlordId)
  const { data: stsAll, error } = await q
  if (error) throw new Error(error.message)
  const sts = await dropDemo(s, stsAll as any[], (x: any) => x.property_id)   // practice statements never reach HMRC figures
  const ids = [...new Set(((sts ?? []) as any[]).map(x => x.landlord_id).filter(Boolean))]
  const { data: people } = ids.length ? await s.from('people').select('id, first_name, last_name, full_name, company').in('id', ids) : { data: [] as any[] }
  const nameOf = new Map(((people ?? []) as any[]).map(p => [p.id, p.company || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || 'Landlord']))

  const rows = new Map<string, MtdRow>()
  for (const st of (sts ?? []) as any[]) {
    const qt = qs.find(x => st.statement_date >= x.from && st.statement_date <= x.to)
    if (!qt || !st.landlord_id) continue
    const key = `${st.landlord_id}|${qt.label}`
    const row: MtdRow = rows.get(key) ?? { landlordId: st.landlord_id, landlord: nameOf.get(st.landlord_id) ?? 'Landlord', quarter: qt.label, from: qt.from, to: qt.to,
      income: 0, boxes: { premisesRunningCosts: 0, repairsAndMaintenance: 0, costOfServices: 0, professionalFees: 0, other: 0 }, totalExpenses: 0, profit: 0, statements: [] }
    row.income = r2(row.income + Number(st.gross_rent || 0))
    row.boxes.professionalFees = r2(row.boxes.professionalFees + Number(st.management_fees || 0) + Number(st.letting_fees || 0))
    const lines: any[] = Array.isArray(st.expenses) ? st.expenses : []
    const lineTotal = r2(lines.reduce((t, e) => t + Number(e.amount || 0), 0))
    for (const e of lines) row.boxes[boxFor(e.category)] = r2(row.boxes[boxFor(e.category)] + Number(e.amount || 0))
    // a statement whose expense total isn't itemised: the rest goes to "other"
    const rest = r2(Number(st.property_charges || 0) - lineTotal)
    if (rest > 0.004) row.boxes.other = r2(row.boxes.other + rest)
    row.statements.push(st.statement_reference)
    rows.set(key, row)
  }
  for (const r of rows.values()) {
    r.totalExpenses = r2(Object.values(r.boxes).reduce((t, v) => t + v, 0))
    r.profit = r2(r.income - r.totalExpenses)
  }
  return [...rows.values()].sort((a, b) => a.landlord.localeCompare(b.landlord) || a.quarter.localeCompare(b.quarter))
}
