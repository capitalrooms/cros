// Homeppl candidates for a name (19 Nov 2026). READ ONLY: this lists the matching applications so the office can pick
// one. Nothing is saved from here — the details reach a person's record only after the office confirms the pick.
import { hp } from '@/lib/homeppl/client'

export interface HpCandidate {
  validationUuid: string
  firstName: string
  lastName: string
  email: string
  phone: string
  status: string
  created: string
  address: string | null
  moveIn: string | null
}

/** One candidate from a raw Homeppl application + validation (kept separate so it can be tested without the network). */
export function candidateFromValidation(app: any, v: any): HpCandidate {
  return {
    validationUuid: String(v?.uuid ?? ''),
    firstName: String(v?.first_name ?? v?.applicant?.first_name ?? '').trim(),
    lastName: String(v?.last_name ?? v?.applicant?.last_name ?? '').trim(),
    email: String(v?.email ?? v?.applicant?.email ?? '').trim(),
    phone: String(v?.phone ?? v?.applicant?.phone ?? '').trim(),
    status: String(v?.check_status ?? v?.status ?? ''),
    created: String(v?.creation_dtm ?? ''),
    address: app?.address ?? null,
    moveIn: v?.relocation_date ?? null,
  }
}

/** Everyone Homeppl holds under a name (its surname search, then the first name if nothing matches). Newest first. */
export async function findCandidates(name: string): Promise<HpCandidate[]> {
  const terms = [...new Set(name.trim().split(/\s+/).filter(t => t.length > 1))]
  const out = new Map<string, HpCandidate>()
  for (const term of terms) {
    const r = await hp(`/api/v3/applications/?name=${encodeURIComponent(term)}&page_size=50`)
    if (!r.ok) throw new Error(`Homeppl search failed (${r.status})`)
    const d: any = await r.json()
    for (const app of d.results ?? []) for (const v of app.validations ?? []) {
      const c = candidateFromValidation(app, v)
      if (c.validationUuid) out.set(c.validationUuid, c)
    }
    if (out.size) break
  }
  return [...out.values()].sort((a, b) => b.created.localeCompare(a.created))
}
