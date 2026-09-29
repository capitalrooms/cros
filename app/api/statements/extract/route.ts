import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractStatement, aiConfigured } from '@/lib/ai-statement'
import { requireAdmin } from '@/lib/adminAuth'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

// Allow up to 10 MB per file (PDFs can be multi-page scans)
export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
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
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: properties } = await supabase
    .from('properties')
    .select('id, name, address, postcode, landlord_id')
    .order('name')

  const props = sortPropertiesNumerically((properties || []) as any[]) as any[]

  // For the page's sense checks: each property's rent roll on the statement date (sum of the tenancies running
  // then), and which properties already have a statement in that month.
  const on = /^\d{4}-\d{2}-\d{2}/.test(extracted.period_start || '') ? extracted.period_start.slice(0, 10)
    : /^\d{4}-\d{2}-\d{2}/.test(extracted.statement_date || '') ? extracted.statement_date.slice(0, 10) : null
  const rentRolls: Record<string, number> = {}
  const alreadyThisMonth: string[] = []
  if (on) {
    const month = on.slice(0, 7)
    const [y, m] = month.split('-').map(Number)
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    const [{ data: lets }, { data: sts }] = await Promise.all([
      supabase.from('tenancies').select('property_id, rent_amount').lte('start_date', on).or(`end_date.is.null,end_date.gte.${on}`),
      supabase.from('landlord_statements').select('property_id').gte('statement_date', `${month}-01`).lte('statement_date', monthEnd),
    ])
    for (const t of (lets ?? []) as any[]) if (t.property_id) rentRolls[t.property_id] = (rentRolls[t.property_id] ?? 0) + Number(t.rent_amount || 0)
    for (const x of (sts ?? []) as any[]) if (x.property_id) alreadyThisMonth.push(x.property_id)
  }

  // Match the statement's address to a property. Common words ("Road", "London") don't count, and the house
  // number must agree — otherwise "71 Alloa Road" scores the same against "20 Chobham Road" as against itself.
  const STOP = new Set(['road', 'rd', 'street', 'st', 'avenue', 'ave', 'close', 'lane', 'london', 'the', 'flat', 'room', 'and', 'of'])
  const words = (v: string) => (v || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  const nums = (v: string) => words(v).filter(w => /^\d+[a-z]?$/.test(w))   // "Flat 4, 44 Claverton Street" → 4, 44
  function score(candidate: string, found: string) {
    const want = words(found).filter(w => !STOP.has(w) && !/^\d/.test(w) && w.length > 1)
    if (!want.length) return 0
    const have = new Set(words(candidate))
    const a = nums(candidate), b = nums(found)
    const shared = a.some(n => b.includes(n))
    if (a.length && b.length && !shared) return 0
    const hits = want.filter(w => have.has(w)).length
    return hits / want.length + (shared ? 0.25 : 0)
  }
  const scored = props.map(p => ({
    ...p,
    _score: Math.max(score(p.name || '', extracted.property_address), score(p.address || '', extracted.property_address)),
  })).sort((a, b) => b._score - a._score)

  const bestMatch = scored[0]?._score >= 0.6 && scored[0]._score > (scored[1]?._score ?? 0) ? scored[0] : null

  // The total-deductions column mixes fees and expenses; when the fee total doesn't add up but the per-room
  // fees do, use those (e.g. £866.50 read as fees = £586.50 of fees + £280 of expenses).
  const r2 = (n: number) => Math.round(n * 100) / 100
  const charges = extracted.property_charges || (extracted.expenses ?? []).reduce((t, e) => t + (e.amount || 0), 0)
  const roomFees = r2((extracted.rooms ?? []).reduce((t, r) => t + (r.management_fee || 0), 0))
  const adds = (fees: number) => Math.abs(extracted.gross_rent - fees - charges - extracted.net_to_landlord) < 1
  if (!adds(extracted.management_fees)) {
    if (roomFees > 0 && adds(roomFees)) extracted.management_fees = roomFees
    else if (adds(r2(extracted.management_fees - charges))) extracted.management_fees = r2(extracted.management_fees - charges)
  }

  return NextResponse.json({
    extracted,
    matched_property: bestMatch
      ? { id: bestMatch.id, name: bestMatch.name, address: bestMatch.address, landlord_id: bestMatch.landlord_id }
      : null,
    properties: props.map(p => ({ id: p.id, name: p.name, address: p.address, landlord_id: p.landlord_id })),
    rent_rolls: rentRolls,
    already_this_month: alreadyThisMonth,
  })
}
