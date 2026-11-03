// /api/admin/landlord-addresses — landlords' correspondence addresses from their statements (lib/landlords/addressFromStatements)
//   GET                                   each landlord's latest statement PDF to read
//   POST { action: 'read', landlordId }   read the address off it (nothing saved)
//   POST { action: 'save', landlordId, address }  put it on the landlord's profile (logged)
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { addressCandidates, readAddress } from '@/lib/landlords/addressFromStatements'
import { logAudit } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ landlords: await addressCandidates(createServiceClient() as any) })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  if (b.action === 'read') {
    const c = (await addressCandidates(s as any)).find(x => x.landlordId === b.landlordId)
    if (!c) return NextResponse.json({ error: 'No statement found for that landlord' }, { status: 404 })
    try { return NextResponse.json({ ...(await readAddress(c)), statement: c.statement }) }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Couldn’t read it' }, { status: 500 }) }
  }
  if (b.action === 'save') {
    const address = String(b.address ?? '').trim()
    if (!address) return NextResponse.json({ error: 'No address to save' }, { status: 400 })
    const { data: before } = await s.from('people').select('home_address').eq('id', String(b.landlordId)).maybeSingle()
    const { error } = await s.from('people').update({ home_address: address }).eq('id', String(b.landlordId)).eq('role', 'landlord')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit({ userId: admin.personId, action: 'landlord_address_from_statement', table: 'people', recordId: String(b.landlordId), details: JSON.stringify({ before: (before as any)?.home_address ?? null, after: address }) }).catch(() => null)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
