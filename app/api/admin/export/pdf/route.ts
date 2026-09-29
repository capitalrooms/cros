// POST /api/admin/export/pdf { title, subtitle?, columns, rows, totals?, filename? } → the list as a PDF
// (lib/export/listPdf). The page sends exactly what it is showing, so the PDF always matches the screen.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { renderListPdf, type ListColumn } from '@/lib/export/listPdf'
import { contentDisposition } from '@/lib/contentDisposition'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const columns: ListColumn[] = Array.isArray(b.columns) ? b.columns.slice(0, 20).map((c: any) => ({ key: String(c.key), label: String(c.label ?? c.key), align: c.align === 'right' ? 'right' : c.align === 'left' ? 'left' : undefined, money: !!c.money })) : []
  const rows = Array.isArray(b.rows) ? b.rows.slice(0, 5000) : []
  if (!columns.length) return NextResponse.json({ error: 'Nothing to export' }, { status: 400 })
  const { data: me } = await createServiceClient().from('people').select('first_name, last_name').eq('id', admin.personId).maybeSingle()
  const pdf = await renderListPdf({
    title: String(b.title || 'Export').slice(0, 120), subtitle: b.subtitle ? String(b.subtitle).slice(0, 300) : undefined,
    columns, rows, totals: b.totals && typeof b.totals === 'object' ? b.totals : undefined,
    generatedBy: [me?.first_name, me?.last_name].filter(Boolean).join(' ') || admin.email,
  })
  const name = `${String(b.filename || b.title || 'export').replace(/[^\w\s.-]/g, '').trim() || 'export'}.pdf`
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(name) } })
}
