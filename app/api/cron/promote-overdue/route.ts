/**
 * POST /api/cron/promote-overdue
 *
 * Promotes rent_charges from pending → overdue.
 * Runs daily via Vercel cron (see vercel.json).
 *
 * Rules:
 *   - Only affects charges in the CURRENT month or earlier
 *   - Grace period (Settings → Rent, system_settings.rent_grace_days, default 5) after the tenancy's due day
 *   - Only months from the client ledger start (before that, the previous agent collected the rent)
 *   - Only promotes status = 'pending' (not partial — partial means something was received)
 *   - Writes a payment_audit_log entry for every promotion
 *   - Safe to run multiple times — already-overdue rows are skipped
 *
 * This mirrors industry standard: lettings software (Arthur, Fixflo, re-leased)
 * all use a configurable grace period before flagging overdue.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ledgerStart, rentGraceDays } from '@/lib/clientLedger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Verify Vercel cron secret or internal call
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [GRACE_DAYS, start] = await Promise.all([rentGraceDays(service), ledgerStart(service)])
  const todayIso = new Date().toISOString().slice(0, 10)
  const graceCutoff = new Date(todayIso + 'T00:00:00Z')
  graceCutoff.setUTCDate(graceCutoff.getUTCDate() - GRACE_DAYS)
  const cutoffIso = graceCutoff.toISOString().split('T')[0]

  // Pending charges from the ledger start whose month began on or before the cutoff. charge_month is the 1st;
  // each is then checked against its tenancy's own due day below.
  const { data: fetched, error: fetchErr } = await service
    .from('rent_charges')
    .select('id, room_id, property_id, charge_month, amount_due, amount_received, voided')
    .eq('status', 'pending')
    .gte('charge_month', start)
    .lte('charge_month', cutoffIso)
  const roomIds = [...new Set((fetched ?? []).map((c: any) => c.room_id).filter(Boolean))]
  const { data: tens } = roomIds.length
    ? await service.from('tenancies').select('room_id, start_date, end_date, rent_due_day').in('room_id', roomIds)
    : { data: [] as any[] }
  const dueDate = (c: any) => {
    const m = String(c.charge_month).slice(0, 7)
    const t = ((tens ?? []) as any[]).filter(t => t.room_id === c.room_id && (!t.start_date || t.start_date <= `${m}-31`) && (!t.end_date || t.end_date >= `${m}-01`))
      .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0]
    const day = Math.min(Math.max(Number(t?.rent_due_day) || 1, 1), 28)
    const due = `${m}-${String(day).padStart(2, '0')}`
    return t?.start_date && t.start_date > due ? String(t.start_date).slice(0, 10) : due   // first, part month: due on move-in
  }
  const charges = (fetched ?? []).filter((c: any) => !c.voided && dueDate(c) <= cutoffIso)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!charges.length) {
    return NextResponse.json({ ok: true, promoted: 0, message: 'No pending charges to promote' })
  }

  const now = new Date().toISOString()
  let promoted = 0
  const errors: string[] = []

  for (const charge of charges) {
    const { error: updateErr } = await service
      .from('rent_charges')
      .update({ status: 'overdue' })
      .eq('id', charge.id)
      .eq('status', 'pending') // idempotent guard

    if (updateErr) {
      errors.push(`charge ${charge.id}: ${updateErr.message}`)
      continue
    }

    // Audit trail
    await service.from('payment_audit_log').insert({
      rent_charge_id: charge.id,
      action: 'promoted_overdue',
      performed_at: now,
      old_value: { status: 'pending' },
      new_value: { status: 'overdue' },
      note: `Auto-promoted by cron after ${GRACE_DAYS}-day grace period (due ${dueDate(charge)})`,
    })

    promoted++
  }

  return NextResponse.json({
    ok: true,
    promoted,
    checked: charges.length,
    cutoff: cutoffIso,
    grace_days: GRACE_DAYS,
    errors: errors.length ? errors : undefined,
    message: `${promoted} charge${promoted !== 1 ? 's' : ''} promoted to overdue`,
  })
}

// Vercel Cron calls scheduled jobs with GET — without this the job was rejected (405) and never ran.
export const GET = POST
