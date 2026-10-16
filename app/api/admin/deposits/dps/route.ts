// POST /api/admin/deposits/dps
//   { action: 'read', text }          → each DPS deposit with the tenancy it most likely belongs to (nothing saved)
//   { action: 'confirm', items: [{ tenancyId, ref, protectedOn }] } → records the protection on those tenancies
// See lib/deposits/dpsImport.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { readDpsCsv, readDpsWithAi, matchDps, isoDate } from '@/lib/deposits/dpsImport'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient() as any
  const b = await req.json().catch(() => ({}))

  if (b.action === 'read') {
    const text = String(b.text ?? '').trim()
    if (text.length < 10) return NextResponse.json({ error: 'Choose the DPS file, or paste the list from the DPS website.' }, { status: 400 })
    let lines = readDpsCsv(text), how = 'file'
    if (!lines?.length) { try { lines = await readDpsWithAi(text); how = 'ai' } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read it' }, { status: 500 }) } }
    if (!lines.length) return NextResponse.json({ error: 'No deposits found in that — is it the DPS deposit list?' }, { status: 400 })
    const matches = await matchDps(s, lines)
    // tenancies with a deposit not yet recorded as protected, for matching a line by hand
    const { data: open } = await s.from('tenancies').select('id, deposit_amount, rooms(name), properties(name, is_demo), people!person_id(first_name, last_name)')
      .gt('deposit_amount', 0).is('deposit_scheme_ref', null).is('let_cancelled_at', null)
    const choices = ((open ?? []) as any[]).filter(t => !t.properties?.is_demo).map(t => ({ id: t.id, label: `${[t.people?.first_name, t.people?.last_name].filter(Boolean).join(' ')} — ${t.rooms?.name ? `${t.rooms.name}, ` : ''}${String(t.properties?.name ?? '').split('\n')[0]} (£${Number(t.deposit_amount).toFixed(2)})` }))
      .sort((a, b2) => a.label.localeCompare(b2.label))
    return NextResponse.json({ matches, choices, how })
  }

  if (b.action === 'confirm') {
    const items = (Array.isArray(b.items) ? b.items : []).filter((x: any) => x?.tenancyId && String(x.ref ?? '').trim())
    if (!items.length) return NextResponse.json({ error: 'Nothing ticked.' }, { status: 400 })
    let done = 0; const failed: string[] = []
    for (const x of items) {
      const { error } = await s.from('tenancies').update({
        deposit_scheme: 'DPS custodial', deposit_scheme_ref: String(x.ref).trim().slice(0, 60), deposit_protected_at: isoDate(x.protectedOn),
      }).eq('id', x.tenancyId)
      if (error) failed.push(`${x.ref}: ${error.message}`); else done++
    }
    await s.from('audit_logs').insert({ user_id: admin.personId, action: 'deposits_dps_import', details: `${done} deposit protection record(s) brought in from the DPS list` })
    return NextResponse.json({ ok: true, done, failed })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
