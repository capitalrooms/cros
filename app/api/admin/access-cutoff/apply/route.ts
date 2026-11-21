// POST /api/admin/access-cutoff/apply — marks ONLY the listed tenant accounts as inactive (21 Nov 2026).
// Safety: an administrator must send confirm: true and the exact people to change. The server re-checks each person
// against the dry-run rules before changing anything, and records every change in access_changes so it can be undone.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
const GRACE_DAYS = 30
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as { confirm?: boolean; personIds?: unknown }
  if (b.confirm !== true) return NextResponse.json({ error: 'Nothing changed: send confirm: true' }, { status: 400 })
  const ids = (Array.isArray(b.personIds) ? b.personIds : []).map(String).filter(id => UUID.test(id)).slice(0, 500)
  if (!ids.length) return NextResponse.json({ error: 'Choose at least one person' }, { status: 400 })

  const s = createServiceClient() as any
  const cutoff = new Date(Date.now() - GRACE_DAYS * 86400000).toISOString().slice(0, 10)
  const { data: people } = await s.from('people').select('id, role, email').in('id', ids)
  const { data: tenancies } = await s.from('tenancies').select('person_id, co_tenant_id, end_date').or(`person_id.in.(${ids.join(',')}),co_tenant_id.in.(${ids.join(',')})`)

  const applied: string[] = [], skipped: { personId: string; reason: string }[] = []
  for (const p of (people ?? []) as any[]) {
    // re-check the rules now, not what the list said earlier
    const mine = (tenancies ?? []).filter((t: any) => t.person_id === p.id || t.co_tenant_id === p.id)
    if (p.role !== 'tenant') { skipped.push({ personId: p.id, reason: 'not a tenant account' }); continue }
    if (mine.length === 0) { skipped.push({ personId: p.id, reason: 'no tenancy on record' }); continue }
    if (mine.some((t: any) => t.end_date === null || t.end_date >= cutoff)) { skipped.push({ personId: p.id, reason: 'still in a tenancy or ended within 30 days' }); continue }
    const { error } = await s.from('people').update({ role: 'inactive' }).eq('id', p.id).eq('role', 'tenant')
    if (error) { skipped.push({ personId: p.id, reason: `not changed: ${error.message}` }); continue }
    await s.from('access_changes').insert({ person_id: p.id, from_role: 'tenant', to_role: 'inactive', reason: `tenancy ended more than ${GRACE_DAYS} days ago` })
    applied.push(p.id)
  }
  return NextResponse.json({ applied: applied.length, skipped })
}
