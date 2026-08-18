import { NextRequest, NextResponse } from 'next/server'
import { classifyDocument, aiConfigured } from '@/lib/ai-classify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: 'AI is not configured yet — an ANTHROPIC_API_KEY needs to be set for this app.' },
      { status: 503 }
    )
  }

  const form = await request.formData()

  // Large files (> ~4 MB) are pre-uploaded to Supabase Storage by the browser
  // to avoid Vercel's 4.5 MB serverless body limit. The client sends a signed
  // download URL instead of the raw bytes in that case.
  const storageUrl = form.get('storage_url') as string | null
  const file = form.get('file')
  const mimeHint = form.get('mime_type') as string | null

  let bytes: Buffer
  let mime: string

  try {
    if (storageUrl) {
      const dlRes = await fetch(storageUrl)
      if (!dlRes.ok) {
        return NextResponse.json(
          { error: `Could not retrieve document from storage (${dlRes.status})` },
          { status: 502 }
        )
      }
      bytes = Buffer.from(await dlRes.arrayBuffer())
      mime = mimeHint || dlRes.headers.get('content-type') || 'application/octet-stream'
    } else if (file instanceof Blob) {
      mime = file.type || 'application/octet-stream'
      bytes = Buffer.from(await file.arrayBuffer())
    } else {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to read file' }, { status: 500 })
  }

  try {
    const data = await classifyDocument(bytes, mime)
    return NextResponse.json({ result: data })
  } catch (err: any) {
    const status = err?.status || 500
    const message =
      status === 401 ? 'The ANTHROPIC_API_KEY is invalid.' : err?.message || 'Failed to read the document.'
    return NextResponse.json({ error: message }, { status })
  }
}
