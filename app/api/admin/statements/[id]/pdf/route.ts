// GET /api/admin/statements/[id]/pdf — a saved landlord statement as a PDF.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { loadStatementForPdf, renderStatementPdf } from '@/lib/statements/pdf'
import { contentDisposition } from '@/lib/contentDisposition'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const data = await loadStatementForPdf(s, id)
  if (!data) return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
  const pdf = await renderStatementPdf(data)
  const name = `Statement ${data.statement.statement_reference} ${data.property?.name || ''}`.trim().replace(/[\\/:*?"<>|]/g, '')
  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(`${name}.pdf`, 'inline') },
  })
}
