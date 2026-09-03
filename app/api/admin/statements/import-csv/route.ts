// POST /api/admin/statements/import-csv
// Accepts a CSV of historical expense line items, AI-categorises each row,
// deduplicates, and inserts into statement_line_items.
//
// Expected CSV columns (flexible header matching):
//   date | statement_ref | description | amount | property_address | landlord_email
//
// Returns: { inserted, duplicates, errors }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getCurrentUser } from '@/lib/auth'
import { PROPERTY_WIDE_CATEGORIES, ROOM_SPECIFIC_CATEGORY_TYPES, UNMATCHED_SLUG } from '@/lib/expense-categories'
import crypto from 'crypto'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function dedupHash(propertyId: string, date: string, description: string, amount: number) {
  const s = `${propertyId}|${date}|${description.trim().toLowerCase()}|${amount}`
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 32)
}

// Parse CSV text into rows
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'))
  return lines.slice(1).map(line => {
    const cells = line.match(/("(?:[^"]|"")*"|[^,]*)/g)?.map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim()) ?? line.split(',')
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']))
  }).filter(row => Object.values(row).some(v => v))
}

// Flexible column name matching
function col(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const key = Object.keys(row).find(k => k.includes(n))
    if (key && row[key]) return row[key]
  }
  return ''
}

// Batch AI categorisation — one call for up to 20 rows
async function categoriseBatch(
  rows: Array<{ description: string; amount: number }>,
  categoryList: string
): Promise<Array<{ category: string; confidence: number }>> {
  const client = new Anthropic()
  const items = rows.map((r, i) => `${i + 1}. "${r.description}" £${r.amount}`).join('\n')

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Categorise these UK HMO property expense line items. For each, pick the best slug from the list below.
If genuinely ambiguous, use: other

Categories:
${categoryList}

Items:
${items}

Respond with a JSON array only, one entry per item, in order:
[{"category":"<slug>","confidence":<0-1>}, ...]`
    }],
  })

  const text = resp.content[0]?.type === 'text' ? resp.content[0].text.trim() : '[]'
  try {
    const match = text.match(/\[[\s\S]*\]/)
    const parsed = match ? JSON.parse(match[0]) : []
    return rows.map((_, i) => ({
      category: parsed[i]?.category || UNMATCHED_SLUG,
      confidence: parsed[i]?.confidence ?? 0.5,
    }))
  } catch {
    return rows.map(() => ({ category: UNMATCHED_SLUG, confidence: 0 }))
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || !['administrator', 'admin'].includes(user.assignment?.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const propertyId = formData.get('property_id') as string | null
  const landlordId = formData.get('landlord_id') as string | null

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (!propertyId) return NextResponse.json({ error: 'property_id required' }, { status: 400 })
  if (!landlordId) return NextResponse.json({ error: 'landlord_id required' }, { status: 400 })

  const text = await file.text()
  const rows = parseCsv(text)
  if (!rows.length) return NextResponse.json({ error: 'No data rows found in CSV' }, { status: 400 })

  const supabase = serviceClient()

  // Fetch property rooms for room-specific categorisation
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, room_number')
    .eq('property_id', propertyId)

  const categoryList = [
    ...PROPERTY_WIDE_CATEGORIES.map(c => `${c.slug} — ${c.label}`),
    ...(rooms || []).flatMap(r =>
      ROOM_SPECIFIC_CATEGORY_TYPES.map(t => `${t.slug}:${r.id} — Room ${r.room_number || r.name} ${t.label}`)
    ),
    `${UNMATCHED_SLUG} — Other / Not Matched`,
  ].join('\n')

  // Parse rows into items
  const items = rows.map(row => ({
    description: col(row, 'description', 'item', 'detail', 'narrative'),
    amount: parseFloat(col(row, 'amount', 'cost', 'value', 'charge').replace(/[£,]/g, '')) || 0,
    date: col(row, 'date', 'statement_date', 'period'),
    ref: col(row, 'ref', 'reference', 'statement_ref'),
  })).filter(r => r.description && r.amount > 0)

  // Batch categorise (20 at a time)
  const BATCH = 20
  const categorised: Array<{ category: string; confidence: number }> = []
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH)
    const results = await categoriseBatch(batch, categoryList)
    categorised.push(...results)
  }

  // Build insert rows, computing dedup hashes
  const insertRows = items.map((item, i) => {
    const cat = categorised[i]
    let category = cat.category
    let room_id: string | null = null

    // Parse room-specific slug: "room_furniture:uuid"
    if (category.includes(':')) {
      const parts = category.split(':')
      category = parts[0]
      room_id = parts[1] || null
    }

    const category_type = category.startsWith('room_') ? 'room_specific' : 'property_wide'
    const dateStr = item.date ? new Date(item.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]

    return {
      property_id: propertyId,
      landlord_id: landlordId,
      statement_id: null as any, // historical: no specific statement row
      description: item.description,
      amount: item.amount,
      category,
      category_type,
      room_id,
      ai_category: cat.category,
      ai_confidence: cat.confidence,
      admin_confirmed: false,
      statement_date: dateStr,
      source: 'csv',
      dedup_hash: dedupHash(propertyId, dateStr, item.description, item.amount),
    }
  })

  // Filter out items without a statement_id — we need to find or create statement rows
  // For CSV import, we group by date/ref and upsert a minimal statement row
  const byRef: Record<string, typeof insertRows> = {}
  insertRows.forEach((r, i) => {
    const key = items[i].ref || items[i].date || 'unknown'
    if (!byRef[key]) byRef[key] = []
    byRef[key].push(r)
  })

  let inserted = 0
  let duplicates = 0
  const errors: string[] = []

  for (const [ref, group] of Object.entries(byRef)) {
    // Upsert a landlord_statements row for this reference
    const dateStr = group[0].statement_date
    const totalAmount = group.reduce((s, r) => s + r.amount, 0)
    const { data: stmtRow, error: stmtErr } = await supabase
      .from('landlord_statements')
      .upsert({
        property_id: propertyId,
        landlord_id: landlordId,
        statement_reference: ref,
        statement_date: dateStr,
        period_start: dateStr,
        period_end: dateStr,
        gross_rent: 0,
        management_fees: 0,
        property_charges: totalAmount,
        net_to_landlord: 0,
      }, { onConflict: 'statement_reference,property_id' })
      .select('id')
      .single()

    if (stmtErr || !stmtRow) {
      errors.push(`Could not create statement for ref ${ref}: ${stmtErr?.message}`)
      continue
    }

    for (const row of group) {
      row.statement_id = stmtRow.id
      const { error: insErr } = await supabase
        .from('statement_line_items')
        .insert(row)

      if (insErr) {
        if (insErr.code === '23505') { // unique_violation → dedup
          duplicates++
        } else {
          errors.push(`${row.description}: ${insErr.message}`)
        }
      } else {
        inserted++
      }
    }
  }

  return NextResponse.json({ inserted, duplicates, errors, total: insertRows.length })
}
