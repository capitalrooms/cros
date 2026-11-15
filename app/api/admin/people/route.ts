// /api/admin/people — add or remove a person from the server (15 Nov 2026). The browser can no longer write to the
// people table ("permission denied for table people" when Harry added a contractor), which is right: records holding
// dates of birth, income and bank details are changed by the server only. Office staff with People access; office
// accounts are administrators only (the same rule as the people guard trigger).
//   POST   { …person fields }  → { id }
//   DELETE ?id=
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { officeCaller, bearer } from '@/lib/access/server'
import { isAdministrator } from '@/lib/access/areas'
import { createServiceClient } from '@/lib/supabase'
import { SALUTATIONS } from '@/lib/people'
import { logAudit } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'
const OFFICE = ['administrator', 'admin', 'lettings']
const ROLES = ['tenant', 'landlord', 'contractor', 'cleaner', ...OFFICE]
// the columns the Add forms send — anything else is ignored
const FIELDS = ['email', 'first_name', 'middle_name', 'last_name', 'full_name', 'salutation', 'phone', 'date_of_birth', 'nationality', 'occupation',
  'annual_income', 'role', 'property_id', 'job_title', 'access_areas', 'company', 'trade_types', 'address']

async function isAdmin(req: NextRequest) { const w = await officeCaller(bearer(req.headers)); return !!w && isAdministrator(w.role) }

export async function POST(req: NextRequest) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'You don’t have access to add people.' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Record<string, any>
  const row: Record<string, any> = {}
  for (const k of FIELDS) if (b[k] !== undefined && b[k] !== '') row[k] = typeof b[k] === 'string' ? b[k].trim() : b[k]
  row.email = String(row.email ?? '').toLowerCase()
  if (!row.email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  if (!ROLES.includes(row.role)) return NextResponse.json({ error: 'Choose what they are (tenant, contractor…).' }, { status: 400 })
  if (row.salutation && !(SALUTATIONS as readonly string[]).includes(row.salutation)) return NextResponse.json({ error: `“${row.salutation}” isn’t one of the titles CROS knows.` }, { status: 400 })
  if ((OFFICE.includes(row.role) || row.access_areas) && !(await isAdmin(req))) return NextResponse.json({ error: 'Only an administrator can add an office account.' }, { status: 403 })

  const s = createServiceClient()
  const { data: existing } = await s.from('people').select('id').ilike('email', row.email).limit(1).maybeSingle()
  if (existing) return NextResponse.json({ error: `${row.email} is already in CROS — search for them.`, existingId: (existing as any).id }, { status: 409 })
  const { data, error } = await s.from('people').insert(row).select('id').single()
  if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? 'Someone with that email is already in CROS — search for them above.' : `Couldn’t add them: ${error.message}` }, { status: 500 })
  await logAudit({ userId: me.personId, action: 'person_added', details: `${row.role} ${(data as any).id}` } as any).catch(() => null)
  return NextResponse.json({ ok: true, id: (data as any).id })
}

export async function DELETE(req: NextRequest) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'You don’t have access to remove people.' }, { status: 403 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Who?' }, { status: 400 })
  const s = createServiceClient()
  const { data: p } = await s.from('people').select('role').eq('id', id).maybeSingle()
  if (!p) return NextResponse.json({ error: 'They’re not in CROS any more.' }, { status: 404 })
  if (OFFICE.includes(String((p as any).role)) && !(await isAdmin(req))) return NextResponse.json({ error: 'Only an administrator can remove an office account.' }, { status: 403 })
  if (id === me.personId) return NextResponse.json({ error: 'You can’t delete yourself.' }, { status: 400 })
  const { error } = await s.from('people').delete().eq('id', id)
  if (error) return NextResponse.json({ error: /foreign key|violates/i.test(error.message) ? 'They have records in CROS (tenancies, jobs, payments…), so they can’t be deleted — turn their sign-in off instead.' : `Not deleted: ${error.message}` }, { status: 500 })
  await logAudit({ userId: me.personId, action: 'person_deleted', details: id } as any).catch(() => null)
  return NextResponse.json({ ok: true })
}
