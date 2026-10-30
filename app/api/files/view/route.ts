// GET /api/files/view?b&p&e&s[&d] — opens a stored file that's encrypted at rest (lib/files/fileCrypt): checks the
// link's signature and expiry (made only by our server, for someone already allowed to see the file), reads the file
// with the service key, decrypts it and hands it over. Never cached.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { checkViewLink, openBytes } from '@/lib/files/fileCrypt'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const TYPES: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' }

export async function GET(req: NextRequest) {
  const ok = checkViewLink(req.nextUrl.searchParams)
  if (!ok) return NextResponse.json({ error: 'This link has expired — open the file again from CROS.' }, { status: 403 })
  const { data, error } = await createServiceClient().storage.from(ok.bucket).download(ok.path)
  if (error || !data) return NextResponse.json({ error: 'File not found' }, { status: 404 })
  let bytes: Buffer
  try { bytes = openBytes(Buffer.from(await data.arrayBuffer())) } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not open the file' }, { status: 500 })
  }
  const ext = ok.path.split('.').pop()?.toLowerCase() ?? ''
  const name = (ok.download || ok.path.split('/').pop() || 'file').replace(/[^\w.\- ]+/g, '_')
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'Content-Disposition': `${ok.download ? 'attachment' : 'inline'}; filename="${name}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
