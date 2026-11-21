// GET /api/admin/access-cutoff — DRY RUN ONLY (21 Nov 2026). Lists the tenant accounts that the 30-day cutoff would
// mark inactive. Changes nothing. A person is listed only when ALL of these hold:
//   • their role is 'tenant' (never staff, landlords, contractors or cleaners)
//   • every tenancy they are on (as tenant or joint tenant) ended more than 30 days ago
//   • they have at least one tenancy, so brand-new accounts with no tenancy yet are never listed
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
const GRACE_DAYS = 30

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient() as any
  const today = new Date()
  const cutoff = new Date(today.getTime() - GRACE_DAYS * 86400000).toISOString().slice(0, 10)

  const { data: tenants } = await s.from('people').select('id, email, first_name, last_name, full_name, role').eq('role', 'tenant').limit(5000)
  const { data: tenancies } = await s.from('tenancies').select('person_id, co_tenant_id, end_date').limit(20000)

  const byPerson = new Map<string, { ends: (string | null)[] }>()
  for (const t of (tenancies ?? []) as any[]) {
    for (const pid of [t.person_id, t.co_tenant_id]) {
      if (!pid) continue
      if (!byPerson.has(pid)) byPerson.set(pid, { ends: [] })
      byPerson.get(pid)!.ends.push(t.end_date ?? null)
    }
  }

  const candidates = []
  for (const p of (tenants ?? []) as any[]) {
    const rec = byPerson.get(p.id)
    if (!rec || rec.ends.length === 0) continue                     // never had a tenancy: leave alone
    if (rec.ends.some(e => e === null || e >= cutoff)) continue     // still in a tenancy, or ended within 30 days
    const lastEnd = rec.ends.filter(Boolean).sort().slice(-1)[0] ?? null
    candidates.push({
      personId: p.id,
      name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || '(no name)',
      email: p.email,
      lastTenancyEnded: lastEnd,
    })
  }
  candidates.sort((a, b) => String(a.lastTenancyEnded).localeCompare(String(b.lastTenancyEnded)))
  return NextResponse.json({ dryRun: true, graceDays: GRACE_DAYS, cutoff, count: candidates.length, candidates })
}
