// /api/admin/management-agreements — the saved management agreements (migration 201).
//   GET                         → { agreements } newest first
//   GET ?id=…                   → { agreement } with its form, to reopen and edit
//   GET ?id=…&pdf=view|download → { url } a 5-minute link to the latest version's PDF
//   DELETE ?id=…                → hides it from the list; the record and PDF are kept
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
const missing = (e: { message?: string } | null) => !!e && /management_agreements/.test(e.message ?? '')

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const { data, error } = await s.from('management_agreements').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    const pdf = req.nextUrl.searchParams.get('pdf')
    if (pdf) {
      if (!data.pdf_path) return NextResponse.json({ error: 'No PDF saved for this one' }, { status: 404 })
      const name = `Management Agreement - ${(data.client_name || 'Client').replace(/[^a-zA-Z0-9 &'-]/g, '')} v${data.version}.pdf`
      const { data: signed, error: e } = await s.storage.from('valuations').createSignedUrl(data.pdf_path, 300, pdf === 'download' ? { download: name } : undefined)
      if (e || !signed) return NextResponse.json({ error: 'The PDF could not be opened' }, { status: 500 })
      return NextResponse.json({ url: signed.signedUrl })
    }
    return NextResponse.json({ agreement: data })
  }
  const { data, error } = await s.from('management_agreements')
    .select('id, agreement_type, client_name, properties, version, created_at, updated_at, updated_by, onboarding_id')
    .is('deleted_at', null).order('updated_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json(missing(error) ? { agreements: [], setupNeeded: true } : { error: error.message }, { status: missing(error) ? 200 : 500 })
  return NextResponse.json({ agreements: data })
}

export async function DELETE(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  const { data, error } = await createServiceClient().from('management_agreements')
    .update({ deleted_at: new Date().toISOString(), deleted_by: caller.email }).eq('id', id).is('deleted_at', null).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
