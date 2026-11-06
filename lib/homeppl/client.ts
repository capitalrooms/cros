// Homeppl referencing API v3 (6 Nov 2026 — https://developer.homeppl.com, spec api.homeppl.com/api/v3/swagger.yaml).
// Server-only. The key is HOMEPPL_API_KEY on Vercel (and .env.local); it's a LIVE key — there's no sandbox — so
// anything that creates or changes something at Homeppl (an application = an invite email to a real person) only
// runs from an explicit button press.
//   hp(path, init)       — one call, "Authorization: Token <key>"; throws with Homeppl's own message on an error
//   validationsByEmail   — the referencing checks for a person, newest first (matched on email, never on name alone)
//   documentsFor         — every document the applicant (or guarantor) uploaded, with a short-lived download link
//   riskReport           — the finished report PDF
import crypto from 'crypto'

const BASE = 'https://api.homeppl.com'

export const homepplReady = () => !!process.env.HOMEPPL_API_KEY

export async function hp(path: string, init: RequestInit = {}): Promise<Response> {
  const key = process.env.HOMEPPL_API_KEY
  if (!key) throw new Error('Homeppl isn’t connected (HOMEPPL_API_KEY isn’t set)')
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Token ${key}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(25000),
    cache: 'no-store',
  })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    let msg = body.slice(0, 400)
    try { const j = JSON.parse(body); msg = j.detail ?? JSON.stringify(j).slice(0, 400) } catch { if (/^\s*</.test(body)) msg = r.status >= 500 ? 'a fault at Homeppl — try again later' : r.statusText }
    throw new Error(`Homeppl said ${r.status}: ${msg || r.statusText}`)
  }
  return r
}
const json = async <T = any>(path: string, init?: RequestInit): Promise<T> => (await hp(path, init)).json()

export type HpStatus = 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'UNAPPROVED' | 'CANCELLED' | 'CANCELLED_NOT_BILLABLE' | string

export interface HpValidation {
  uuid: string
  applicationUuid: string
  firstName: string; lastName: string; email: string
  applicantUuid: string | null
  status: HpStatus
  started: boolean          // they've logged in and begun the forms
  created: string
  moveIn: string | null
  rent: number | null
  address: string | null
  guarantor: { uuid: string; status: HpStatus; applicantUuid: string | null; name: string } | null
}

const norm = (e?: string | null) => String(e ?? '').trim().toLowerCase()

function toValidation(app: any, v: any): HpValidation {
  const g = v.guarantor_validation && typeof v.guarantor_validation === 'object' ? v.guarantor_validation : null
  return {
    uuid: v.uuid, applicationUuid: app?.uuid ?? v.rental_application_uuid,
    firstName: v.first_name ?? '', lastName: v.last_name ?? '', email: v.email ?? v.applicant?.email ?? '',
    applicantUuid: v.applicant?.uuid ?? null,
    status: v.check_status ?? 'PENDING',
    started: !!v.progress?.application_started,
    created: v.creation_dtm ?? app?.creation_dtm ?? '',
    moveIn: v.relocation_date ?? null,
    rent: v.share_of_rent ?? app?.rent ?? null,
    address: app?.address?.formatted_address ?? null,
    guarantor: g ? {
      uuid: g.uuid, status: g.check_status ?? 'PENDING', applicantUuid: typeof g.guarantor === 'string' ? g.guarantor : (g.guarantor?.uuid ?? null),
      name: [g.first_name, g.last_name].filter(Boolean).join(' '),
    } : null,
  }
}

/** A person's referencing checks, newest first. Homeppl is searched by surname, then the surname without accents,
 *  then the first name (names are often spelt differently in the two systems — "Wirngo"/"Wirgo", "Mościcki"/
 *  "Moscicki"); a check only counts when its email matches. */
export async function validationsByEmail(email: string, lastName: string, firstName = ''): Promise<HpValidation[]> {
  const want = norm(email)
  if (!want || !lastName.trim()) return []
  const plain = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
  const terms = [...new Set([lastName.trim(), plain(lastName.trim()), firstName.trim().split(/\s+/)[0], plain(firstName.trim().split(/\s+/)[0] ?? '')].filter(t => t && t.length > 1))]
  for (const term of terms) {
    const d = await json(`/api/v3/applications/?name=${encodeURIComponent(term)}&page_size=100`)
    const out: HpValidation[] = []
    for (const app of d.results ?? []) for (const v of app.validations ?? [])
      if (norm(v.email) === want || norm(v.applicant?.email) === want) out.push(toValidation(app, v))
    if (out.length) return out.sort((a, b) => b.created.localeCompare(a.created))
  }
  return []
}

/** The one that counts: the newest that wasn't cancelled (or the newest of all if every one was). */
export function currentValidation(list: HpValidation[]): HpValidation | null {
  return list.find(v => !String(v.status).startsWith('CANCELLED')) ?? list[0] ?? null
}

export interface HpDocument { uuid: string; type: string; uploaded: string; link: string | null; verified: number | null }

export async function documentsFor(applicantUuid: string): Promise<HpDocument[]> {
  const out: HpDocument[] = []
  for (let page = 1; page <= 10; page++) {
    const d = await json(`/api/v3/account-documents/?user__uuid=${encodeURIComponent(applicantUuid)}&page_size=100&page=${page}`)
    for (const x of d.results ?? []) out.push({ uuid: x.uuid, type: x.type, uploaded: x.uploaded ?? x.created, link: x.path ?? x.url ?? null, verified: x.verified ?? null })
    if (!d.next) break
  }
  return out
}

/** The finished report PDF for an applicant's (or a guarantor's) check. */
export async function riskReport(validationUuid: string, guarantor = false): Promise<Buffer> {
  const r = await hp(`/api/v3/${guarantor ? 'guarantors' : 'applicants'}/${encodeURIComponent(validationUuid)}/risk-report/`, { headers: { Accept: 'application/pdf' } })
  return Buffer.from(await r.arrayBuffer())
}

/** The check types this agency can order (FULL, RIGHT_TO_RENT…) → uuid. */
export async function checkTypes(): Promise<Record<string, string>> {
  const d = await json('/api/v3/agencies/')
  const out: Record<string, string> = {}
  for (const a of d.results ?? []) for (const c of a.supported_check_types ?? []) out[c.key] = c.uuid
  return out
}

/** The secret part of our webhook address — derived from the key, so there's nothing else to keep. */
export const webhookToken = () => crypto.createHmac('sha256', process.env.HOMEPPL_API_KEY ?? '').update('cros-homeppl-webhook').digest('base64url').slice(0, 32)

export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Invite sent', SUBMITTED: 'Submitted — Homeppl reviewing', APPROVED: 'Approved', UNAPPROVED: 'Not approved',
  CANCELLED: 'Cancelled', CANCELLED_NOT_BILLABLE: 'Cancelled',
}
