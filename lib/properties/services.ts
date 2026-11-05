// Bills & services on a property (migration 264). Server only.
//   servicesFor   — the accounts at a house, each with what's actually been paid (expenses logged in CROS and lines on
//                   statements, matched by type), plus suggestions: costs that keep coming up with no account recorded,
//                   and internet details already written in the house information
//   syncHouseInfo — the one place tenants' WiFi details come from: the internet account writes the WiFi item in the
//                   house information (network, password, supplier and its fault line) — no second copy to keep up
import type { SupabaseClient } from '@supabase/supabase-js'

export type ServiceKind = 'internet' | 'energy' | 'gas' | 'electricity' | 'water' | 'council_tax' | 'tv_licence' | 'appliance_cover' | 'cleaning' | 'gardening' | 'insurance' | 'other'
export const SERVICE_KINDS: { key: ServiceKind; label: string; categories: string[] }[] = [
  { key: 'internet', label: 'Internet', categories: ['broadband'] },
  { key: 'energy', label: 'Gas & electricity', categories: ['utility_bill'] },
  { key: 'gas', label: 'Gas', categories: [] },
  { key: 'electricity', label: 'Electricity', categories: [] },
  { key: 'water', label: 'Water', categories: ['water_bill'] },
  { key: 'council_tax', label: 'Council tax', categories: ['council_tax'] },
  { key: 'tv_licence', label: 'TV licence', categories: ['tv_licensing'] },
  { key: 'appliance_cover', label: 'Appliance cover', categories: ['appliance_cover'] },
  { key: 'cleaning', label: 'Cleaning', categories: ['cleaning'] },
  { key: 'gardening', label: 'Gardening', categories: ['garden_outdoor'] },
  { key: 'insurance', label: 'Insurance', categories: ['insurance'] },
  { key: 'other', label: 'Other', categories: [] },
]
export const WHO_PAYS: { key: string; label: string }[] = [
  { key: 'we_recharge', label: 'We pay — recharged to the landlord' },
  { key: 'landlord', label: 'The landlord pays direct' },
  { key: 'tenants', label: 'The tenants pay' },
  { key: 'included', label: 'Included in the rent (we pay, not recharged)' },
]
export const kindLabel = (k: string) => SERVICE_KINDS.find(x => x.key === k)?.label ?? 'Other'
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
// the usual charge — the middle one — so a catch-up bill (e.g. five months of broadband at once) doesn't skew "a month"
const typical = (xs: number[]) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); return r2(a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) }

export interface Payment { date: string; amount: number; description: string; supplier: string | null; ref: string | null }
export interface ServiceView {
  id: string; kind: ServiceKind; supplier: string | null; account_number: string | null; account_holder: string | null; login_email: string | null
  support_phone: string | null; who_pays: string; payment_method: string | null; monthly_cost: number | null; contract_start: string | null; contract_end: string | null
  meter_refs: string | null; wifi_network: string | null; wifi_password: string | null; notes: string | null; ended_at: string | null; updated_at: string
  paid: { last12: number; count12: number; perMonth: number | null; last: Payment | null; payments: Payment[] }
  contractEndsSoon: boolean
}
export interface Suggestion { kind: ServiceKind; why: string; perMonth: number | null; supplier: string | null; wifi?: { network: string | null; password: string | null; phone: string | null } }

/** Every charge to this property, with its type: CROS expenses, and lines on statements (imported or prepared). */
async function charges(s: SupabaseClient, propertyId: string): Promise<(Payment & { category: string | null })[]> {
  const [{ data: ex }, { data: sts }] = await Promise.all([
    s.from('recharge_expenses').select('expense_date, amount, description, supplier, category, txn_no, voided_at').eq('property_id', propertyId),
    s.from('landlord_statements').select('id, period_start, statement_date, statement_reference, expenses').eq('property_id', propertyId),
  ])
  const out: (Payment & { category: string | null })[] = []
  const seen = new Set<string>()
  for (const e of (ex ?? []) as any[]) if (!e.voided_at) {
    out.push({ date: e.expense_date, amount: Number(e.amount), description: e.description, supplier: e.supplier ?? null, ref: e.txn_no ?? null, category: e.category ?? null })
    if (e.txn_no) seen.add(e.txn_no)
  }
  const ids = ((sts ?? []) as any[]).map(x => x.id)
  if (ids.length) {
    const { data: lines } = await s.from('statement_line_items').select('statement_id, description, amount, category').in('statement_id', ids)
    const byId = new Map(((sts ?? []) as any[]).map(x => [x.id, x]))
    for (const l of (lines ?? []) as any[]) {
      const st: any = byId.get(l.statement_id)
      if (!st || ['rent_income', 'income', 'management_fee', 'letting_fee'].includes(String(l.category))) continue
      // a CROS expense already on this statement is counted once
      if (/\(X?EXP\d+\)/.test(String(l.description)) && seen.has(String(l.description).match(/\((X?EXP\d+)\)/)![1])) continue
      out.push({ date: String(st.period_start || st.statement_date).slice(0, 10), amount: Number(l.amount), description: l.description, supplier: null, ref: st.statement_reference ?? null, category: l.category ?? null })
    }
  }
  return out.filter(x => x.amount > 0).sort((a, b) => b.date.localeCompare(a.date))
}

