// Homeppl ↔ a letting file (6 Nov 2026). Server-only.
//   homepplFor(s, tenancyId)        — read only: the tenant's referencing check at Homeppl and how many of its
//                                     documents are already in CROS
//   bringInFromHomeppl(s, tenancyId) — copies every document the applicant and guarantor uploaded (passport, right
//                                     to rent, bank statements, payslips…) and the finished report onto the letting
//                                     file, encrypted at rest; ticks "Sent to Homeppl" and, when Homeppl approved
//                                     them, "Referencing passed". Safe to run again: nothing is copied twice.
// The match is on the tenant's email (Homeppl is searched by surname first) — never on a name alone.
import type { SupabaseClient } from '@supabase/supabase-js'
import { validationsByEmail, currentValidation, documentsFor, riskReport, type HpValidation } from './client'
import { sealBytes } from '@/lib/files/fileCrypt'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'

const BUCKET = 'property-documents'
const FINISHED = ['APPROVED', 'UNAPPROVED']

// Homeppl's document types → the letting file's (app/admin/lettings/[tenancyId]/parts.tsx DOC_LABEL)
const ID = ['ID', 'DRIVING_LICENCE', 'UK_DRIVING_LICENCE', 'PASSPORT', 'UK_PASSPORT', 'BRITISH_NATIONAL_OVERSEAS_PASSPORT', 'DIPLOMATIC_PASSPORT', 'TIME_LIMITED_PASSPORT', 'LIVE_PHOTO', 'IDVT_REPORT', 'BIRTH_ADOPTION', 'NATURALIZATION', 'BRITISH_CITIZEN', 'ARMED_FORCES']
const RTR = ['EU_SHARE_CODE_VERIFICATION_DOCUMENT', 'UK_IMMIGRATION_STATUS', 'UK_BIOMETRIC_RESIDENCE', 'UK_VISA_APPLICATION_LETTER', 'LANDLORDS_CHECKING_SERVICE_DOCUMENT', 'LETTER_FROM_AUTHORISED_BODY', 'ARMED_FORCES_DEPLOYMENT_LETTER']
export function docTypeFor(hpType: string, guarantor: boolean): string {
  if (guarantor || hpType.startsWith('GUARANTOR')) return 'guarantor_document'
  if (ID.includes(hpType)) return 'id_proof'
  if (RTR.includes(hpType)) return 'right_to_rent'
  if (['LIGHT_CHECK_REPORT', 'CREDIT_CHECK', 'REFERENCE_BY_LETTING_AGENT'].includes(hpType)) return 'reference_report'
  return 'referencing_evidence'
}
const words = (t: string) => { const w = t.toLowerCase().replace(/_/g, ' ').replace(/\buk\b/g, 'UK').replace(/\beu\b/g, 'EU').replace(/\bid\b/g, 'ID').replace(/\bhmrc\b/g, 'HMRC').replace(/\bidvt\b/g, 'ID verification'); return w[0].toUpperCase() + w.slice(1) }
const extOf = (link: string, type: string) => (link.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? (type.includes('pdf') ? 'pdf' : type.includes('png') ? 'png' : 'jpg')).toLowerCase()
const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', heic: 'image/heic', webp: 'image/webp' }

async function tenancyPerson(s: SupabaseClient, tenancyId: string) {
  const { data: t } = await s.from('tenancies').select('id, property_id, person_id, applicant_id, referencing_sent_at, referencing_passed_at, let_cancelled_at, people:person_id(email, first_name, last_name)').eq('id', tenancyId).maybeSingle() as { data: any }
  if (!t) throw new Error('Tenancy not found')
  let email = t.people?.email ?? null, last = t.people?.last_name ?? null, first = t.people?.first_name ?? ''
  if ((!email || !last) && t.applicant_id) {
    const { data: a } = await s.from('applicants').select('email, last_name').eq('id', t.applicant_id).maybeSingle() as { data: any }
    email = email ?? a?.email ?? null; last = last ?? a?.last_name ?? null
  }
  return { t, email: email as string | null, last: last as string | null, first: first as string }
}

async function alreadyIn(s: SupabaseClient, tenancyId: string): Promise<Set<string>> {
  const { data } = await s.from('property_documents').select('storage_url').eq('tenancy_id', tenancyId).like('storage_url', `%/homeppl/${tenancyId}/%`)
  return new Set((data ?? []).map((d: any) => String(d.storage_url).split('/').pop()!.split('.')[0]))
}

export interface HomepplView {
  connected: true
  check: HpValidation | null
  others: number            // older or cancelled checks for the same person
  documents: number         // at Homeppl (applicant + guarantor)
  inCros: number            // of those, already on the letting file
  reportReady: boolean
  noEmail?: boolean
}

export async function homepplFor(s: SupabaseClient, tenancyId: string): Promise<HomepplView> {
  const { email, last, first } = await tenancyPerson(s, tenancyId)
  if (!email || !last) return { connected: true, check: null, others: 0, documents: 0, inCros: 0, reportReady: false, noEmail: true }
  const list = await validationsByEmail(email, last, first)
  const check = currentValidation(list)
  if (!check) return { connected: true, check: null, others: 0, documents: 0, inCros: 0, reportReady: false }
  const [mine, theirs, have] = await Promise.all([
    check.applicantUuid ? documentsFor(check.applicantUuid) : [],
    check.guarantor?.applicantUuid ? documentsFor(check.guarantor.applicantUuid) : [],
    alreadyIn(s, tenancyId),
  ])
  const all = [...mine, ...theirs]
  return { connected: true, check, others: list.length - 1, documents: all.length, inCros: all.filter(d => have.has(d.uuid)).length, reportReady: FINISHED.includes(check.status) }
}

