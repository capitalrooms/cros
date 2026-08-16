import { NextRequest, NextResponse } from 'next/server'
import { extractDocument, ExtractedDocument } from '@/lib/ai-document'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/documents/extract
 *
 * Extract data from an uploaded document (PDF or image).
 * Returns the extracted data + confidence score.
 * If ANTHROPIC_API_KEY not set, returns a graceful message.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const mimeType = file.type

    // If API key not configured, degrade gracefully
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          error: 'AI extraction not configured',
          message: 'Set ANTHROPIC_API_KEY in Vercel environment to enable document reading',
          result: null,
        },
        { status: 503 }
      )
    }

    const result: ExtractedDocument = await extractDocument(bytes, mimeType)

    // Return the extracted data + a "pending" flag if property_address is provided but empty
    return NextResponse.json({
      success: true,
      result,
      needsPropertyApproval: !result.property_address || result.confidence < 0.6,
    })
  } catch (err: any) {
    console.error('Document extraction error:', err)
    return NextResponse.json(
      {
        error: err?.message || 'Extraction failed',
        details: err?.toString?.(),
      },
      { status: 500 }
    )
  }
}
