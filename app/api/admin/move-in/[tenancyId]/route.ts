// GET   /api/admin/move-in/[tenancyId] — everything for the move-in pack screen: figures, documents, packs sent
// PATCH /api/admin/move-in/[tenancyId] — save the move-in figures on the tenancy
//   { start_date?, rent_amount?, rent_due_day?, deposit_amount?, holding_deposit_received?, payment_reference? }
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { getNewTenantCommsLive } from '@/lib/comms'
import { loadPackContext, moneySummary } from '@/lib/movein/pack'
import { svc, packLink, defaultPackSubject, defaultPackMessage } from '@/lib/movein/email'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tenancyId } = await params
  const s = svc()
  const ctx = await loadPackContext(s, tenancyId)
  if (!ctx) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })

  const { data: packs, error } = await s.from('tenancy_packs')
    .select('id, token, tenant_email, status, sent_at, first_viewed_at, confirmed_at, confirmed_name, tenant_questions, documents, tenancy_pack_events(event, document_key, at)')
    .eq('tenancy_id', tenancyId).order('sent_at', { ascending: false })
  const tableMissing = !!error && (error.code === 'PGRST205' || error.code === '42P01')

  return NextResponse.json({
    context: { ...ctx, summary: moneySummary(ctx) },
    packs: (packs ?? []).map((p: any) => ({ ...p, link: packLink(p.token) })),
    commsLive: await getNewTenantCommsLive(),   // move-in packs go to new tenants: allowed while tenant messages are paused
    defaults: { subject: defaultPackSubject(ctx), message: defaultPackMessage(ctx) },
    setupNeeded: tableMissing ? 'Run migration 187 in Supabase to send packs.' : null,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tenancyId } = await params
  const b = await req.json().catch(() => ({}))
  const num = (v: unknown) => (v === '' || v == null ? null : Number(v))
  const update: Record<string, unknown> = {}
  if ('start_date' in b) {
    if (b.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(b.start_date)) return NextResponse.json({ error: 'Move-in date must be a date.' }, { status: 400 })
    update.start_date = b.start_date || null
  }
  for (const k of ['rent_amount', 'deposit_amount', 'holding_deposit_received'] as const) {
    if (k in b) {
      const n = num(b[k])
      if (n != null && (!isFinite(n) || n < 0)) return NextResponse.json({ error: `${k.replace(/_/g, ' ')} must be a number.` }, { status: 400 })
      update[k] = n
    }
  }
  if ('rent_due_day' in b) {
    const d = num(b.rent_due_day)
    if (d == null || d < 1 || d > 28 || !Number.isInteger(d)) return NextResponse.json({ error: 'Rent day must be between the 1st and the 28th.' }, { status: 400 })
    update.rent_due_day = d
  }
  if ('payment_reference' in b) update.payment_reference = String(b.payment_reference || '').trim().toUpperCase() || null
  if (!Object.keys(update).length) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })

  const { error } = await svc().from('tenancies').update(update).eq('id', tenancyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
