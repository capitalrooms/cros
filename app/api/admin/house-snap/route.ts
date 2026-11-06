// "Add from photos" (6 Nov 2026 — lib/house/snap). The photo is read and then forgotten: only what's read, once the
// office approves it, is kept.
//   POST { action: 'read', image (base64), mime }            → { snap, suggestion }   one photo at a time
//   POST { action: 'matches', propertyId, appliance }         → { matches }   expenses that could be when it was bought
//   POST { action: 'apply', propertyId, items: Approved[] }   → { done }      into the house; new appliances' care guides
//                                                               are then researched in the background (lib/house/careGuide)
import { NextRequest, NextResponse, after } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { readSnap, suggestHouse, purchaseMatches, applySnaps, type Approved } from '@/lib/house/snap'
import { researchAndSave } from '@/lib/house/careGuide'

export const dynamic = 'force-dynamic'
export const maxDuration = 300   // the care guides are researched after the reply (after()), up to a minute each
const UUID = /^[0-9a-f-]{36}$/i

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  try {
    if (b.action === 'read') {
      const bytes = Buffer.from(String(b.image ?? ''), 'base64')
      if (bytes.length < 200) return NextResponse.json({ error: 'That photo didn’t come through' }, { status: 400 })
      if (bytes.length > 4 * 1024 * 1024) return NextResponse.json({ error: 'That photo is too large' }, { status: 413 })
      const snap = await readSnap(bytes, String(b.mime ?? 'image/jpeg'))
      return NextResponse.json({ snap, suggestion: await suggestHouse(s as any, snap) })
    }
    if (b.action === 'matches') {
      if (!UUID.test(String(b.propertyId)) || !b.appliance?.kind) return NextResponse.json({ matches: [] })
      return NextResponse.json({ matches: await purchaseMatches(s as any, b.propertyId, b.appliance) })
    }
    if (b.action === 'apply') {
      if (!UUID.test(String(b.propertyId))) return NextResponse.json({ error: 'Choose the house' }, { status: 400 })
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 60) as Approved[]
      if (!items.length) return NextResponse.json({ error: 'Nothing ticked to add' }, { status: 400 })
      const r = await applySnaps(s as any, b.propertyId, items, caller.email)
      // each new appliance: its care guide researched in the background — ready to check on the house in a few minutes
      if (r.applianceIds.length) after(async () => { for (const id of r.applianceIds) await researchAndSave(s as any, id) })
      return NextResponse.json({ ok: true, done: r.done, researching: r.applianceIds.length })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Something went wrong' }, { status: 500 }) }
}
