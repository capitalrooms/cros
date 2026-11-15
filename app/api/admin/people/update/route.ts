// POST /api/admin/people/update — the Edit Person box saves through here (15 Nov 2026). It used to write to people
// straight from the browser and, when that failed, only ever said "Error saving person". Now the server saves it and
// says exactly what went wrong. Office staff with People access; changing an email or an office account stays
// administrators only (the same rule as the people_role_email_guard trigger).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { officeCaller, bearer } from '@/lib/access/server'
import { isAdministrator } from '@/lib/access/areas'
import { createServiceClient } from '@/lib/supabase'
import { nameFields, SALUTATIONS } from '@/lib/people'
import { logAudit } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'You don’t have access to change people’s details.' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Record<string, string | undefined>
  const id = String(b.id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Who? (no person id)' }, { status: 400 })
  const first = String(b.first_name ?? '').trim(), last = String(b.last_name ?? '').trim(), email = String(b.email ?? '').trim()
  if (!first && !last) return NextResponse.json({ error: 'Put in a first name or surname.' }, { status: 400 })
  if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  const salutation = b.salutation ? String(b.salutation) : null
  if (salutation && !(SALUTATIONS as readonly string[]).includes(salutation)) return NextResponse.json({ error: `“${salutation}” isn’t one of the titles CROS knows.` }, { status: 400 })

  const s = createServiceClient()
  const { data: before, error: e1 } = await s.from('people').select('id, email, role').eq('id', id).maybeSingle()
  if (e1) return NextResponse.json({ error: `Couldn’t find them: ${e1.message}` }, { status: 500 })
  if (!before) return NextResponse.json({ error: 'That person isn’t in CROS any more.' }, { status: 404 })
  const who = await officeCaller(bearer(req.headers))
  const admin = !!who && isAdministrator(who.role)
  const emailChanged = String(before.email ?? '').toLowerCase() !== email.toLowerCase()
  if (!admin && (emailChanged || ['administrator', 'admin', 'lettings'].includes(String(before.role))))
    return NextResponse.json({ error: 'Only an administrator can change an email address or an office account.' }, { status: 403 })
  if (emailChanged) {
    const { data: clash } = await s.from('people').select('id').ilike('email', email).neq('id', id).limit(1)
    if (clash?.length) return NextResponse.json({ error: `${email} already belongs to someone else in CROS.` }, { status: 409 })
  }

  const row: Record<string, unknown> = {
    ...nameFields(first, last, String(b.middle_name ?? '').trim() || undefined),
    salutation, email, phone: String(b.phone ?? '').trim() || null,
  }
  if ('bank_details' in b) row.bank_details = String(b.bank_details ?? '').trim() || null
  let { error } = await s.from('people').update(row).eq('id', id)
  if (error && /bank_details/.test(error.message)) { delete row.bank_details; ({ error } = await s.from('people').update(row).eq('id', id)) }
  if (error) {
    const msg = /duplicate key|unique/i.test(error.message) ? 'Someone else in CROS already has that email or phone number.' : error.message
    return NextResponse.json({ error: `Not saved — ${msg}` }, { status: 500 })
  }
  await logAudit({ userId: me.personId, action: 'person_updated', details: `${id}${emailChanged ? ' (email changed)' : ''}` } as any).catch(() => null)
  return NextResponse.json({ ok: true })
}
