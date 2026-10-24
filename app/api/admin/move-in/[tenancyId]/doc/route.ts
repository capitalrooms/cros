// GET /api/admin/move-in/[tenancyId]/doc?key=agreement|check_in|prescribed_info&parking=1 — preview a generated document
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { contentDisposition } from '@/lib/contentDisposition'
import { loadPackContext, renderAgreement, renderCheckIn, packFileName, GENERATED_KEYS, type GeneratedKey } from '@/lib/movein/pack'
import { renderDpsFormFor } from '@/lib/deposits/dpsForm'
import { svc } from '@/lib/movein/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tenancyId } = await params
  const key = req.nextUrl.searchParams.get('key')
  if (!GENERATED_KEYS.includes(key as GeneratedKey)) return NextResponse.json({ error: 'Unknown document' }, { status: 400 })
  const ctx = await loadPackContext(svc(), tenancyId)
  if (!ctx) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  if (!ctx.startDate || !ctx.rentMonthly) return NextResponse.json({ error: 'Add the move-in date and rent first.' }, { status: 400 })
  let pdf: Buffer
  try {
    pdf = key === 'agreement' ? await renderAgreement(ctx, { parking: req.nextUrl.searchParams.get('parking') === '1' })
      : key === 'prescribed_info' ? await renderDpsFormFor(svc(), tenancyId) : await renderCheckIn(ctx)
  } catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Could not make the document' }, { status: 400 }) }
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(packFileName(ctx, key as GeneratedKey), 'inline') },
  })
}
