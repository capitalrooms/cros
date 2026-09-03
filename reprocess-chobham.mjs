// Reprocess 20 Chobham Road — extract year-by-year to avoid output token limits
// The AI reads the full 59-page PDF each time but focuses on one year's lines
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import crypto from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_KEY) {
  console.error('Missing env vars'); process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

function dedupHash(propertyId, date, description, amount, lineType) {
  return crypto.createHash('sha256')
    .update(`${propertyId}|${date}|${description.trim().toLowerCase()}|${amount}|${lineType}`)
    .digest('hex').slice(0, 32)
}

const PDF_B64 = fs.readFileSync('/tmp/statement.pdf').toString('base64')
const STMT_ID = '502f3c94-842f-4398-914d-b0961af025e6'
const PROPERTY_ID = '6b154214-942e-4c37-9ce3-112e0586595c' // 20 Chobham Road
const LANDLORD_ID = '51763ba5-8f6c-44e3-8858-7202f77e0617' // 20 Chobham Road landlord

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

async function extractHalf(year, half) {
  // half 1 = Jan-Jun, half 2 = Jul-Dec
  const startMonth = half === 1 ? 'January' : 'July'
  const endMonth = half === 1 ? 'June' : 'December'
  const startDate = half === 1 ? `${year}-01-01` : `${year}-07-01`
  const endDate = half === 1 ? `${year}-06-30` : `${year}-12-31`
  const label = `${year} H${half} (${startMonth}–${endMonth})`

  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: PDF_B64 } },
        { type: 'text', text: `This is a UK property management statement covering multiple years.

Extract ONLY the financial line items from ${startMonth} ${year} to ${endMonth} ${year} (${startDate} to ${endDate}).
Include:
- Rent received per room (income)
- Management fees charged
- Letting fees charged
- All expenses and repairs

JSON array only:
[{"description":"<text>","amount":<positive number>,"date":"<YYYY-MM-DD>","line_type":"income" or "expense"}]

RULES:
- Only items with dates between ${startDate} and ${endDate}
- line_type: "income" = rent received; "expense" = fees/repairs/charges
- Use actual dates shown. If only month shown, use last day of that month.
- Amounts as positive numbers, no £ symbol
- Do NOT include totals, balances, or carry-forwards
- Respond with JSON array only` },
      ],
    }],
  })

  const text = resp.content[0]?.type === 'text' ? resp.content[0].text.trim() : '[]'
  const warn = resp.stop_reason === 'max_tokens' ? ' ⚠️ TRUNCATED' : ''
  let jsonText = text.replace(/```[a-z]*\s*/g, '').replace(/```\s*/g, '').trim()
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const items = JSON.parse(jsonText)
      process.stdout.write(`  ${label}: ${items.filter(r => r.line_type === 'income').length} income + ${items.filter(r => r.line_type !== 'income').length} expense${warn}\n`)
      return items
    } catch {
      const lastComma = jsonText.lastIndexOf('},')
      if (lastComma > 0) { jsonText = jsonText.slice(0, lastComma + 1) + '\n]'; continue }
      const lastBrace = jsonText.lastIndexOf('}')
      if (lastBrace > 0) { jsonText = jsonText.slice(0, lastBrace + 1) + '\n]'; continue }
      break
    }
  }
  console.log(`  WARNING: Could not parse JSON for ${label}`)
  return []
}

async function categoriseBatch(items) {
  if (!items.length) return []
  const lines = items.map((r, i) => `${i+1}. "${r.description}" £${r.amount}`).join('\n')
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

async function run() {
  console.log('=== Re-extracting 20 Chobham Road year by year ===')
  console.log('PDF size:', Math.round(PDF_B64.length * 3/4 / 1024), 'KB')

  // Verify property + landlord IDs
  const { data: prop } = await supabase.from('properties').select('id, name, landlord_id').eq('id', PROPERTY_ID).single()
  if (!prop) { console.error('Property not found — update PROPERTY_ID'); process.exit(1) }
  console.log('Property:', prop.name, '| Landlord ID:', prop.landlord_id)

  // Clear existing line items for this statement
  const { error: delErr } = await supabase.from('statement_line_items').delete().eq('statement_id', STMT_ID)
  if (delErr) { console.error('Delete failed:', delErr); process.exit(1) }
  console.log('✓ Cleared previous line items')

  // Extract by half-year to stay within output token limits
  const periods = []
  for (const year of [2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
    periods.push({ year, half: 1 })
    periods.push({ year, half: 2 })
  }
  let allItems = []

  console.log('Extracting by half-year (14 passes)...')
  for (const { year, half } of periods) {
    const rawItems = await extractHalf(year, half)
    const valid = rawItems
      .filter(r => r.description && r.amount > 0)
      .map(r => ({
        description: String(r.description).trim(),
        amount: typeof r.amount === 'number' ? r.amount : parseFloat(String(r.amount).replace(/[£,]/g, '')),
        date: (() => {
          if (!r.date || !r.date.match(/^\d{4}-\d{2}-\d{2}/)) return half === 1 ? `${year}-06-30` : `${year}-12-31`
          return r.date
        })(),
        line_type: r.line_type === 'income' ? 'income' : 'expense',
      }))
    allItems = allItems.concat(valid)
  }

  console.log(`\nTotal extracted: ${allItems.length} items (${allItems.filter(r => r.line_type === 'income').length} income + ${allItems.filter(r => r.line_type !== 'income').length} expense)`)

  // Categorise expense items in batches of 20
  console.log('\nCategorising expense lines...')
  const BATCH = 20
  const categorised = new Array(allItems.length)
  const expIdxs = allItems.reduce((acc, r, i) => { if (r.line_type !== 'income') acc.push(i); return acc }, [])
  for (let i = 0; i < allItems.length; i++) {
    if (allItems[i].line_type === 'income') categorised[i] = { category: 'rent_income', confidence: 1.0 }
  }
  for (let b = 0; b < expIdxs.length; b += BATCH) {
    const slice = expIdxs.slice(b, b + BATCH)
    const batch = slice.map(i => ({ description: allItems[i].description, amount: allItems[i].amount }))
    const cats = await categoriseBatch(batch)
    slice.forEach((idx, j) => { categorised[idx] = cats[j] || { category: 'other', confidence: 0 } })
    process.stdout.write(`  ${Math.min(b + BATCH, expIdxs.length)}/${expIdxs.length}\r`)
  }
  console.log('\n✓ Categorisation done')

  // Insert all items
  let inserted = 0, dupes = 0, errs = 0
  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i]
    const cat = categorised[i] || { category: 'other', confidence: 0 }
    const category = cat.category
    const autoConfirmed = category !== 'other' && cat.confidence >= 0.9

    const { error } = await supabase.from('statement_line_items').insert({
      property_id: PROPERTY_ID,
      landlord_id: prop.landlord_id,
      statement_id: STMT_ID,
      description: item.description,
      amount: item.amount,
      category,
      category_type: category === 'rent_income' ? 'income' : 'property_wide',
      room_id: null,
      ai_category: category,
      ai_confidence: cat.confidence,
      admin_confirmed: autoConfirmed,
      statement_date: item.date,
      source: 'autoledger',
      dedup_hash: dedupHash(PROPERTY_ID, item.date, item.description, item.amount, item.line_type),
    })
    if (error) { if (error.code === '23505') dupes++; else { console.warn(item.description, error.message); errs++ } }
    else inserted++
  }
  console.log(`\nInserted: ${inserted} | Dupes: ${dupes} | Errors: ${errs}`)

  // Update statement header totals
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
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