export interface BringInResult { copied: string[]; skipped: number; failed: string[]; ticked: string[]; check: HpValidation | null }

/** `ticks: false` — documents only (the catch-up of tenants who've already moved in: their letting-file ticks are
 *  history, and "passed today" would be untrue). */
export async function bringInFromHomeppl(s: SupabaseClient, tenancyId: string, byEmail: string | null, o: { ticks?: boolean } = {}): Promise<BringInResult> {
  const { t, email, last, first } = await tenancyPerson(s, tenancyId)
  if (t.let_cancelled_at) throw new Error('This let fell through — nothing to bring in')
  if (!email || !last) throw new Error('The tenant needs an email address and surname in CROS to find them at Homeppl')
  const check = currentValidation(await validationsByEmail(email, last, first))
  if (!check) throw new Error(`No Homeppl referencing found for ${email}`)

  const have = await alreadyIn(s, tenancyId)
  const store = s.storage.from(BUCKET)
  const res: BringInResult = { copied: [], skipped: 0, failed: [], ticked: [], check }

  async function put(key: string, bytes: Buffer, ext: string, row: { document_type: string; file_name: string; description: string }) {
    const path = `homeppl/${tenancyId}/${key}.${ext}`
    // identity papers and bank statements — encrypted at rest like the landlords' AML documents (lib/files/fileCrypt)
    const { error: upErr } = await store.upload(path, sealBytes(bytes), { upsert: true, contentType: MIME[ext] ?? 'application/octet-stream' })
    if (upErr) throw new Error(upErr.message)
    const url = store.getPublicUrl(path).data.publicUrl
    const { error } = await s.from('property_documents').insert({ property_id: t.property_id, tenancy_id: tenancyId, visible_to_tenants: false, storage_url: url, file_size: bytes.length, ...row })
    if (error) { await store.remove([path]); throw new Error(error.message) }
  }

  const sources: { who: string; applicantUuid: string | null; guarantor: boolean }[] = [
    { who: '', applicantUuid: check.applicantUuid, guarantor: false },
    ...(check.guarantor ? [{ who: `Guarantor ${check.guarantor.name}`.trim(), applicantUuid: check.guarantor.applicantUuid, guarantor: true }] : []),
  ]
  for (const src of sources) {
    if (!src.applicantUuid) continue
    for (const d of await documentsFor(src.applicantUuid)) {
      if (have.has(d.uuid)) { res.skipped++; continue }
      // raw open-banking data (TrueLayer JSON) — machine-readable, of no use to anyone reading the file
      if (/TRUELAYER|TRANSACTIONS/.test(d.type) || /\.json(\?|$)/i.test(d.link ?? '')) { res.skipped++; continue }
      const name = `${src.who ? `${src.who} — ` : ''}${words(d.type)}`
      try {
        if (!d.link || !/^https:\/\/([a-z0-9-]+\.)*homeppl\.com\//i.test(d.link)) throw new Error('no download link')
        const r = await fetch(d.link, { signal: AbortSignal.timeout(30000) })
        if (!r.ok) throw new Error(`download ${r.status}`)
        const bytes = Buffer.from(await r.arrayBuffer())
        const ext = extOf(d.link, r.headers.get('content-type') ?? '')
        await put(d.uuid, bytes, ext, { document_type: docTypeFor(d.type, src.guarantor), file_name: `${name}.${ext}`, description: `From Homeppl — uploaded ${d.uploaded.slice(0, 10)}${d.verified === 1 ? ', verified by Homeppl' : ''}` })
        res.copied.push(name)
      } catch (e: any) { res.failed.push(`${name} (${e?.message ?? 'error'})`) }
    }
  }
  // the finished report(s)
  const reports: [string, string, boolean, boolean][] = [[check.uuid, 'Homeppl referencing report', false, FINISHED.includes(check.status)]]
  if (check.guarantor) reports.push([check.guarantor.uuid, `Homeppl guarantor report — ${check.guarantor.name}`, true, FINISHED.includes(check.guarantor.status)])
  for (const [uuid, name, g, ready] of reports) {
    const key = `report-${uuid}`
    if (!ready) continue
    if (have.has(key)) { res.skipped++; continue }
    try {
      await put(key, await riskReport(uuid, g), 'pdf', { document_type: g ? 'guarantor_document' : 'reference_report', file_name: `${name}.pdf`, description: `From Homeppl — ${check.status === 'APPROVED' ? 'approved' : 'not approved'}` })
      res.copied.push(name)
    } catch (e: any) { res.failed.push(`${name} (${e?.message ?? 'error'})`) }
  }

  // the letting file's ticks follow what Homeppl says
  const today = new Date().toISOString().slice(0, 10)
  const upd: Record<string, string> = {}
  if (!t.referencing_sent_at) { upd.referencing_sent_at = (check.created || today).slice(0, 10); res.ticked.push('Sent to Homeppl') }
  if (!t.referencing_passed_at && check.status === 'APPROVED' && (!check.guarantor || check.guarantor.status === 'APPROVED')) { upd.referencing_passed_at = today; res.ticked.push('Referencing passed') }
  if (o.ticks === false) { res.ticked = []; for (const k in upd) delete upd[k] }
  if (Object.keys(upd).length) await s.from('tenancies').update(upd).eq('id', tenancyId)

  if (res.copied.length || res.ticked.length)
    await logTenancyEvent(s, tenancyId, 'homeppl', `From Homeppl (${check.status.toLowerCase()}): ${[res.copied.length ? `${res.copied.length} document${res.copied.length === 1 ? '' : 's'} brought in` : '', ...res.ticked.map(x => `${x} ticked`)].filter(Boolean).join(', ')}`, byEmail)
  return res
}
