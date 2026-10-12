// Who is calling an office route, with their access areas (server only — uses the service key). Shared by proxy.ts
// (every /api/admin request) and lib/adminAuth.requireAdmin, so both decide the same way (lib/access/areas).
// A short in-memory memo per sign-in token saves a lookup on every request a page makes in quick succession.
import { createClient } from '@supabase/supabase-js'
import { secondStepMissing } from '@/lib/auth/aal'
import { areasFor, isOfficeRole, type AreaKey } from '@/lib/access/areas'

export interface OfficeCaller { email: string; personId: string; role: string; areas: AreaKey[] }

const memo = new Map<string, { at: number; who: OfficeCaller | null }>()
const MEMO_MS = 30_000

/** The office person behind this Bearer token, or null (not signed in, not office, sign-in turned off, two-step missing). */
export async function officeCaller(token: string | null | undefined): Promise<OfficeCaller | null> {
  if (!token) return null
  const hit = memo.get(token)
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.who
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  let who: OfficeCaller | null = null
  const { data: { user } } = await svc.auth.getUser(token)
  if (user?.email && !secondStepMissing(user, token)) {
    const { data: p } = await svc.from('people').select('id, role, access_areas').ilike('email', user.email).order('created_at').limit(1).maybeSingle()
    if (p && isOfficeRole(p.role)) who = { email: user.email, personId: p.id, role: p.role, areas: areasFor(p.role, p.access_areas) }
  }
  if (memo.size > 500) memo.clear()
  memo.set(token, { at: Date.now(), who })
  return who
}

export const bearer = (h: Headers) => h.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || null
