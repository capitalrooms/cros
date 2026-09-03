import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Export compliance log as PDF-ready HTML
 * POST /api/export/compliance-log-pdf
 *
 * Body: { property_id }
 * Returns: HTML content ready to print/PDF
 */

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || !['administrator', 'admin'].includes(user.assignment?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { property_id } = await req.json()

    if (!property_id) {
      return NextResponse.json({ error: 'Missing property_id' }, { status: 400 })
    }

    const supabase = createClient()

    // Fetch property details
    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('id, name, address, property_code, property_type')
      .eq('id', property_id)
      .single()

    if (propError || !property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // Only allow export for HMO properties
    if (property.property_type !== 'hmo') {
      return NextResponse.json(
        { error: 'Compliance log export is for HMO properties only' },
        { status: 403 }
      )
    }

    // Fetch all compliance logs
    const { data: logs, error: logsError } = await supabase
      .from('compliance_logs')
      .select('*, people(full_name, first_name, last_name)')
      .eq('property_id', property_id)
      .order('checked_date', { ascending: false })

    if (logsError) {
      return NextResponse.json({ error: 'Failed to fetch compliance logs' }, { status: 500 })
    }

    // Generate HTML
    const today = new Date().toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    const checkTypeLabel = (type: string) =>
      type === 'fire_door' ? '🚪 Fire Door' : '🔔 Smoke Alarm'

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compliance Log - ${property.name}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      line-height: 1.6;
      color: #333;
      background: white;
    }

    @media print {
      body {
        margin: 0;
        padding: 0;
      }
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 60px;
    }

    .header {
      border-bottom: 3px solid #333;
      padding-bottom: 30px;
      margin-bottom: 30px;
    }

    .company-name {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 20px;
      color: #000;
    }

    .property-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      font-size: 14px;
      margin-bottom: 20px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
    }

    .label {
      font-weight: 600;
      width: 120px;
    }

    .value {
      flex: 1;
      text-align: right;
    }

    .content {
      margin-bottom: 30px;
    }

    .section-title {
      font-size: 18px;
      font-weight: bold;
      margin-top: 30px;
      margin-bottom: 15px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 10px;
      color: #333;
    }

    .compliance-entry {
      background: #f9f9f9;
      border-left: 4px solid #0066cc;
      padding: 15px;
      margin-bottom: 15px;
      page-break-inside: avoid;
    }

    .entry-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      font-weight: 600;
    }

    .entry-date {
      font-size: 14px;
      color: #666;
    }

    .entry-type {
      background: #0066cc;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }

    .entry-details {
      font-size: 14px;
      margin-bottom: 8px;
      color: #555;
    }

    .entry-notes {
      font-size: 13px;
      color: #777;
      font-style: italic;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #ddd;
    }

    .empty-state {
      background: #f0f0f0;
      padding: 20px;
      border-radius: 4px;
      text-align: center;
      color: #999;
      font-size: 14px;
    }

    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #999;
      text-align: center;
    }

    .signature-area {
      margin-top: 40px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
    }

    .signature-line {
      border-top: 1px solid #333;
      padding-top: 10px;
      text-align: center;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="company-name">Capital Rooms</div>
      <div class="property-info">
        <div class="info-row">
          <span class="label">Property:</span>
          <span class="value">${property.name}</span>
        </div>
        <div class="info-row">
          <span class="label">Address:</span>
          <span class="value">${property.address}</span>
        </div>
        <div class="info-row">
          <span class="label">Code:</span>
          <span class="value">${property.property_code || '—'}</span>
        </div>
        <div class="info-row">
          <span class="label">Type:</span>
          <span class="value">HMO</span>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="content">
      <div class="section-title">Compliance Check History</div>

      ${
        logs && logs.length > 0
          ? logs
              .map(
                (log: any) =>
                  `
        <div class="compliance-entry">
          <div class="entry-header">
            <div>
              <span class="entry-type">${checkTypeLabel(log.check_type)}</span>
            </div>
            <span class="entry-date">${new Date(log.checked_date).toLocaleDateString('en-GB', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}</span>
          </div>
          <div class="entry-details">
            <strong>Checked by:</strong> ${log.people.name || 'Unknown'} (${log.checked_by_role})
          </div>
          ${log.notes ? `<div class="entry-notes"><strong>Notes:</strong> ${log.notes}</div>` : ''}
        </div>
        `
              )
              .join('')
          : '<div class="empty-state">No compliance checks logged yet.</div>'
      }
    </div>

    <!-- Signature Area -->
    <div class="signature-area">
      <div class="signature-line">
        Landlord / Property Manager<br>
        Signature: _________________<br>
        Date: _________________
      </div>
      <div class="signature-line">
        Admin / Inspector<br>
        Signature: _________________<br>
        Date: _________________
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      Generated: ${today} | Document ID: ${property_id.slice(0, 8)}
    </div>
  </div>
</body>
</html>
    `

    // Return HTML with proper headers for PDF printing
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="compliance-log-${property_code || 'unknown'}.html"`
      }
    })
  } catch (err) {
    console.error('Compliance log export error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
