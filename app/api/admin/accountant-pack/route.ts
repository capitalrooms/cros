// GET /api/admin/accountant-pack?month=YYYY-MM — the month's pack for the accountant (lib/finance/accountantPack), as a
// zip saved privately and handed over by a 5-minute download link (packs with statement PDFs run past the 4.5 MB a
// reply can carry). ?summary=1 returns just the figures; ?link=1 returns the download link (the Finance home button).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { buildAccountantPack } from '@/lib/finance/accountantPack'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const month = req.nextUrl.searchParams.get('month') ?? ''
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Which month?' }, { status: 400 })
  const s = createServiceClient()
  const pack = await buildAccountantPack(s, month)
  if (req.nextUrl.searchParams.get('summary') === '1') return NextResponse.json(pack.summary)
  const path = `accountant-packs/${month}.zip`
  const store = s.storage.from('finance-docs')
  const up = await store.upload(path, pack.zip, { contentType: 'application/zip', upsert: true })
  if (up.error) return NextResponse.json({ error: `The pack couldn’t be saved: ${up.error.message}` }, { status: 500 })
  const { data } = await store.createSignedUrl(path, 300, { download: pack.fileName })
  if (!data?.signedUrl) return NextResponse.json({ error: 'The pack couldn’t be prepared' }, { status: 500 })
  // ?link=1: the screen asks (signed in), then downloads from the link — a plain link can't carry the sign-in
  return req.nextUrl.searchParams.get('link') === '1' ? NextResponse.json({ url: data.signedUrl, fileName: pack.fileName, summary: pack.summary }) : NextResponse.redirect(data.signedUrl)
}
