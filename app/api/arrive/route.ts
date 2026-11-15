// /api/arrive — "I've arrived" for cleaners and contractors (14 Nov 2026, lib/access/arrival).
//   GET  ?kind=job|clean&id=           → what will happen (ok / a short-notice warning / blocked until the tenant agrees)
//   POST { kind, id, ack? }            → records the arrival and returns the key safe code (a warning must be ticked: ack)
//   POST { action: 'ask_tenant', id }  → asks the room's tenant to let the contractor in now
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSignedIn, isStaff } from '@/lib/portalAuth'
import { checkArrival, confirmArrival, askTenant, undoArrival, onMyWay, runningLate } from '@/lib/access/arrival'
import { ticketArrival, ticketOnMyWay, ticketRunningLate } from '@/lib/emergencies/engine'
import { logAudit } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'
const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const kindOf = (v: unknown) => v === 'clean' ? 'clean' as const : v === 'job' ? 'job' as const : null

export async function GET(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c || !(['cleaner', 'contractor'].includes(c.role) || isStaff(c))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const kind = kindOf(req.nextUrl.searchParams.get('kind')), id = req.nextUrl.searchParams.get('id') ?? ''
  if (!kind || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Which visit?' }, { status: 400 })
  const r = await checkArrival(svc(), { kind, id, personId: c.personId, staff: isStaff(c) })
  const { propertyId: _p, ...out } = r as any
  if (out.state === 'ok') out.keySafe = out.already ? out.keySafe : null   // the code only after "I've arrived"
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c || c.viewingAsBy || !(['cleaner', 'contractor'].includes(c.role) || isStaff(c))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const id = String(b.id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Which visit?' }, { status: 400 })
  const s = svc()
  if (b.action === 'on_my_way') {
    // an emergency job: the house hears it through the emergency (their emergency screen); otherwise the visit
    const viaEmergency = await ticketOnMyWay(s, id).catch(() => false)
    const r = viaEmergency ? { ok: true } : await onMyWay(s, { id, personId: c.personId, staff: isStaff(c) })
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: (r as any).error }, { status: 403 })
  }
  if (b.action === 'running_late') {
    const eta = new Date(String(b.eta ?? ''))
    if (Number.isNaN(eta.getTime()) || eta.getTime() < Date.now() - 5 * 60000) return NextResponse.json({ error: 'Pick when you’ll be there.' }, { status: 400 })
    const viaEmergency = await ticketRunningLate(s, id, eta.toISOString()).catch(() => false)
    const r = viaEmergency ? { ok: true } : await runningLate(s, { id, personId: c.personId, staff: isStaff(c), eta: eta.toISOString() })
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: (r as any).error }, { status: 403 })
  }
  if (b.action === 'ask_tenant') {
    const r = await askTenant(s, id, c.personId, isStaff(c))
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 403 })
  }
  const kind = kindOf(b.kind)
  if (!kind) return NextResponse.json({ error: 'Which visit?' }, { status: 400 })
  if (b.action === 'undo') {
    const r = await undoArrival(s, { kind, id, personId: c.personId, staff: isStaff(c) })
    if (r.ok && kind === 'job') await ticketArrival(s, id, false).catch(() => null)
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 400 })
  }
  const r = await confirmArrival(s, { kind, id, personId: c.personId, staff: isStaff(c), ack: b.ack === true })
  const { propertyId: _p, ...out } = r as any
  // an emergency job: "I'm here" in the app counts for the emergency too (the tenants are told; the no-show clock stops)
  if (out.state === 'ok' && kind === 'job') await ticketArrival(s, id, true).catch(() => null)
  if (out.state === 'ok') await logAudit({ userId: c.userId, action: 'arrived_key_safe', details: `${kind} ${id} — ${out.where}${out.warned ? ' (short-notice warning seen)' : ''}` } as any).catch(() => null)
  return NextResponse.json(out, { status: out.state === 'ok' || out.state === 'warn' ? 200 : 409 })
}
