import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'
import { emailHtml, tableRow } from '@/lib/emailTemplate'
import { senderFields } from '@/lib/email/sender'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const CERT_LABELS: Record<string, string> = {
  gas_safe: 'Gas Safety Certificate (CP12)',
  eicr: 'EICR — Electrical Inspection',
  pat: 'PAT — Portable Appliance Testing',
  fire_detection: 'Fire Detection & Alarm',
  emergency_lighting: 'Emergency Lighting',
  fire_risk: 'Fire Risk Assessment',
}

const CERT_KEYS: Record<string, { dateKey: string; expiryKey: string }> = {
  gas_safe: { dateKey: 'gas_safe_cert_date', expiryKey: 'gas_safe_cert_expiry' },
  eicr: { dateKey: 'electrical_cert_date', expiryKey: 'electrical_cert_expiry' },
  pat: { dateKey: 'pat_test_date', expiryKey: 'pat_test_expiry' },
  fire_detection: { dateKey: 'fire_detection_test_date', expiryKey: 'fire_detection_expiry' },
  emergency_lighting: { dateKey: 'emergency_lighting_test_date', expiryKey: 'emergency_lighting_expiry' },
  fire_risk: { dateKey: 'fire_risk_assessment_date', expiryKey: 'fire_risk_assessment_expiry' },
}

function fmtDate(d: string | null): string {
  if (!d) return 'Not recorded'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}

function daysUntil(d: string | null): number | null {
  if (!d) return null
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

function statusLabel(expiry: string | null): string {
  if (!expiry) return '⚪ Not recorded'
  const days = daysUntil(expiry)!
  if (days < 0) return `🔴 Expired ${Math.abs(days)} days ago`
  if (days <= 60) return `🟡 Expires in ${days} days`
  return `🟢 Valid — ${days} days remaining`
}

// POST /api/admin/send-certs
export async function POST(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { property_id, cert_types, recipient_type, custom_message } = body
  // recipient_type: 'landlord' | 'tenants' | 'both'

  if (!property_id || !cert_types?.length || !recipient_type) {
    return NextResponse.json({ error: 'property_id, cert_types, and recipient_type required' }, { status: 400 })
  }

  const sb = serviceClient()

  // Load property + landlord
  const { data: property, error: propError } = await sb
    .from('properties')
    .select(`
      *,
      landlord:people!landlord_id(id, first_name, last_name, email)
    `)
    .eq('id', property_id)
    .single()

  if (propError || !property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  // Build cert table rows
  const certRows = cert_types
    .filter((t: string) => CERT_KEYS[t])
    .map((t: string) => {
      const { dateKey, expiryKey } = CERT_KEYS[t]
      const issueDate = property[dateKey] as string | null
      const expiryDate = property[expiryKey] as string | null
      return { label: CERT_LABELS[t] || t, issueDate, expiryDate, status: statusLabel(expiryDate) }
    })

  const certTableHtml = certRows.map((r: any) => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;font-weight:600;color:#111;">${r.label}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;color:#444;">${fmtDate(r.issueDate)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;color:#444;">${fmtDate(r.expiryDate)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;font-size:13px;">${r.status}</td>
    </tr>
  `).join('')

  const certTableBlock = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f8f8f8;">
          <th style="padding:10px 8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#666;">Certificate</th>
          <th style="padding:10px 8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#666;">Issue / Test date</th>
          <th style="padding:10px 8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#666;">Expiry / Next due</th>
          <th style="padding:10px 8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#666;">Status</th>
        </tr>
      </thead>
      <tbody>${certTableHtml}</tbody>
    </table>
  `

  const propertyName = property.name || property.address || 'your property'
  const intro = custom_message?.trim()
    ? `<p>${custom_message.trim()}</p>`
    : `<p>Please find below the current compliance certificate status for <strong>${propertyName}</strong>.</p>`

  const emailContent = `
    ${intro}
    ${certTableHtml}
    <p style="color:#666;font-size:13px;">This summary was generated from the Capital Rooms property management system. If you have any questions or need to arrange renewals, please don't hesitate to get in touch.</p>
  `

  const html = await emailHtml(emailContent, { req: req })
  const subject = `Compliance Certificates — ${propertyName}`

  const recipients: { email: string; name: string; type: string }[] = []

  // Landlord
  if ((recipient_type === 'landlord' || recipient_type === 'both') && property.landlord?.email) {
    const l = property.landlord as any
    recipients.push({ email: l.email, name: `${l.first_name} ${l.last_name}`.trim(), type: 'landlord' })
  }

  // Active tenants
  if (recipient_type === 'tenants' || recipient_type === 'both') {
    const today = new Date().toISOString().split('T')[0]
    const { data: tenancies } = await sb
      .from('tenancies')
      .select('people!person_id(id, first_name, last_name, email)')
      .eq('property_id', property_id)
      .lte('start_date', today)
      .or(`end_date.is.null,end_date.gte.${today}`)
    for (const t of tenancies || []) {
      const p = (t as any).people
      if (p?.email) recipients.push({ email: p.email, name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), type: 'tenant' })
    }
  }

  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No recipients found — check the landlord has an email address and there are active tenants.' }, { status: 400 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  // Send individually (Resend free tier: one To per call)
  let sent = 0
  const errors: string[] = []
  for (const r of recipients) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ ...(await senderFields(req)), to: [r.email], subject, html }),
    })
    if (res.ok) sent++
    else {
      const err = await res.json().catch(() => ({}))
      errors.push(`${r.email}: ${(err as any).message || res.status}`)
    }
  }

  if (sent === 0) {
    return NextResponse.json({ error: `All sends failed: ${errors.join('; ')}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    sent,
    total: recipients.length,
    recipients: recipients.map(r => ({ name: r.name, email: r.email, type: r.type })),
    errors: errors.length ? errors : undefined,
  })
}
