import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { extractStatement, aiConfigured } from '@/lib/ai-statement'

// Allow up to 10 MB per file (PDFs can be multi-page scans)
export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const mime = file.type || 'application/pdf'

  let extracted
  try {
    extracted = await extractStatement(bytes, mime)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'AI extraction failed' }, { status: 500 })
  }

  // Auto-match property by address — fuzzy compare the extracted address against the DB
  const supabase = await createClient()
  const { data: properties } = await supabase
    .from('properties')
    .select('id, name, address, postcode, landlord_id')
    .order('name')

  const props = properties || []

  // Score each property: normalise both strings, award points for matching tokens
  function normalise(s: string) {
    return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  }
  function score(dbAddr: string, extracted: string) {
    const a = normalise(dbAddr)
    const b = normalise(extracted)
    if (!a || !b) return 0
    if (a === b) return 1
    const tokensA = new Set(a.split(' '))
    const tokensB = b.split(' ')
    const hits = tokensB.filter(t => t.length > 2 && tokensA.has(t)).length
    return hits / Math.max(tokensA.size, tokensB.length)
  }

  const scored = props.map(p => ({
    ...p,
    _score: score(p.address || '', extracted.property_address),
  })).sort((a, b) => b._score - a._score)

  const bestMatch = scored[0]?._score > 0.3 ? scored[0] : null

  return NextResponse.json({
    extracted,
    matched_property: bestMatch
      ? { id: bestMatch.id, name: bestMatch.name, address: bestMatch.address, landlord_id: bestMatch.landlord_id }
      : null,
    properties: props.map(p => ({ id: p.id, name: p.name, address: p.address, landlord_id: p.landlord_id })),
  })
}
