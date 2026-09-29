// GET /api/admin/rent-reviews — current tenancies with when their rent last changed, longest first.
// A Section 13 increase can take effect at most once a year, so anything over 12 months is "due".
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = svc()
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: tenancies, error }, { data: notices, error: nErr }] = await Promise.all([
    s.from('tenancies')
      .select('id, start_date, end_date, notice_received_date, rent_amount, last_rent_change_date, people!person_id(id, first_name, last_name, full_name), rooms!tenancies_room_id_fkey(name), properties!tenancies_property_id_fkey(id, name, address)')
      .lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`),
    s.from('rent_increase_notices').select('tenancy_id, effective_date, outcome, old_rent, proposed_rent, created_at').neq('outcome', 'withdrawn'),
  ])
  if (error || nErr) return NextResponse.json({ error: (error || nErr)!.message }, { status: 500 })

  const latest = new Map<string, any>()
  for (const n of notices ?? []) {
    const cur = latest.get(n.tenancy_id)
    if (!cur || (n.effective_date || '') > (cur.effective_date || '')) latest.set(n.tenancy_id, n)
  }

  const rows = (tenancies ?? []).map((t: any) => {
    const notice = latest.get(t.id)
    // "last changed" = the latest of: a recorded rent change, a Section 13 increase that has taken effect, or the
    // tenancy start. Say which, so start dates (which may be a renewal date) can be checked against emails.
    const s13 = notice?.effective_date && notice.effective_date <= today ? notice.effective_date : null
    const candidates: [string | null, 'recorded' | 'section13' | 'start'][] = [[t.last_rent_change_date, 'recorded'], [s13, 'section13'], [t.start_date, 'start']]
    const [changed, changedSource] = candidates.filter(([d]) => !!d).sort((a, b) => String(b[0]).localeCompare(String(a[0])))[0] as [string, 'recorded' | 'section13' | 'start']
    const months = Math.floor((Date.now() - new Date(changed).getTime()) / (30.44 * 86_400_000))
    const p = t.people
    return {
      tenancyId: t.id,
      tenant: [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.full_name || 'Tenant',
      personId: p?.id ?? null,
      room: t.rooms?.name ?? '',
      property: t.properties?.name || t.properties?.address || '',
      rent: Number(t.rent_amount || 0),
      lastChanged: changed,
      changedSource,
      months,
      onNotice: !!t.notice_received_date,
      pending: notice && notice.effective_date > today ? { effective: notice.effective_date, proposed: Number(notice.proposed_rent || 0) } : null,
    }
  }).sort((a, b) => a.lastChanged.localeCompare(b.lastChanged))

  return NextResponse.json({ rows })
}
