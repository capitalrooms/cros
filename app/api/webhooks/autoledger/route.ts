// POST /api/webhooks/autoledger
// ⚡ AutoLedger — Resend inbound webhook receiver.
// When staff BCCs or forwards a statement PDF to statements@crisiionta.resend.app,
// Resend posts the parsed email here. We return 202 immediately (so Resend never
// times out), then process the PDF in the background via after().
//
// Flow:
//   1. Verify Svix signature + extract basic fields → return 202 to Resend
//   2. Fetch PDF attachment content from Resend attachment API
//   3. AI identifies property + landlord from PDF content
//   4. AI extracts expense line items from PDF
//   5. AI-categorise each line item in batches
//   6. Upsert landlord_statements row, insert statement_line_items (deduped)
//   7. In-app notification (bell) + email to admin

import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import crypto from 'crypto'
import { Resend } from 'resend'
import {
  PROPERTY_WIDE_CATEGORIES,
  INCOME_CATEGORIES,
  ROOM_SPECIFIC_CATEGORY_TYPES,
  UNMATCHED_SLUG,
} from '@/lib/expense-categories'

// Give Vercel up to 5 minutes — background AI processing of a large PDF needs it
export const maxDuration = 300
export const runtime = 'nodejs'

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

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'))
  return lines.slice(1).map(line => {
    const cells = line.match(/("(?:[^"]|"")*"|[^,]*)/g)?.map(c =>
      c.replace(/^"|"$/g, '').replace(/""/g, '"').trim()
    ) ?? line.split(',')
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']))
  }).filter(row => Object.values(row).some(v => v))
}

function col(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const key = Object.keys(row).find(k => k.includes(n))
    if (key && row[key]) return row[key]
  }
  return ''
}

async function extractLinesFromText(
  text: string,
  subject: string
): Promise<Array<{ description: string; amount: number; date: string; ref: string }>> {
  const client = new Anthropic()
  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `You are parsing a UK property management statement or expense email.
Subject: "${subject}"

Email body:
${text.slice(0, 6000)}

Extract every individual expense line item you can identify. For each item return:
- description: what the expense is for
- amount: the pound amount (positive number, no £ sign)
- date: best estimate of the date in YYYY-MM-DD format (use today if unknown: ${new Date().toISOString().split('T')[0]})
- ref: any reference number or statement ref (empty string if none)

Respond with a JSON array only, no explanation:
[{"description":"...","amount":0.00,"date":"YYYY-MM-DD","ref":"..."}, ...]

If no line items can be extracted, return: []`,
    }],
  })

  const txt = resp.content[0]?.type === 'text' ? resp.content[0].text.trim() : '[]'
  try {
    const match = txt.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
  } catch {
    return []
  }
}

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
      content: `Categorise these UK HMO property expense line items. Pick the best slug from the list.
If genuinely ambiguous, use: other

Categories:
${categoryList}

Items:
${items}

Respond with JSON array only:
[{"category":"<slug>","confidence":<0-1>}, ...]`,
    }],
  })

  const txt = resp.content[0]?.type === 'text' ? resp.content[0].text.trim() : '[]'
  try {
    const match = txt.match(/\[[\s\S]*\]/)
    const parsed = match ? JSON.parse(match[0]) : []
    return rows.map((_, i) => ({
      category: parsed[i]?.category || UNMATCHED_SLUG,
      confidence: parsed[i]?.confidence ?? 0.5,
    }))
  } catch {
    return rows.map(() => ({ category: UNMATCHED_SLUG, confidence: 0 }))
  }
}

