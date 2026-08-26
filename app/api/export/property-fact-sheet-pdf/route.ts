import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Export property fact sheet as PDF-ready HTML
 * POST /api/export/property-fact-sheet-pdf
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
    const { data: property } = await supabase
      .from('properties')
      .select('id, name, address, property_code, property_type')
      .eq('id', property_id)
      .single()

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    // Fetch extended details
    const { data: extended } = await supabase
      .from('property_extended_details')
      .select('*')
      .eq('property_id', property_id)
      .single()

    const today = new Date().toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    // Build sections dynamically - only include populated fields
    let sections = ''

    if (
      extended?.bin_black_day ||
      extended?.bin_blue_day ||
      extended?.bin_green_day ||
      extended?.bin_food_day
    ) {
      sections += `
    <div class="section">
      <h3>🗑️ Waste Management</h3>
      <div class="details">
        ${extended.bin_black_day ? `<p><span class="label">Black bin:</span> ${extended.bin_black_day}</p>` : ''}
        ${extended.bin_blue_day ? `<p><span class="label">Blue bin:</span> ${extended.bin_blue_day}</p>` : ''}
        ${extended.bin_green_day ? `<p><span class="label">Green bin:</span> ${extended.bin_green_day}</p>` : ''}
        ${extended.bin_food_day ? `<p><span class="label">Food waste:</span> ${extended.bin_food_day}</p>` : ''}
      </div>
    </div>
      `
    }

    if (extended?.nearest_gp_name) {
      sections += `
    <div class="section">
      <h3>🏥 Local Services</h3>
      <div class="details">
        <p><span class="label">GP Surgery:</span> ${extended.nearest_gp_name}</p>
        ${extended.nearest_gp_phone ? `<p><span class="label">Phone:</span> ${extended.nearest_gp_phone}</p>` : ''}
        ${extended.nearest_gp_postcode ? `<p><span class="label">Postcode:</span> ${extended.nearest_gp_postcode}</p>` : ''}
      </div>
    </div>
      `
    }

    if (extended?.police_force_name) {
      sections += `
    <div class="section">
      <h3>🚔 Emergency Services</h3>
      <div class="details">
        <p><span class="label">Police Force:</span> ${extended.police_force_name}</p>
        ${extended.police_station_name ? `<p><span class="label">Nearest Station:</span> ${extended.police_station_name}</p>` : ''}
      </div>
    </div>
      `
    }

    if (extended?.council_tax_band || extended?.council_contact_phone) {
      sections += `
    <div class="section">
      <h3>🏛️ Council Information</h3>
      <div class="details">
        ${extended.council_tax_band ? `<p><span class="label">Tax Band:</span> ${extended.council_tax_band}</p>` : ''}
        ${extended.council_contact_phone ? `<p><span class="label">Contact:</span> ${extended.council_contact_phone}</p>` : ''}
      </div>
    </div>
      `
    }

    if (extended?.single_let_rental_value || extended?.hmo_total_value) {
      sections += `
    <div class="section">
      <h3>💷 Valuation</h3>
      <div class="details">
        ${extended.single_let_rental_value ? `<p><span class="label">Estimated Rental:</span> £${extended.single_let_rental_value}/month</p>` : ''}
        ${extended.hmo_total_value ? `<p><span class="label">Total Value:</span> £${extended.hmo_total_value}</p>` : ''}
        ${extended.valuation_source ? `<p><span class="label">Source:</span> ${extended.valuation_source}</p>` : ''}
      </div>
    </div>
      `
    }

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Property Fact Sheet - ${property.name}</title>
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

    .property-header {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 20px;
      margin-bottom: 10px;
    }

    .property-title {
      font-size: 20px;
      font-weight: bold;
      color: #000;
    }

    .property-address {
      font-size: 14px;
      color: #666;
      margin-top: 5px;
    }

    .property-meta {
      text-align: right;
      font-size: 13px;
    }

    .meta-item {
      margin: 5px 0;
      color: #666;
    }

    .meta-label {
      font-weight: 600;
      display: inline-block;
      width: 60px;
    }

    .section {
      margin-bottom: 25px;
      page-break-inside: avoid;
    }

    .section h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #333;
      border-bottom: 2px solid #0066cc;
      padding-bottom: 8px;
    }

    .details {
      font-size: 13px;
      line-height: 1.8;
      color: #555;
    }

    .details p {
      margin-bottom: 8px;
    }

    .label {
      font-weight: 600;
      display: inline-block;
      width: 140px;
      color: #333;
    }

    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 11px;
      color: #999;
      text-align: center;
    }

    .empty {
      color: #999;
      font-size: 13px;
      font-style: italic;
      padding: 20px;
      text-align: center;
      background: #f9f9f9;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="company-name">Capital Rooms</div>
      <div class="property-header">
        <div>
          <div class="property-title">${property.name}</div>
          <div class="property-address">${property.address}</div>
        </div>
        <div class="property-meta">
          ${property.property_code ? `<div class="meta-item"><span class="meta-label">Code:</span> ${property.property_code}</div>` : ''}
          <div class="meta-item"><span class="meta-label">Type:</span> ${property.property_type === 'hmo' ? 'HMO' : 'Single Let'}</div>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="content">
      ${sections || '<div class="empty">No property details have been populated yet. Click "Rescan" to fetch available information.</div>'}
    </div>

    <!-- Footer -->
    <div class="footer">
      Generated: ${today} | Ready to print or save as PDF
    </div>
  </div>
</body>
</html>
    `

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="property-factsheet-${property.property_code || 'unknown'}.html"`
      }
    })
  } catch (err) {
    console.error('Fact sheet export error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
