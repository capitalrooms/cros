import { NextRequest, NextResponse } from 'next/server'
import { extractStatement, aiConfigured } from '@/lib/ai-statement'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: 'AI reading is not set up yet — an ANTHROPIC_API_KEY needs to be configured. You can still enter the statement manually.' },
      { status: 503 }
    )
  }

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const mime = file.type || 'application/octet-stream'
  const bytes = Buffer.from(await file.arrayBuffer())

  try {
    const data = await extractStatement(bytes, mime)
    return NextResponse.json({ result: data })
  } catch (err: any) {
    const status = err?.status || 500
    const message =
      status === 401 ? 'The ANTHROPIC_API_KEY is invalid.' : err?.message || 'Failed to read the statement.'
    return NextResponse.json({ error: message }, { status })
  }
}
