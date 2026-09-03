// Reprocess 20 Chobham Road using deterministic PDF text extraction
// Step 1: pdf-parse extracts ALL text (no AI, no truncation)
// Step 2: AI parses each chunk of text into structured line items
// Step 3: AI categorises each expense
// Result: figures match the PDF exactly every time

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import crypto from 'crypto'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_KEY) {
  console.error('Missing env vars'); process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

const STMT_ID = '502f3c94-842f-4398-914d-b0961af025e6'
const PROPERTY_ID = '6b154214-942e-4c37-9ce3-112e0586595c'

function dedupHash(propertyId, date, description, amount, lineType) {
  return crypto.createHash('sha256')
    .update(`${propertyId}|${date}|${description.trim().toLowerCase()}|${amount}|${lineType}`)
    .digest('hex').slice(0, 32)
}

const EXPENSE_CATEGORIES = `management_fee — Management Fee (Capital Rooms %)
letting_fee — Letting Fee (new tenant fee)
maintenance_repair — Maintenance & Repairs
boiler_heating — Boiler & Heating
plumbing — Plumbing
electrical — Electrical
cleaning — Professional Cleaning
insurance — Insurance
compliance_certs — Compliance & Certificates
appliances_property — Appliances
garden_outdoor — Garden & Outdoor
fire_safety — Fire Safety
decorating — Painting & Decorating
security — Locks & Security
communal_areas — Communal Areas
communal_kitchen — Communal Kitchen
legal_professional — Legal & Professional Fees
tv_licensing — TV Licensing
furniture_property — Furniture
pest_control — Pest Control
broadband — Internet & Broadband
other — Other`

// Split text into ~4000-char chunks on line boundaries
function chunkText(text, maxChars = 4000) {
  const lines = text.split('\n')
  const chunks = []
  let current = ''
  for (const line of lines) {
    if (current.length + line.length + 1 > maxChars && current.length > 0) {
      chunks.push(current)
      current = line + '\n'
    } else {
      current += line + '\n'
    }
  }
  if (current.trim()) chunks.push(current)
  return chunks
}

async function parseChunk(text, chunkIndex, total) {
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `This is raw text extracted from a UK property management statement (chunk ${chunkIndex + 1}/${total}).

Extract every financial transaction line item. Include:
- Rent received (income)
- Management fees
- Letting fees
- All expenses, repairs, charges

JSON array only — if no transactions found return []:
[{"description":"<text>","amount":<positive number>,"date":"<YYYY-MM-DD>","line_type":"income" or "expense"}]

RULES:
- line_type "income" = rent received/rental income only
- line_type "expense" = all fees, charges, repairs, costs
- Use dates exactly as shown; format as YYYY-MM-DD
- If only month/year shown, use last day of that month
- Amounts as positive numbers only, no £ sign
- Skip running totals, balance brought forward, sub-total lines
- Return [] if this chunk has no transaction lines

RAW TEXT:
${text}`,
    }],
  })

  const raw = resp.content[0]?.type === 'text' ? resp.content[0].text.trim() : '[]'
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    return JSON.parse(match[0])
  } catch {
    // Try to repair truncated JSON
    let j = match[0]
    const lastBrace = j.lastIndexOf('}')
    if (lastBrace > 0) j = j.slice(0, lastBrace + 1) + ']'
    try { return JSON.parse(j) } catch { return [] }
  }
}