// ── All the heavy lifting happens here, after 202 is already sent ──────────────
async function processStatement(body: any) {
  const emailData = body.data ?? body
  const inboundEmailId: string = emailData.email_id || emailData.id || ''
  const from: string = emailData.from || emailData.sender || ''
  const subject: string = emailData.subject || ''
  const textBody: string = emailData.text || emailData.plain_text || ''
  const htmlBody: string = emailData.html || ''
  const attachments: Array<Record<string, any>> = emailData.attachments || []

  console.log('AutoLedger processing start:', { inboundEmailId, from, subject, attachments_count: attachments.length })

  // Fetch attachment content — Resend doesn't include base64 in the webhook payload
  if (inboundEmailId && attachments.length) {
    for (const att of attachments) {
      if (!att.content && att.id) {
        try {
          const attResp = await fetch(
            `https://api.resend.com/emails/inbound/${inboundEmailId}/attachments/${att.id}`,
            { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } }
          )
          if (attResp.ok) {
            const attMeta = await attResp.json()
            console.log('AutoLedger: attachment meta', { id: att.id, hasUrl: !!attMeta.download_url })
            if (attMeta.download_url) {
              const fileResp = await fetch(attMeta.download_url)
              if (fileResp.ok) {
                const buf = await fileResp.arrayBuffer()
                att.content = Buffer.from(buf).toString('base64')
                console.log('AutoLedger: fetched attachment', att.filename, `${(buf.byteLength / 1024).toFixed(0)}KB`)
              } else {
                console.warn('AutoLedger: download_url fetch failed', fileResp.status)
              }
            }
          } else {
            console.warn('AutoLedger: attachment API failed', attResp.status, await attResp.text())
          }
        } catch (e) {
          console.warn('AutoLedger: could not fetch attachment', att.id, e)
        }
      }
    }
  }

  const senderEmail = from.replace(/.*<(.+)>/, '$1').trim().toLowerCase()
  if (!senderEmail) {
    console.error('AutoLedger: no sender email')
    return
  }

  const supabase = serviceClient()
  const isTrustedSender = senderEmail.endsWith('@capitalrooms.co.uk')

  let landlord: { id: string; first_name: string | null; last_name: string | null; full_name?: string | null; email: string } | null = null
  let property: { id: string; name: string | null; address: string | null } | null = null

  if (isTrustedSender) {
    const { data: allProperties } = await supabase
      .from('properties')
      .select('id, name, address, landlord_id, people!landlord_id(id, first_name, last_name, full_name, email)')

    if (!allProperties?.length) {
      console.error('AutoLedger: no properties in system')
      return
    }

    const pdfAtt = attachments.find(a =>
      a.content_type === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')
    )

    console.log('AutoLedger: PDF found?', !!pdfAtt, 'has content?', !!pdfAtt?.content)

    if (pdfAtt?.content) {
      const client = new Anthropic()
      const propertyList = allProperties.map(p => {
        const ll = Array.isArray((p as any).people) ? (p as any).people[0] : (p as any).people
        const landlordName = ll ? `${ll.first_name || ''} ${ll.last_name || ll.full_name || ''}`.trim() : 'Unknown'
        return `- ID:${p.id} | "${p.name || p.address}" | Landlord: ${landlordName}`
      }).join('\n')

      const identifyResp = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfAtt.content } },
            { type: 'text', text: `Match this statement to the correct property:\n${propertyList}\n\nRespond JSON only: {"property_id":"<id>","confidence":0-1,"landlord_name_in_doc":"<name>","property_address_in_doc":"<address>"}` },
          ],
        }],
      })

      const identifyText = identifyResp.content[0]?.type === 'text' ? identifyResp.content[0].text : ''
      console.log('AutoLedger: identify response:', identifyText.slice(0, 200))
      try {
        const match = identifyText.match(/\{[\s\S]*\}/)
        const parsed = match ? JSON.parse(match[0]) : null
        if (parsed?.property_id) {
          const matched = allProperties.find(p => p.id === parsed.property_id)
          if (matched) {
            property = { id: matched.id, name: matched.name, address: matched.address }
            const ll = Array.isArray((matched as any).people) ? (matched as any).people[0] : (matched as any).people
            if (ll) landlord = ll
            console.log('AutoLedger: matched property', property.name, 'landlord', landlord?.email)
          }
        }
      } catch (e) {
        console.warn('AutoLedger: could not parse identify response', e)
      }
    }

    if (!property || !landlord) {
      console.warn(`AutoLedger: could not identify property from PDF. Subject: "${subject}"`)
      return
    }
  } else {
    const { data: landlordData } = await supabase
      .from('people')
      .select('id, first_name, last_name, full_name, email')
      .ilike('email', senderEmail)
      .eq('role', 'landlord')
      .single()

    if (!landlordData) {
      console.warn(`AutoLedger: unknown sender ${senderEmail}`)
      return
    }
    landlord = landlordData

    const { data: properties } = await supabase
      .from('properties')
      .select('id, name, address')
      .eq('landlord_id', landlord.id)

    if (!properties?.length) {
      console.warn('AutoLedger: no properties for landlord', landlord.email)
      return
    }

    let picked = properties[0]
    if (properties.length > 1) {
      const subjectLower = subject.toLowerCase()
      const match = properties.find(
        p => subjectLower.includes(p.name?.toLowerCase() || '') ||
             subjectLower.includes(p.address?.toLowerCase() || '')
      )
      if (match) picked = match
    }
    property = picked
  }

  // Rooms for categorisation
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, name, room_number')
    .eq('property_id', property.id)

  const categoryList = [
    ...PROPERTY_WIDE_CATEGORIES.map(c => `${c.slug} — ${c.label}`),
    ...(rooms || []).flatMap(r =>
      ROOM_SPECIFIC_CATEGORY_TYPES.map(t => `${t.slug}:${r.id} — Room ${r.room_number || r.name} ${t.label}`)
    ),
    `${UNMATCHED_SLUG} — Other / Not Matched`,
  ].join('\n')

  // Extract line items
  let rawItems: Array<{ description: string; amount: number; date: string; ref: string; line_type?: string }> = []
  const today = new Date().toISOString().split('T')[0]

  const csvAttachment = attachments.find(a =>
    a.content_type === 'text/csv' || a.filename?.toLowerCase().endsWith('.csv')
  )
  const pdfAttachment = attachments.find(a =>
    a.content_type === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')
  )

  if (csvAttachment?.content) {
    const csvText = Buffer.from(csvAttachment.content, 'base64').toString('utf-8')
    const rows = parseCsv(csvText)
    rawItems = rows.map(row => ({
      description: col(row, 'description', 'item', 'detail', 'narrative'),
      amount: parseFloat(col(row, 'amount', 'cost', 'value', 'charge').replace(/[£,]/g, '')) || 0,
      date: col(row, 'date', 'statement_date', 'period') || today,
      ref: col(row, 'ref', 'reference', 'statement_ref') || subject,
    })).filter(r => r.description && r.amount > 0)
  }

  if (!rawItems.length && pdfAttachment?.content) {
    console.log('AutoLedger: extracting from PDF…')
    const client = new Anthropic()

    // First: detect the statement's own period date so we use it as fallback, not today
    let statementPeriodDate = today
    try {
      const periodResp = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfAttachment.content } },
            { type: 'text', text: 'What is the statement period or statement date in this UK property management document? Respond JSON only: {"period_start":"YYYY-MM-DD","period_end":"YYYY-MM-DD"}' },
          ],
        }],
      })
      const periodText = periodResp.content[0]?.type === 'text' ? periodResp.content[0].text : ''
      const periodMatch = periodText.match(/\{[\s\S]*\}/)
      if (periodMatch) {
        const pd = JSON.parse(periodMatch[0])
        statementPeriodDate = pd.period_end || pd.period_start || today
        console.log('AutoLedger: statement period detected:', pd)
      }
    } catch (e) {
      console.warn('AutoLedger: could not detect statement period, using today as fallback', e)
    }

    const pdfResp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfAttachment.content } },
          { type: 'text', text: `Extract ALL financial line items from this UK property management statement (period ending ${statementPeriodDate}).

Include EVERY line that has a money amount:
- Rent received / rental income (money received from tenants per room or overall)
- Management fees (Capital Rooms' percentage fee, e.g. "Management Fee 10%")
- Letting fees (new tenant setup/finding fees)
- All expense, repair, and charge lines

For each line item return a JSON array:
[{"description":"<item>","amount":<positive number, no £>,"date":"<YYYY-MM-DD>","ref":"<ref or blank>","line_type":"income" or "expense"}]

CRITICAL DATE RULE: Use the actual transaction date if shown. If no date is on the line, use the statement period date (${statementPeriodDate}). NEVER use today's date. NEVER leave date blank.

line_type rules:
- "income" = money received (rent, deposits received)
- "expense" = money charged, deducted, or paid out (management fees, repairs, letting fees, any cost)

Do NOT include running totals, subtotals, or balance carry-forwards — only actual transaction lines.
Amounts as positive numbers only (no £ symbol). Respond with JSON array only.` },
        ],
      }],
    })
    const pdfText = pdfResp.content[0]?.type === 'text' ? pdfResp.content[0].text.trim() : '[]'
    console.log('AutoLedger: PDF extract response length', pdfText.length, 'chars')
    try {
      // Strip markdown code fences, then repair truncated JSON if needed
      let jsonText = pdfText.replace(/```[a-z]*\s*/g, '').replace(/```\s*/g, '').trim()
      let attempts = 0
      let parsed: Array<{ description: string; amount: number; date?: string; ref?: string; line_type?: string }> = []
      while (attempts < 5) {
        try {
          parsed = JSON.parse(jsonText)
          break
        } catch {
          attempts++
          // Truncated mid-entry: cut back to last complete object and close the array
          const lastBrace = jsonText.lastIndexOf('},')
          if (lastBrace > 0) {
            jsonText = jsonText.slice(0, lastBrace + 1) + '\n]'
            console.log(`AutoLedger: repaired truncated JSON (attempt ${attempts})`)
          } else {
            break
          }
        }
      }
      rawItems = parsed
        .filter(r => r.description && (typeof r.amount === 'number' ? r.amount > 0 : parseFloat(String(r.amount)) > 0))
        .map(r => ({
          description: String(r.description).trim(),
          amount: typeof r.amount === 'number' ? r.amount : parseFloat(String(r.amount).replace(/[£,]/g, '')),
          // Use extracted date if valid, fall back to statement period (never today from code)
          date: (r.date && r.date.match(/^\d{4}-\d{2}-\d{2}/) && r.date !== today) ? r.date : statementPeriodDate,
          ref: r.ref || subject || `autoledger-${today}`,
          line_type: r.line_type === 'income' ? 'income' : 'expense',
        }))
      console.log('AutoLedger: extracted', rawItems.length, 'items from PDF')
    } catch (e) {
      console.warn('AutoLedger: could not parse PDF extract response', e)
    }
  }

  if (!rawItems.length) {
    const bodyText = textBody || htmlBody.replace(/<[^>]+>/g, ' ')
    rawItems = await extractLinesFromText(bodyText, subject)
    console.log('AutoLedger: extracted from body text', rawItems.length, 'items')
  }

  if (!rawItems.length) {
    console.warn('AutoLedger: no expense items found')
    return
  }

  // Batch categorise — income lines are pre-assigned; only categorise expense lines
  const BATCH = 20
  const categorised: Array<{ category: string; confidence: number }> = new Array(rawItems.length)

  // Pre-assign income lines
  const expenseIdxs: number[] = []
  for (let i = 0; i < rawItems.length; i++) {
    if (rawItems[i].line_type === 'income') {
      categorised[i] = { category: 'rent_income', confidence: 1.0 }
    } else {
      expenseIdxs.push(i)
    }
  }

  // AI-categorise expense lines in batches
  for (let b = 0; b < expenseIdxs.length; b += BATCH) {
    const slice = expenseIdxs.slice(b, b + BATCH)
    const batch = slice.map(i => ({ description: rawItems[i].description, amount: rawItems[i].amount }))
    const results = await categoriseBatch(batch, categoryList)
    slice.forEach((idx, j) => { categorised[idx] = results[j] })
  }

  // Upsert statement header — use email_id as idempotency key but build a readable reference
  const stmtRef = inboundEmailId || subject || `autoledger-${today}`
  const totalExpenses = rawItems.filter(r => r.line_type !== 'income').reduce((s, r) => s + r.amount, 0)

  // Check if a statement row already exists for this email (idempotent on retries)
  const { data: existingStmt } = await supabase
    .from('landlord_statements')
    .select('id')
    .eq('statement_reference', stmtRef)
    .eq('property_id', property.id)
    .maybeSingle()

  let stmtRow = existingStmt
  if (!stmtRow) {
    // Compute date range from line items
    const dates = rawItems.map(r => r.date).filter(d => d && d.match(/^\d{4}-\d{2}-\d{2}/)).sort()
    const periodStart = dates[0] || today
    const periodEnd = dates[dates.length - 1] || today

    // Human-readable reference: "Aug 2026" for a monthly statement, "May 2020 – Sep 2026" for multi-period
    const fmtMY = (d: string) => new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    const readableRef = periodStart !== periodEnd && fmtMY(periodStart) !== fmtMY(periodEnd)
      ? `${fmtMY(periodStart)} – ${fmtMY(periodEnd)}`
      : fmtMY(periodEnd)

    const { data: newStmt, error: stmtErr } = await supabase
      .from('landlord_statements')
      .insert({
        property_id: property.id,
        landlord_id: landlord.id,
        statement_reference: readableRef,
        statement_date: periodEnd,
        period_start: periodStart,
        period_end: periodEnd,
        gross_rent: 0,       // updated below after line items inserted
        management_fees: 0,  // updated below
        property_charges: 0, // updated below
        net_to_landlord: 0,  // updated below
      })
      .select('id')
      .single()
    if (stmtErr || !newStmt) {
      console.error('AutoLedger: statement insert failed', JSON.stringify(stmtErr))
      return
    }
    stmtRow = newStmt
  }
  console.log('AutoLedger: statement row', stmtRow.id)

  let inserted = 0
  let duplicates = 0

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i]
    const cat = categorised[i]
    let category = cat.category
    let room_id: string | null = null

    if (category.includes(':')) {
      const parts = category.split(':')
      category = parts[0]
      room_id = parts[1] || null
    }

    const category_type = category === 'rent_income' ? 'income' : category.startsWith('room_') ? 'room_specific' : 'property_wide'
    const dateStr = item.date || today

    // Auto-confirm if AI is ≥90% confident and it's not an unmatched item —
    // only genuine ambiguity or "other" needs human review
    const autoConfirmed = category !== 'other' && cat.confidence >= 0.9

    const { error: insErr } = await supabase.from('statement_line_items').insert({
      property_id: property.id,
      landlord_id: landlord.id,
      statement_id: stmtRow.id,
      description: item.description,
      amount: item.amount,
      category,
      category_type,
      room_id,
      ai_category: cat.category,
      ai_confidence: cat.confidence,
      admin_confirmed: autoConfirmed,
      statement_date: dateStr,
      source: 'autoledger',
      dedup_hash: dedupHash(property.id, dateStr, item.description, item.amount),
    })

    if (insErr) {
      if (insErr.code === '23505') { duplicates++ }
      else { console.warn('AutoLedger: insert error', item.description, insErr.message) }
    } else {
      inserted++
    }
  }

  console.log(`AutoLedger: done — inserted ${inserted}, duplicates ${duplicates}`)

  // Recompute statement header totals from actual line items
  try {
    const { data: allLines } = await supabase
      .from('statement_line_items')
      .select('category, amount')
      .eq('statement_id', stmtRow.id)

    if (allLines?.length) {
      let grossRent = 0, managementFees = 0, propertyCharges = 0
      for (const line of allLines) {
        const amt = parseFloat(String(line.amount || 0))
        if (line.category === 'rent_income') {
          grossRent += amt
        } else if (line.category === 'management_fee' || line.category === 'letting_fee') {
          managementFees += amt
        } else {
          propertyCharges += amt
        }
      }
      const netToLandlord = grossRent - managementFees - propertyCharges
      await supabase.from('landlord_statements').update({
        gross_rent: grossRent,
        management_fees: managementFees,
        property_charges: propertyCharges,
        net_to_landlord: netToLandlord,
      }).eq('id', stmtRow.id)
      console.log(`AutoLedger: statement header updated — rent:£${grossRent.toFixed(2)} mgmt:£${managementFees.toFixed(2)} charges:£${propertyCharges.toFixed(2)} net:£${netToLandlord.toFixed(2)}`)
    }
  } catch (e) {
    console.warn('AutoLedger: could not update statement header totals', e)
  }

  const landlordName = landlord.first_name && landlord.last_name
    ? `${landlord.first_name} ${landlord.last_name}`
    : (landlord as any).full_name || landlord.email

  // In-app bell notification
  try {
    if (inserted > 0) {
      const { data: admins } = await supabase.from('people').select('id').in('role', ['administrator', 'admin'])
      const adminIds = (admins || []).map((a: any) => a.id).filter(Boolean)
      if (adminIds.length) {
        await supabase.from('notifications').insert(
          adminIds.map((id: string) => ({
            user_id: id,
            title: `📊 ${inserted} expense${inserted > 1 ? 's' : ''} imported — ${property!.name || property!.address}`,
            body: `AutoLedger: statement from ${landlordName}.${duplicates ? ` ${duplicates} duplicate${duplicates > 1 ? 's' : ''} skipped.` : ''}`,
            type: 'statement',
            link: '/admin/expense-review',
            read: false,
          }))
        )
      }
    }
  } catch (e) {
    console.warn('AutoLedger: in-app notify failed', e)
  }

  // Email notification
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'Capital Rooms <noreply@capitalrooms.co.uk>',
      to: ['harry@capitalrooms.co.uk'],
      subject: `⚡ AutoLedger: ${inserted} expenses imported — ${property!.name || property!.address}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
          <h2 style="color:#111">⚡ AutoLedger ran</h2>
          <p style="color:#555">Statement from <strong>${landlordName}</strong> processed automatically.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#555">Property</td><td style="padding:8px;font-weight:bold">${property!.name || property!.address}</td></tr>
            <tr><td style="padding:8px;color:#555">Items imported</td><td style="padding:8px;font-weight:bold;color:#16a34a">${inserted}</td></tr>
            <tr><td style="padding:8px;color:#555">Duplicates skipped</td><td style="padding:8px">${duplicates}</td></tr>
          </table>
          ${inserted > 0 ? `<a href="https://cros-sigma.vercel.app/admin/expense-review" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Review in CROS →</a>` : ''}
        </div>
      `,
    })
  } catch (e) {
    console.warn('AutoLedger: email notify failed', e)
  }
}

