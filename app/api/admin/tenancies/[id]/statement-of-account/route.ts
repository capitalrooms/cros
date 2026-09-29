// GET /api/admin/tenancies/[id]/statement-of-account — the tenant's statement of account as a PDF (lib/finance/tenantAccount)
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { tenantAccount } from '@/lib/finance/tenantAccount'
import { renderListPdf } from '@/lib/export/listPdf'
import { contentDisposition } from '@/lib/contentDisposition'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const acc = await tenantAccount(createServiceClient(), id)
  if (!acc) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  const owed = acc.balance > 0.004 ? `Balance owed £${acc.balance.toFixed(2)}` : acc.balance < -0.004 ? `In credit £${(-acc.balance).toFixed(2)}` : 'Nothing owed'
  const pdf = await renderListPdf({
    title: 'Statement of account',
    subtitle: `${acc.tenant} · ${acc.room}, ${acc.property}${acc.paymentRef ? ` · payment reference ${acc.paymentRef}` : ''} · ${owed}`,
    columns: [{ key: 'date', label: 'Date' }, { key: 'details', label: 'Details' }, { key: 'reference', label: 'Ref' }, { key: 'charged', label: 'Charged', money: true }, { key: 'paid', label: 'Paid', money: true }, { key: 'balance', label: 'Balance', money: true }],
    rows: acc.lines as any[], totals: { details: 'Totals', charged: acc.charged, paid: acc.paid, balance: acc.balance },
  })
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(`Statement of account - ${acc.tenant}.pdf`) } })
}
