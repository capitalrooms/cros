// /api/admin/cleaner/regular — each house's regular cleaner (migration 243, 24 Oct 2026), on the Cleaning screen.
//   GET                                              → { ready, houses: [{ id, name, regularCleanerId, openCleans }], cleaners }
//   POST { propertyId, cleanerId | null, handOver }  → choose (or clear) the house's cleaner; handOver also gives them
//        the house's open move-out cleans that nobody has accepted yet and its upcoming cleans
// Office staff with Maintenance (lib/access/areas: /api/admin/cleaner).
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { displayName, isTestEmail } from '@/lib/people'

export const dynamic = 'force-dynamic'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient()
  const [withCol, { data: people }, { data: moveOuts }, { data: cleans }] = await Promise.all([
    s.from('properties').select('id, name, regular_cleaner_id').order('name'),
    s.from('people').select('id, salutation, first_name, last_name, full_name, email').eq('role', 'cleaner'),
    s.from('assigned_jobs').select('property_id').eq('status', 'pending'),
    s.from('cleans').select('property_id').gte('clean_date', today()).not('status', 'in', '("completed","cancelled")'),
  ])
  // before migration 243 the column isn't there: still list the houses, and say the migration is needed
  const ready = !withCol.error
  const houses = ready ? withCol.data : (await s.from('properties').select('id, name').order('name')).data
  const open = new Map<string, number>()
  for (const r of [...(moveOuts ?? []), ...(cleans ?? [])] as any[]) if (r.property_id) open.set(r.property_id, (open.get(r.property_id) ?? 0) + 1)
  return NextResponse.json({
    ready,
    houses: (houses ?? []).map((h: any) => ({ id: h.id, name: h.name, regularCleanerId: h.regular_cleaner_id ?? null, openCleans: open.get(h.id) ?? 0 })),
    cleaners: (people ?? []).map((p: any) => ({ id: p.id, name: displayName(p), test: isTestEmail(p.email) }))
      .sort((a, b) => Number(a.test) - Number(b.test) || a.name.localeCompare(b.name)),
  })
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const propertyId = String(b.propertyId ?? '')
  const cleanerId = b.cleanerId ? String(b.cleanerId) : null
  const s = createServiceClient()
  if (cleanerId) {
    const { data: c } = await s.from('people').select('id').eq('id', cleanerId).eq('role', 'cleaner').maybeSingle()
    if (!c) return NextResponse.json({ error: 'That person isn’t a cleaner in CROS.' }, { status: 400 })
  }
  const { error } = await s.from('properties').update({ regular_cleaner_id: cleanerId }).eq('id', propertyId)
  if (error) return NextResponse.json({ error: /regular_cleaner_id/.test(error.message) ? 'Run migration 243 first (it adds each house’s regular cleaner).' : error.message }, { status: 400 })

  let moved = 0
  if (b.handOver && cleanerId) {
    // only work nobody has said yes to yet — an accepted move-out clean or a done clean stays with whoever has it
    const [{ data: jobs }, { data: cl }] = await Promise.all([
      s.from('assigned_jobs').update({ cleaner_id: cleanerId }).eq('property_id', propertyId).eq('status', 'pending').or(`cleaner_id.is.null,cleaner_id.neq.${cleanerId}`).select('id'),
      s.from('cleans').update({ cleaner_id: cleanerId }).eq('property_id', propertyId).gte('clean_date', today()).not('status', 'in', '("completed","cancelled")').is('accepted_at', null).or(`cleaner_id.is.null,cleaner_id.neq.${cleanerId}`).select('id'),
    ])
    moved = (jobs?.length ?? 0) + (cl?.length ?? 0)
  }
  return NextResponse.json({ ok: true, moved })
}
