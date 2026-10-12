// A let-only landlord's room list (lib/letOnly/roomList). Office staff (administrators and lettings).
// POST { action: 'read', text?, image?: { mime, base64 } } → { groups } — read and matched to houses, nothing saved
// POST { action: 'resolve', rows }                        → { groups } — match again (after a house was added)
// POST { action: 'apply', groups: [{ propertyId, rows }] } → { saved: [{ property, changes }] }
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/portalAuth'
import { readRoomList, resolveRows, applyRoomList } from '@/lib/letOnly/roomList'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

export async function POST(req: NextRequest) {
  const me = await requireStaff(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  try {
    if (b.action === 'read') {
      const image = b.image && IMAGE_TYPES.includes(b.image.mime) && typeof b.image.base64 === 'string' && b.image.base64.length < 7_000_000 ? b.image : undefined
      if (!image && !String(b.text ?? '').trim()) return NextResponse.json({ error: 'Paste the list or add a screenshot of it.' }, { status: 400 })
      const rows = await readRoomList({ text: b.text, image })
      if (!rows.length) return NextResponse.json({ error: 'No rooms could be read from that. Try a clearer screenshot, or paste the text.' }, { status: 422 })
      return NextResponse.json({ groups: await resolveRows(s, rows) })
    }
    if (b.action === 'resolve') return NextResponse.json({ groups: await resolveRows(s, Array.isArray(b.rows) ? b.rows : []) })
    if (b.action === 'apply') {
      const saved: { property: string; changes: string[] }[] = []
      for (const g of (Array.isArray(b.groups) ? b.groups : []).slice(0, 30)) {
        if (typeof g?.propertyId !== 'string' || !Array.isArray(g.rows)) continue
        const { data: p } = await s.from('properties').select('name').eq('id', g.propertyId).maybeSingle()
        saved.push({ property: String(p?.name ?? '').split('\n')[0], changes: await applyRoomList(s, g.propertyId, g.rows.slice(0, 60), me.email) })
      }
      return NextResponse.json({ saved })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
