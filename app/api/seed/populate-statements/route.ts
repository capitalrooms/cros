import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

/**
 * Seed 15 landlord statements from parsed PDFs
 * POST /api/seed/populate-statements
 */
export async function POST() {
  try {
    // Use service role key to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Hardcoded IDs from known test data
    const landlord_id = '490a5a7a-96ff-4125-adf9-f22cac857306'
    const property_id = 'ca695fe6-235a-4ca4-a6f5-b2a4126a7464'

    // Statement data
    const statements = [
      { ref: 'LS0793', date: '2025-07-07', start: '2025-07-01', end: '2025-07-31', gross: 6780.00, mgmt: 813.60, charges: 567.28, net: 5399.12 },
      { ref: 'LS0801', date: '2025-08-07', start: '2025-08-01', end: '2025-08-31', gross: 6400.00, mgmt: 768.00, charges: 618.48, net: 5013.52 },
      { ref: 'LS0817', date: '2025-09-07', start: '2025-09-01', end: '2025-09-30', gross: 7000.00, mgmt: 840.00, charges: 625.26, net: 5534.74 },
      { ref: 'LS0833', date: '2025-10-07', start: '2025-10-01', end: '2025-10-31', gross: 5800.00, mgmt: 696.00, charges: 540.02, net: 4563.98 },
      { ref: 'LS0852', date: '2025-11-07', start: '2025-11-01', end: '2025-11-30', gross: 5200.00, mgmt: 624.00, charges: 977.18, net: 3599.82 },
      { ref: 'LS0893', date: '2025-11-14', start: '2025-11-14', end: '2025-12-31', gross: 2000.00, mgmt: 240.00, charges: 761.86, net: 998.14 },
      { ref: 'LS0901', date: '2025-12-07', start: '2025-12-01', end: '2025-12-31', gross: 5700.00, mgmt: 684.00, charges: 469.16, net: 4546.84 },
      { ref: 'LS0919', date: '2026-01-07', start: '2026-01-01', end: '2026-01-31', gross: 7100.00, mgmt: 852.00, charges: 604.98, net: 5643.02 },
      { ref: 'LS0932', date: '2026-02-07', start: '2026-02-01', end: '2026-02-28', gross: 7700.00, mgmt: 924.00, charges: 894.64, net: 4881.36 },
      { ref: 'LS0948', date: '2026-03-07', start: '2026-03-01', end: '2026-03-31', gross: 6300.00, mgmt: 756.00, charges: 585.74, net: 4958.26 },
      { ref: 'LS0959', date: '2026-04-07', start: '2026-04-01', end: '2026-04-30', gross: 6200.00, mgmt: 744.00, charges: 532.96, net: 4924.04 },
      { ref: 'LS0975', date: '2026-05-07', start: '2026-05-01', end: '2026-05-31', gross: 5600.00, mgmt: 672.00, charges: 407.98, net: 3520.02 },
      { ref: 'LS0978', date: '2026-05-14', start: '2026-05-14', end: '2026-06-30', gross: 2400.00, mgmt: 288.00, charges: 179.23, net: 1932.77 },
      { ref: 'LS0987', date: '2026-06-07', start: '2026-06-01', end: '2026-06-30', gross: 5650.00, mgmt: 678.00, charges: 445.02, net: 3526.98 },
      { ref: 'LS1001', date: '2026-07-07', start: '2026-07-01', end: '2026-07-31', gross: 7200.00, mgmt: 864.00, charges: 645.77, net: 5690.23 },
    ]

    let success = 0
    const errors: string[] = []

    for (const stmt of statements) {
      const stmtId = randomUUID()

      // Insert statement
      const { data, error: stmtError } = await supabase
        .from('landlord_statements')
        .insert({
          id: stmtId,
          landlord_id,
          property_id,
          statement_reference: stmt.ref,
          statement_date: stmt.date,
          period_start: stmt.start,
          period_end: stmt.end,
          gross_rent: stmt.gross,
          management_fees: stmt.mgmt,
          property_charges: stmt.charges,
          net_to_landlord: stmt.net,
          amount_paid: stmt.net,
        })

      if (stmtError) {
        errors.push(`${stmt.ref}: ${stmtError.message}`)
      } else {
        success++
      }
    }

    return NextResponse.json({
      success: true,
      imported: success,
      total: statements.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