/** WiFi details already written in the house information (free text, from the property information sheet). */
function wifiFromHouseInfo(items: any[]): { supplier: string | null; network: string | null; password: string | null; phone: string | null } | null {
  const w = items.filter(i => /wi-?fi|internet|broadband/i.test(`${i.label}`))
  if (!w.length) return null
  const text = w.map(i => `${i.label}: ${i.value}`).join('\n')
  const pick = (re: RegExp) => text.match(re)?.[1]?.trim() || null
  const provider = pick(/(?:provider|supplier)\s*:\s*([^\n|]+)/i) ?? pick(/wi-?fi\s*name\s*:\s*(community fibre|hyperoptic[^\n]*|bt[^\n]*|virgin[^\n]*|sky[^\n]*|vodafone[^\n]*|talktalk[^\n]*|plusnet[^\n]*)/i)
  const phone = provider?.match(/(0\d[\d\s]{8,12}\d)/)?.[1] ?? null
  return {
    supplier: provider ? provider.replace(/\s*[-–—]\s*0\d[\d\s]+$/, '').trim() : null,
    network: pick(/(?:network(?:\s*name)?|ssid)\s*:\s*([^\n|]+)/i) ?? pick(/wi-?fi\s*name\s*:\s*([^\n|]+)/i),
    password: pick(/password\s*:\s*([^\n|]+)/i),
    phone,
  }
}

export async function servicesFor(s: SupabaseClient, propertyId: string): Promise<{ ready: boolean; services: ServiceView[]; suggestions: Suggestion[] }> {
  const [{ data: rows, error }, all, { data: prop }] = await Promise.all([
    s.from('property_services').select('*').eq('property_id', propertyId).order('created_at'),
    charges(s, propertyId),
    s.from('properties').select('house_info').eq('id', propertyId).maybeSingle(),
  ])
  const ready = !(error && /property_services|does not exist|schema cache/i.test(error.message))
  const t = today(), yearAgo = new Date(Date.parse(t) - 365 * 86_400_000).toISOString().slice(0, 10), soon = new Date(Date.parse(t) + 60 * 86_400_000).toISOString().slice(0, 10)
  const forKind = (k: string, supplier: string | null) => {
    const cats = SERVICE_KINDS.find(x => x.key === k)?.categories ?? []
    const sup = (supplier ?? '').toLowerCase().split(/\s+/)[0]
    return all.filter(c => (c.category && cats.includes(c.category)) || (sup.length > 2 && `${c.description} ${c.supplier ?? ''}`.toLowerCase().includes(sup)))
  }
  const services: ServiceView[] = ((rows ?? []) as any[]).map(r => {
    const pays = forKind(r.kind, r.supplier)
    const y = pays.filter(p => p.date >= yearAgo)
    return {
      ...r, monthly_cost: r.monthly_cost != null ? Number(r.monthly_cost) : null,
      paid: { last12: r2(y.reduce((n, p) => n + p.amount, 0)), count12: y.length, perMonth: typical(y.map(p => p.amount)), last: pays[0] ?? null, payments: pays.slice(0, 24) },
      contractEndsSoon: !!r.contract_end && !r.ended_at && r.contract_end <= soon,
    }
  })
  // suggestions: a type of cost charged in 2+ months of the last year with no account recorded for it
  const active = new Set(services.filter(x => !x.ended_at).map(x => x.kind))
  const suggestions: Suggestion[] = []
  for (const k of SERVICE_KINDS) {
    if (!k.categories.length || active.has(k.key) || (k.key === 'energy' && (active.has('gas') || active.has('electricity')))) continue
    const y = all.filter(c => c.category && k.categories.includes(c.category) && c.date >= yearAgo)
    const months = new Set(y.map(c => c.date.slice(0, 7))).size
    if (months >= 2) suggestions.push({ kind: k.key, why: `${y.length} charge${y.length === 1 ? '' : 's'} in ${months} months on the statements`, perMonth: typical(y.map(c => c.amount)), supplier: y.find(c => c.supplier)?.supplier ?? null })
  }
  const wifi = wifiFromHouseInfo(((prop as any)?.house_info?.items ?? []) as any[])
  if (wifi && !active.has('internet')) {
    const i = suggestions.findIndex(x => x.kind === 'internet')
    const sg: Suggestion = { kind: 'internet', why: i >= 0 ? `${suggestions[i].why}; WiFi details are in the house information` : 'WiFi details are in the house information', perMonth: i >= 0 ? suggestions[i].perMonth : null, supplier: wifi.supplier ?? (i >= 0 ? suggestions[i].supplier : null), wifi: { network: wifi.network, password: wifi.password, phone: wifi.phone } }
    if (i >= 0) suggestions[i] = sg; else suggestions.unshift(sg)
  }
  return { ready, services, suggestions }
}

