import { NextRequest, NextResponse } from 'next/server'
import { aiConfigured } from '@/lib/ai-classify'
import { scanDocument } from '@/lib/scan-engine'
import { requireAdmin } from '@/lib/adminAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60   // scanned multi-page certificates are read page by page

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  if (!aiConfigured()) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  const form = await request.formData()
  const storageUrl = form.get('storage_url') as string | null
  const file = form.get('file')
  const mimeHint = form.get('mime_type') as string | null

  let bytes: Buffer
  let mime: string

  try {
    if (storageUrl) {
      const dlRes = await fetch(storageUrl)
      if (!dlRes.ok) return NextResponse.json({ error: `Could not fetch file (${dlRes.status})` }, { status: 502 })
      bytes = Buffer.from(await dlRes.arrayBuffer())
      mime = mimeHint || dlRes.headers.get('content-type') || 'application/octet-stream'
    } else if (file instanceof Blob) {
      mime = file.type || 'application/octet-stream'
      bytes = Buffer.from(await file.arrayBuffer())
    } else {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  try {
    // knownDocType tells the engine this is a cert — use dates-only path, no classification
    const certType = (form.get('cert_type') as string | null) || 'other'
    const result = await scanDocument(bytes, mime, { knownDocType: certType as any })
    return NextResponse.json({ result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to scan document' }, { status: 500 })
  }
}
