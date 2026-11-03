import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { extractReference } from '@/lib/references/extract'

// POST /api/reference-import/extract
// Body: multipart/form-data with one or more files (PDF or image)
// Returns: structured JSON of extracted reference data

export async function POST(req: NextRequest) {
  // office staff only (audit 12 Oct 2026: it was open to anyone — and it costs money to run)
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const formData = await req.formData()
  const files = formData.getAll('files') as File[]

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  let extracted: Record<string, any>
  try { extracted = await extractReference(await Promise.all(files.map(async f => ({ name: f.name, type: f.type, bytes: await f.arrayBuffer() })))) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'AI extraction failed' }, { status: 500 }) }

  return NextResponse.json({ extracted })
}