/** The tenant app's WiFi item comes from the internet account: replace any WiFi / internet items with one built from it. */
export async function syncHouseInfo(s: SupabaseClient, propertyId: string): Promise<void> {
  const [{ data: svc }, { data: prop }] = await Promise.all([
    s.from('property_services').select('supplier, support_phone, wifi_network, wifi_password, ended_at, updated_at').eq('property_id', propertyId).eq('kind', 'internet').is('ended_at', null).order('updated_at', { ascending: false }).limit(1),
    s.from('properties').select('house_info').eq('id', propertyId).maybeSingle(),
  ])
  const net = (svc ?? [])[0] as any
  if (!net || !(net.wifi_network || net.wifi_password || net.supplier)) return   // nothing to say — leave the house information alone
  const items = (((prop as any)?.house_info?.items ?? []) as any[]).filter(i => !/wi-?fi|internet|broadband/i.test(String(i.label)))
  const value = [net.wifi_network ? `Network: ${net.wifi_network}` : null, net.wifi_password ? `Password: ${net.wifi_password}` : null,
    net.supplier ? `Provider: ${net.supplier}${net.support_phone ? ` — faults ${net.support_phone}` : ''}` : null].filter(Boolean).join('\n')
  items.unshift({ icon: '📶', label: 'WiFi', value, sensitive: false, from: 'bills-and-services' })
  await s.from('properties').update({ house_info: { ...((prop as any)?.house_info ?? {}), items } }).eq('id', propertyId)
}

/** Every live account across the houses (the Bills & services overview, the dashboard and the Today list). Practice
 *  houses left out. `ready` is false until migration 264 has run — callers then show nothing rather than an error. */
export async function allServices(s: SupabaseClient): Promise<{ ready: boolean; rows: (ServiceRow & { property: string; endsInDays: number | null })[] }> {
  const { data, error } = await s.from('property_services').select('*, properties(name, address, is_demo)').is('ended_at', null)
  if (error) return { ready: !/property_services|does not exist|schema cache/i.test(error.message), rows: [] }
  const t = today()
  return {
    ready: true,
    rows: ((data ?? []) as any[]).filter(r => !r.properties?.is_demo).map(r => ({
      ...r, monthly_cost: r.monthly_cost != null ? Number(r.monthly_cost) : null,
      property: String(r.properties?.name || r.properties?.address || '').split(/\n/)[0],
      endsInDays: r.contract_end ? Math.round((Date.parse(r.contract_end) - Date.parse(t)) / 86_400_000) : null,
    })),
  }
}
export type ServiceRow = Omit<ServiceView, 'paid' | 'contractEndsSoon'> & { property_id: string }
/** Contracts that end within `days` (or have ended and are still live — likely now on a higher out-of-contract price). */
export const endingSoon = <T extends { endsInDays: number | null }>(rows: T[], days = 60) => rows.filter(r => r.endsInDays != null && r.endsInDays <= days).sort((a, b) => a.endsInDays! - b.endsInDays!)

/** The account a bank payment is for: the one whose supplier is named in the bank line (e.g. "COMMUNITY FIBRE LTD
 *  DD 12345" → the internet account with Community Fibre). Words like "Ltd" and "the" don't count. */
export function matchService<T extends { supplier: string | null; ended_at?: string | null }>(services: T[], bankText: string): T | null {
  const text = ` ${bankText.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 2 && !['ltd', 'limited', 'the', 'plc', 'and', 'uk', 'services', 'energy', 'water'].includes(w))
  return services.filter(x => !x.ended_at && x.supplier).find(x => { const w = words(x.supplier!); return w.length > 0 && w.every(k => text.includes(` ${k} `)) })
    ?? services.filter(x => !x.ended_at && x.supplier).find(x => { const w = words(x.supplier!); return w.length > 0 && text.includes(` ${w[0]} `) }) ?? null
}
/** The expense type a bill for this kind of account is filed under (Internet → broadband). */
export const categoryForKind = (k: string) => SERVICE_KINDS.find(x => x.key === k)?.categories[0] ?? null
