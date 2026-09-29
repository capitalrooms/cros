// GET /api/pack/[token]/file/[key] — open one document from the pack (logged as evidence it was opened).
// Generated documents (agreement, check-in balance) are the exact files stored when the pack was sent.
import { NextRequest, NextResponse } from 'next/server'
import { PORTAL_URL } from '@/lib/emailWrapper'
import { svc, PACK_BUCKET } from '@/lib/movein/email'
import { packByToken, logPackEvent } from '@/lib/movein/public'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; key: string }> }) {
  const { token, key } = await params
  const { pack } = await packByToken(token)
  // Opened from an email or a new tab: never show raw errors — send them to the pack page, which explains
  // (e.g. "this pack has been replaced — use the newest link").
  const back = NextResponse.redirect(`${PORTAL_URL}/pack/${encodeURIComponent(token)}`, 302)
  if (!pack || pack.status === 'withdrawn') return back
  const doc = pack.documents.find(d => d.key === key)
  if (!doc || !doc.available) return back

  await logPackEvent(req, pack.id, 'opened_document', key)
  const download = req.nextUrl.searchParams.get('download') === '1'

  if (doc.path) {
    // Hand the browser a short-lived signed link to the stored file rather than streaming it through this
    // function — the host caps function responses at ~4.5 MB and certificates (EICRs especially) are often bigger.
    const name = `${doc.label} - ${pack.summary.address || ''}.pdf`.replace(/[\\/:*?"<>|]/g, '')
    const { data, error } = await svc().storage.from(PACK_BUCKET).createSignedUrl(doc.path, 3600, download ? { download: name } : undefined)
    if (!error && data?.signedUrl) return NextResponse.redirect(data.signedUrl, 302)
    if (!doc.url) return back
  }
  const url = doc.url?.startsWith('/') ? `${PORTAL_URL}${doc.url}` : doc.url
  if (!url) return back
  return NextResponse.redirect(url, 302)
}
