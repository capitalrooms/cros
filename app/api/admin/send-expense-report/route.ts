import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildEmail, FROM } from '@/lib/emailWrapper'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACCOUNTS_EMAIL = 'accounts@capitalrooms.co.uk'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user || !['administrator', 'admin'].includes(user.assignment?.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { month } = await request.json() // YYYY-MM
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month' }, { status: 400 })
  }

  const from = `${month}-01`
  const to   = `${month}-31`

  const supabase = db()

  // Load unsent expenses for this month, with property info
  const { data: rows, error } = await supabase
    .from('recharge_expenses')
    .select('*, properties(id, name, address)')
    .gte('expense_date', from)
    .lte('expense_date', to)
    .is('sent_at', null)
    .order('expense_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: false, message: 'No unsent expenses for this month' })
  }

  // Group by property name, sorted numerically
  const grouped: Record<string, { name: string; address: string; rows: typeof rows }> = {}
  for (const r of rows) {
    const prop = (r.properties as any)
    const key = prop?.id || 'unknown'
    if (!grouped[key]) grouped[key] = { name: prop?.name || '—', address: prop?.address || '', rows: [] }
    grouped[key].rows.push(r)
  }

  // Sort property groups numerically by name
  const sortedGroups = Object.values(grouped).sort((a, b) => {
    const numA = parseInt(a.name.match(/\d+/)?.[0] || '9999')
    const numB = parseInt(b.name.match(/\d+/)?.[0] || '9999')
    if (numA !== numB) return numA - numB
    return a.name.localeCompare(b.name)
  })

  const gbp = (n: number) => `£${parseFloat(String(n)).toFixed(2)}`

  const monthLabel = new Date(`${month}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const grandTotal = rows.reduce((s, r) => s + parseFloat(String(r.amount)), 0)

  // Build HTML email body
  let propertyRows = ''
  for (const group of sortedGroups) {
    const groupTotal = group.rows.reduce((s, r) => s + parseFloat(String(r.amount)), 0)
    const expenseLines = group.rows.map(r =>
      `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;color:#444;font-size:13px">${new Date(r.expense_date).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;color:#444;font-size:13px">${r.description}${r.notes ? ` <span style="color:#999">(${r.notes})</span>` : ''}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;color:#444;font-size:13px;text-align:right;font-variant-numeric:tabular-nums">${gbp(parseFloat(String(r.amount)))}</td>
      </tr>`
    ).join('')

    propertyRows += `
      <tr><td colspan="3" style="padding:16px 12px 6px;font-weight:700;font-size:14px;color:#111;border-top:2px solid #e5e5e5">
        ${group.name}${group.address ? ` — <span style="font-weight:400;color:#666">${group.address}</span>` : ''}
      </td></tr>
      ${expenseLines}
      <tr>
        <td colspan="2" style="padding:6px 12px 12px;font-weight:600;font-size:13px;color:#555;text-align:right">Subtotal</td>
        <td style="padding:6px 12px 12px;font-weight:700;font-size:13px;color:#111;text-align:right;font-variant-numeric:tabular-nums">${gbp(groupTotal)}</td>
      </tr>`
  }

  const emailBody = `
    <p style="margin:0 0 20px;font-size:15px;color:#333">
      Please find below the property recharge expenses for <strong>${monthLabel}</strong> (${rows.length} item${rows.length !== 1 ? 's' : ''}).
    </p>

    <table style="width:100%;border-collapse:collapse;font-family:inherit">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888;border-bottom:2px solid #e5e5e5">Date</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888;border-bottom:2px solid #e5e5e5">Description</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888;border-bottom:2px solid #e5e5e5">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${propertyRows}
      </tbody>
      <tfoot>
        <tr style="background:#111">
          <td colspan="2" style="padding:12px;font-weight:700;font-size:14px;color:#fff;text-align:right">Total</td>
          <td style="padding:12px;font-weight:900;font-size:15px;color:#fff;text-align:right;font-variant-numeric:tabular-nums">${gbp(grandTotal)}</td>
        </tr>
      </tfoot>
    </table>
  `

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
    body: JSON.stringify({
      from: FROM,
      to: ACCOUNTS_EMAIL,
      subject: `Property recharge expenses — ${monthLabel}`,
      html: await buildEmail(emailBody),
    }),
  })

  if (!emailRes.ok) {
    const err = await emailRes.text()
    return NextResponse.json({ error: `Email failed: ${err}` }, { status: 500 })
  }

  // Mark all sent
  const ids = rows.map(r => r.id)
  await supabase
    .from('recharge_expenses')
    .update({ sent_at: new Date().toISOString() })
    .in('id', ids)

  return NextResponse.json({ ok: true, sent: rows.length, total: grandTotal })
}