// ── Webhook entry point ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: any
  try {
    const rawBody = await req.text()

    // Verify Resend/Svix signature
    const signingSecret = process.env.AUTOLEDGER_WEBHOOK_SIGNING_SECRET
    if (signingSecret) {
      const svixId = req.headers.get('svix-id') || ''
      const svixTs = req.headers.get('svix-timestamp') || ''
      const svixSig = req.headers.get('svix-signature') || ''
      if (svixId && svixTs && svixSig) {
        const toSign = `${svixId}.${svixTs}.${rawBody}`
        const keyBytes = Buffer.from(signingSecret.replace(/^whsec_/, ''), 'base64')
        const hmac = crypto.createHmac('sha256', keyBytes).update(toSign).digest('base64')
        const expected = `v1,${hmac}`
        const valid = svixSig.split(' ').some(s => crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)))
        if (!valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const emailData = body.data ?? body
  const recipient: string = (emailData.to?.[0] || '').toLowerCase()

  // Only process emails addressed to statements@
  if (recipient && !recipient.includes('statements@')) {
    return NextResponse.json({ ok: true, skipped: 'not a statements email' })
  }

  // Return 202 immediately so Resend never times out.
  // The actual PDF processing happens in after() — Vercel keeps the function alive
  // for up to maxDuration (300s) after the response is sent.
  after(async () => {
    try {
      await processStatement(body)
    } catch (e) {
      console.error('AutoLedger: unhandled error in processStatement', e)
    }
  })

  return NextResponse.json({ ok: true, queued: true }, { status: 202 })
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'autoledger' })
}
