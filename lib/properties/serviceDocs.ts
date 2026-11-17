// Bills & services paperwork (17 Nov 2026, Harry: "populate some of the details by adding screenshots or docs … and
// hold the docs on file for each utility so you never forget account numbers or plans or prices"). Server only.
//   readBill    — one or more bills / screenshots / welcome letters → the account details found on them (never invented)
//   docs are property_documents (type utility_bill) tagged in description "service:<id>" so each account keeps its own
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AI_MODEL_SMART } from '@/lib/ai-classify'
import { SERVICE_KINDS } from '@/lib/properties/services'

export interface BillFound {
  kind: string | null; supplier: string | null; account_number: string | null; account_holder: string | null; login_email: string | null
  support_phone: string | null; monthly_cost: number | null; payment_method: string | null; contract_start: string | null; contract_end: string | null
  meter_refs: string | null; wifi_network: string | null; wifi_password: string | null; plan: string | null; summary: string | null
}
export const tagFor = (serviceId: string) => `service:${serviceId}`
export const serviceIdOf = (description: string | null) => String(description ?? '').match(/^service:([0-9a-f-]{36})/)?.[1] ?? null

function media(bytes: Buffer, mime: string): any {
  if (mime === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } }
  return { type: 'image', source: { type: 'base64', media_type: /png/.test(mime) ? 'image/png' : /webp/.test(mime) ? 'image/webp' : /gif/.test(mime) ? 'image/gif' : 'image/jpeg', data: bytes.toString('base64') } }
}

export async function readBill(files: { bytes: Buffer; mime: string }[], houseHint?: string | null): Promise<BillFound> {
  const str = { type: 'string' }
  const res = await new Anthropic().messages.create({
    model: AI_MODEL_SMART, max_tokens: 1500,
    tool_choice: { type: 'tool', name: 'account' },
    tools: [{ name: 'account', description: 'The utility / service account details shown on these documents', input_schema: { type: 'object', properties: {
      kind: { type: 'string', enum: SERVICE_KINDS.map(k => k.key) },
      supplier: str, account_number: str, account_holder: { type: 'string', description: 'Whose name the account is in' },
      login_email: { type: 'string', description: 'Email address the account is registered to, if shown' },
      support_phone: { type: 'string', description: 'Customer service / fault line number' },
      monthly_cost: { type: 'number', description: 'The regular monthly charge in £ (Direct Debit amount or monthly price). Not a one-off or catch-up total' },
      payment_method: { type: 'string', description: 'e.g. Direct Debit' },
      contract_start: { type: 'string', description: 'YYYY-MM-DD' }, contract_end: { type: 'string', description: 'YYYY-MM-DD — contract / fixed tariff / minimum term end' },
      meter_refs: { type: 'string', description: 'MPAN, MPRN, meter serial numbers, water supply number — all of them, labelled' },
      wifi_network: str, wifi_password: str,
      plan: { type: 'string', description: 'Tariff / package name and its prices: unit rates, standing charges, speed, etc.' },
      summary: { type: 'string', description: 'One short line on what these documents are, e.g. "Octopus bill for October 2026"' },
    } } } as any],
    messages: [{ role: 'user', content: [...files.slice(0, 6).map(f => media(f.bytes, f.mime)), { type: 'text', text: `These are bills, letters or screenshots for a utility or service account at a shared house in the UK${houseHint ? ` (${houseHint})` : ''}. Take out ONLY details actually shown — copy numbers exactly; leave anything not shown empty. Never guess.` }] }],
  })
  const t = (res.content as any[]).find(x => x.type === 'tool_use')?.input ?? {}
  const s = (v: unknown, n = 300) => { const x = String(v ?? '').trim().slice(0, n); return x || null }
  const d = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null
  const cost = Number(t.monthly_cost)
  return {
    kind: SERVICE_KINDS.some(k => k.key === t.kind) ? t.kind : null, supplier: s(t.supplier, 120), account_number: s(t.account_number, 80), account_holder: s(t.account_holder, 120),
    login_email: s(t.login_email, 160), support_phone: s(t.support_phone, 40), monthly_cost: cost > 0 && cost < 100000 ? Math.round(cost * 100) / 100 : null,
    payment_method: s(t.payment_method, 60), contract_start: d(t.contract_start), contract_end: d(t.contract_end), meter_refs: s(t.meter_refs),
    wifi_network: s(t.wifi_network, 80), wifi_password: s(t.wifi_password, 80), plan: s(t.plan, 600), summary: s(t.summary, 160),
  }
}

export interface ServiceDoc { id: string; url: string; file_name: string; note: string | null; created_at: string }

/** The paperwork at a house: each account's files, and bills on file not yet tied to an account. */
export async function serviceDocs(s: SupabaseClient, propertyId: string) {
  const { data } = await s.from('property_documents').select('id, file_name, description, created_at, storage_url').eq('property_id', propertyId).eq('document_type', 'utility_bill').order('created_at', { ascending: false }).limit(200)
  const byService: Record<string, ServiceDoc[]> = {}
  const loose: ServiceDoc[] = []
  for (const d of (data ?? []) as any[]) {
    const sid = serviceIdOf(d.description)
    const row: ServiceDoc = { url: d.storage_url, id: d.id, file_name: d.file_name, note: String(d.description ?? '').replace(/^service:[0-9a-f-]{36}\s*·?\s*/, '') || null, created_at: d.created_at }
    if (sid) (byService[sid] ??= []).push(row); else loose.push(row)
  }
  return { byService, loose }
}