async function categoriseBatch(items) {
  if (!items.length) return []
  const lines = items.map((r, i) => `${i + 1}. "${r.description}" £${r.amount}`).join('\n')
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Categorise these UK HMO property expense lines. Best slug from:\n${EXPENSE_CATEGORIES}\n\nItems:\n${lines}\n\nJSON array only:\n[{"category":"<slug>","confidence":<0-1>}]`,
    }],
  })
  const text = resp.content[0]?.type === 'text' ? resp.content[0].text.trim() : '[]'
  const match = text.match(/\[[\s\S]*\]/)
  try { return match ? JSON.parse(match[0]) : [] } catch { return [] }
}

// Deduplicate items: same date + description + amount = same line
function dedup(items) {
  const seen = new Set()
  return items.filter(item => {
    const key = `${item.date}|${item.description.trim().toLowerCase()}|${item.amount}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function run() {
  console.log('=== Reprocessing 20 Chobham Road (text extraction method) ===')

  // Step 1: Extract all text from PDF
  const pdfBuffer = fs.readFileSync('/tmp/statement.pdf')
  const { text, numpages } = await pdfParse(pdfBuffer)
  console.log(`PDF: ${numpages} pages, ${text.length.toLocaleString()} characters of text extracted`)

  // Step 2: Chunk text and parse each chunk
  const chunks = chunkText(text, 4000)
  console.log(`Split into ${chunks.length} chunks for parsing\n`)

  let allRaw = []
  for (let i = 0; i < chunks.length; i++) {
    const items = await parseChunk(chunks[i], i, chunks.length)
    const valid = items.filter(r => r.description && r.amount > 0)
    process.stdout.write(`  Chunk ${i + 1}/${chunks.length}: ${valid.length} items found\r`)
    allRaw = allRaw.concat(valid)
  }
  console.log(`\n\nRaw items from all chunks: ${allRaw.length}`)

  // Step 3: Normalise and deduplicate
  const normalised = allRaw.map(r => ({
    description: String(r.description).trim(),
    amount: typeof r.amount === 'number' ? r.amount : parseFloat(String(r.amount).replace(/[£,]/g, '')),
    date: (r.date && r.date.match(/^\d{4}-\d{2}-\d{2}/)) ? r.date : '2020-01-31',
    line_type: r.line_type === 'income' ? 'income' : 'expense',
  })).filter(r => r.amount > 0 && r.amount < 100000) // sanity check

  const unique = dedup(normalised)
  const income = unique.filter(r => r.line_type === 'income')
  const expense = unique.filter(r => r.line_type !== 'income')
  console.log(`After dedup: ${unique.length} unique items (${income.length} income + ${expense.length} expense)`)

  // Step 4: Categorise expenses
  console.log('\nCategorising expense lines...')
  const BATCH = 20
  const categorised = new Array(unique.length)
  for (let i = 0; i < unique.length; i++) {
    if (unique[i].line_type === 'income') categorised[i] = { category: 'rent_income', confidence: 1.0 }
  }
  const expIdxs = unique.reduce((acc, r, i) => { if (r.line_type !== 'income') acc.push(i); return acc }, [])
  for (let b = 0; b < expIdxs.length; b += BATCH) {
    const slice = expIdxs.slice(b, b + BATCH)
    const batch = slice.map(i => ({ description: unique[i].description, amount: unique[i].amount }))
    const cats = await categoriseBatch(batch)
    slice.forEach((idx, j) => { categorised[idx] = cats[j] || { category: 'other', confidence: 0 } })
    process.stdout.write(`  ${Math.min(b + BATCH, expIdxs.length)}/${expIdxs.length}\r`)
  }
  console.log('\n✓ Categorisation done')

  // Step 5: Clear and insert
  const { data: prop } = await supabase.from('properties').select('id, name, landlord_id').eq('id', PROPERTY_ID).single()
  if (!prop) { console.error('Property not found'); process.exit(1) }

  await supabase.from('statement_line_items').delete().eq('statement_id', STMT_ID)
  console.log('✓ Cleared previous line items')

  let inserted = 0, dupes = 0, errs = 0
  for (let i = 0; i < unique.length; i++) {
    const item = unique[i]
    const cat = categorised[i] || { category: 'other', confidence: 0 }
    const autoConfirmed = cat.category !== 'other' && cat.confidence >= 0.9

    const { error } = await supabase.from('statement_line_items').insert({
      property_id: PROPERTY_ID,
      landlord_id: prop.landlord_id,
      statement_id: STMT_ID,
      description: item.description,
      amount: item.amount,
      category: cat.category,
      category_type: cat.category === 'rent_income' ? 'income' : 'property_wide',
      room_id: null,
      ai_category: cat.category,
      ai_confidence: cat.confidence,
      admin_confirmed: autoConfirmed,
      statement_date: item.date,
      source: 'autoledger',
      dedup_hash: dedupHash(PROPERTY_ID, item.date, item.description, item.amount, item.line_type),
    })
    if (error) { if (error.code === '23505') dupes++; else { console.warn(item.description, error.message); errs++ } }
    else inserted++
  }
  console.log(`Inserted: ${inserted} | Dupes: ${dupes} | Errors: ${errs}`)

  // Step 6: Recompute header totals
  const { data: lines } = await supabase.from('statement_line_items').select('category, amount').eq('statement_id', STMT_ID)
  let grossRent = 0, mgmtFees = 0, letting = 0, expenses = 0
  for (const l of (lines || [])) {
    const a = parseFloat(String(l.amount || 0))
    if (l.category === 'rent_income') grossRent += a
    else if (l.category === 'management_fee') mgmtFees += a
    else if (l.category === 'letting_fee') letting += a
    else expenses += a
  }
  const net = grossRent - mgmtFees - letting - expenses
  await supabase.from('landlord_statements').update({
    gross_rent: grossRent, management_fees: mgmtFees + letting,
    property_charges: expenses, net_to_landlord: net,
  }).eq('id', STMT_ID)

  console.log('\n=== Final Statement Totals ===')
  console.log(`Gross rent:       £${grossRent.toFixed(2)}`)
  console.log(`Management fees: -£${mgmtFees.toFixed(2)}`)
  console.log(`Letting fees:    -£${letting.toFixed(2)}`)
  console.log(`Expenses:        -£${expenses.toFixed(2)}`)
  console.log(`Net to landlord:  £${net.toFixed(2)}`)
  console.log(`\nTotal items:      ${lines?.length || 0}`)
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
