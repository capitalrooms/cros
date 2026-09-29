// Expense invoices live in the private "finance-docs" bucket — never a public link.
// POST { fileName }         → { path, token, signedUrl } to upload straight from the browser (no size limit from Vercel)
// GET  ?expense_id=…        → { url } a link that works for 2 minutes, to open the invoice
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'
const OK = /\.(pdf|jpe?g|png|heic|webp|docx?|xlsx?)$/i

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { fileName = '' } = await req.json().catch(() => ({}))
  if (!OK.test(fileName)) return NextResponse.json({ error: 'Upload a PDF, photo, Word or Excel file' }, { status: 400 })
  const ext = fileName.split('.').pop()!.toLowerCase()
  const path = `invoices/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`
  const { data, error } = await createServiceClient().storage.from('finance-docs').createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not prepare the upload' }, { status: 500 })
  return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl })
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('expense_id')
  const s = createServiceClient()
  const { data: e } = await s.from('recharge_expenses').select('invoice_path, invoice_name').eq('id', id ?? '').maybeSingle()
  if (!e?.invoice_path) return NextResponse.json({ error: 'No invoice on this expense' }, { status: 404 })
  const { data, error } = await s.storage.from('finance-docs').createSignedUrl(e.invoice_path, 120, { download: e.invoice_name || undefined })
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not open the invoice' }, { status: 500 })
  return NextResponse.json({ url: data.signedUrl })
}
