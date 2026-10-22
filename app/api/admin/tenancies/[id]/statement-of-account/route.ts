// GET /api/admin/tenancies/[id]/statement-of-account — the tenant's statement of account as a PDF (lib/finance/tenantAccount)
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { tenantAccount } from '@/lib/finance/tenantAccount'
import { renderTenantAccountPdf } from '@/lib/finance/tenantAccountPdf'
import { contentDisposition } from '@/lib/contentDisposition'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const acc = await tenantAccount(createServiceClient(), id)
  if (!acc) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  const pdf = await renderTenantAccountPdf(acc)
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(`Statement of account - ${acc.tenant}.pdf`) } })
}
