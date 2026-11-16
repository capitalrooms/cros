// /api/admin/people/write — every office screen that changes a person saves through here (16 Nov 2026). The browser
// can't write to the people table (it holds dates of birth, income, bank details), so a dozen screens — landlord,
// contractor, person, tenant, tenancies, room edit, new property, contacts, view-as, document review — failed with
// "permission denied for table people". Same rules as /api/admin/people and /update: office staff with People access;
// office accounts, roles, access levels and email changes are administrators only.
//   POST { op: 'update', id, fields }   → { data }
//   POST { op: 'insert', fields }       → { data }   (409 { existingId } if the email is already in CROS)
//   POST { op: 'delete', id }           → { ok }
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { officeCaller, bearer } from '@/lib/access/server'
import { isAdministrator } from '@/lib/access/areas'
import { createServiceClient } from '@/lib/supabase'
import { logAudit } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'
const OFFICE = ['administrator', 'admin', 'lettings']
const ROLES = ['tenant', 'landlord', 'contractor', 'cleaner', 'applicant', 'guarantor', 'inactive', ...OFFICE]
const NEVER = ['id', 'created_at', 'auth_user_id', 'user_id']
const ADMIN_ONLY = ['role', 'access_areas', 'email']
const UUID = /^[0-9a-f-]{36}$/i

export async function POST(req: NextRequest) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'You don’t have access to change people’s details.' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { op?: string; id?: string; fields?: Record<string, unknown> }
  const who = await officeCaller(bearer(req.headers))
  const admin = !!who && isAdministrator(who.role)
  const s = createServiceClient()
  const fields: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(b.fields ?? {})) if (!NEVER.includes(k)) fields[k] = v
  if (typeof fields.email === 'string') fields.email = fields.email.trim().toLowerCase()

  if (b.op === 'update') {
    const id = String(b.id ?? '')
    if (!UUID.test(id)) return NextResponse.json({ error: 'Who? (no person id)' }, { status: 400 })
    const { data: before } = await s.from('people').select('id, email, role').eq('id', id).maybeSingle() as { data: any }
    if (!before) return NextResponse.json({ error: 'That person isn’t in CROS any more.' }, { status: 404 })
    const emailChanged = 'email' in fields && String(fields.email ?? '') !== String(before.email ?? '').toLowerCase()
    const touchesAdmin = ('role' in fields && fields.role !== before.role) || 'access_areas' in fields || emailChanged || OFFICE.includes(String(before.role))
    if (touchesAdmin && !admin) return NextResponse.json({ error: 'Only an administrator can change an email address, a role or an office account.' }, { status: 403 })
    if ('role' in fields && !ROLES.includes(String(fields.role))) return NextResponse.json({ error: 'That isn’t a role CROS knows.' }, { status: 400 })
    if (emailChanged) {
      const { data: clash } = await s.from('people').select('id').ilike('email', String(fields.email)).neq('id', id).limit(1)
      if (clash?.length) return NextResponse.json({ error: `${fields.email} already belongs to someone else in CROS.` }, { status: 409 })
    }
    const { data, error } = await s.from('people').update(fields).eq('id', id).select('*').maybeSingle()
    if (error) return NextResponse.json({ error: /duplicate key|unique/i.test(error.message) ? 'Someone else in CROS already has that email or phone number.' : error.message }, { status: 400 })
    await logAudit({ userId: me.personId, action: 'update', table: 'people', recordId: id, details: `Changed ${Object.keys(fields).join(', ')}` }).catch(() => false)
    return NextResponse.json({ data })
  }

  if (b.op === 'insert') {
    const role = String(fields.role ?? '')
    if (!ROLES.includes(role)) return NextResponse.json({ error: 'Choose what they are (tenant, landlord, contractor…).' }, { status: 400 })
    if ((OFFICE.includes(role) || 'access_areas' in fields) && !admin) return NextResponse.json({ error: 'Only an administrator can add an office account.' }, { status: 403 })
    if (fields.email) {
      const { data: existing } = await s.from('people').select('id').ilike('email', String(fields.email)).limit(1).maybeSingle() as { data: any }
      if (existing) return NextResponse.json({ error: `${fields.email} is already in CROS — search for them.`, existingId: existing.id }, { status: 409 })
    }
    const { data, error } = await s.from('people').insert(fields).select('*').single()
    if (error) return NextResponse.json({ error: /duplicate key|unique/i.test(error.message) ? 'Someone with that email is already in CROS.' : error.message }, { status: 400 })
    await logAudit({ userId: me.personId, action: 'create', table: 'people', recordId: (data as any).id, details: `Added a ${role}` }).catch(() => false)
    return NextResponse.json({ data })
  }

  if (b.op === 'delete') {
    const id = String(b.id ?? '')
    if (!UUID.test(id)) return NextResponse.json({ error: 'Who?' }, { status: 400 })
    if (id === me.personId) return NextResponse.json({ error: 'You can’t delete yourself.' }, { status: 400 })
    const { data: p } = await s.from('people').select('role').eq('id', id).maybeSingle() as { data: any }
    if (!p) return NextResponse.json({ error: 'They’re not in CROS any more.' }, { status: 404 })
    if (OFFICE.includes(String(p.role)) && !admin) return NextResponse.json({ error: 'Only an administrator can remove an office account.' }, { status: 403 })
    const { error } = await s.from('people').delete().eq('id', id)
    if (error) return NextResponse.json({ error: /foreign key|violates/i.test(error.message) ? `They have records in CROS (${error.message.match(/on table "([^"]+)"/)?.[1]?.replace(/_/g, ' ') ?? 'tenancies, jobs, payments'}), so they can’t be deleted — turn their sign-in off instead.` : error.message }, { status: 400 })
    await logAudit({ userId: me.personId, action: 'delete', table: 'people', recordId: id }).catch(() => false)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Nothing to do' }, { status: 400 })
}
