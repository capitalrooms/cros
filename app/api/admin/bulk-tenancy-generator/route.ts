/**
 * POST /api/admin/bulk-tenancy-generator
 *
 * Fills the Assured Periodic Tenancy Agreement Word template for one tenancy and
 * returns it as a PDF on the Capital Rooms letterhead.
 *
 * One agreement (public/templates/apt-ns.docx) for every batch; only the parking clause,
 * bank details and bills vary.
 *
 * Body: {
 *   template: 'apt-ns' (with parking clause) | 'apt-base' (without)
 *   tenant_name, tenant_email, property_address, start_date, when_rent_due,
 *   rent_amount, deposit, landlord_name, landlord_contact_address, landlord_email,
 *   landlord_phone, bank_account_name, bank_name, bank_sort_code,
 *   bank_account_number, payment_reference: string
 *   bills?: Partial<BillsConfig>
 *   cleaning?: { payer: 'landlord' | 'tenant' | 'none', frequency?: 'weekly' | 'fortnightly' | 'twice_monthly' | 'monthly' }
 *              (adds a cleaning row under the bills)
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateTenancyAgreement, agreementFileName } from '@/lib/tenancyAgreement/generate'
import { contentDisposition } from '@/lib/contentDisposition'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const pdf = await generateTenancyAgreement(body)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(`${agreementFileName(body)}`, 'attachment'),
      },
    })
  } catch (err: unknown) {
    console.error('bulk-tenancy generate error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}
