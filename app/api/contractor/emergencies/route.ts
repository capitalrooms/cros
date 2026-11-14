// GET /api/contractor/emergencies — emergencies this contractor has been asked to attend and hasn't answered yet, while
// they're still open (14 Nov 2026, Harry: "Alice reported an emergency … it didn't appear in my screen"). Shown at the
// top of the contractor app. Once someone is chosen, it's stood down or closed, it drops off — nobody sees yesterday's.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSignedIn } from '@/lib/portalAuth'
import { KINDS } from '@/lib/emergencies/guide'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c || c.role !== 'contractor') return NextResponse.json({ items: [] })
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data } = await s.from('emergency_responses').select('token, answer, stood_down_at, emergencies!inner(id, kind, title, status, window_ends_at, properties(name, postcode))')
    .eq('contractor_id', c.personId).is('answer', null).is('stood_down_at', null).eq('emergencies.status', 'collecting')
  const items = ((data ?? []) as any[]).map(r => ({
    token: r.token, label: (KINDS as any)[r.emergencies.kind]?.label ?? r.emergencies.title,
    area: String(r.emergencies.properties?.postcode ?? '').split(' ')[0] || 'London', closes: r.emergencies.window_ends_at,
  }))
  return NextResponse.json({ items })
}
