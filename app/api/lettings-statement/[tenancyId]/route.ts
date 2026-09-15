// GET /api/lettings-statement/[tenancyId]
// Generates a Capital Rooms Lettings Statement PDF for a let-only tenancy.
// Pulls tenancy, room, property (bank details + fee), tenant, landlord from DB.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateLettingsStatementPDF } from '@/lib/lettingsStatement/generatePDF'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { inlineAddress } from '@/lib/formatAddress'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { tenancyId: string } }
) {
  const supabase = serviceClient()
  const { tenancyId } = params

  // ── Fetch tenancy with all related data ──────────────────────────────────
  const { data: tenancy, error } = await supabase
    .from('tenancies')
    .select(`
      id, start_date, end_date, rent_amount, deposit_amount,
      rent_in_advance, payment_reference, holding_deposit_received, letting_fee_charged,
      rooms (
        id, name, property_id,
        properties (
          id, name, address, property_code,
          letting_type, letting_fee_pct, letting_fee_flat,
          bank_account_name, bank_sort_code, bank_account_number,
          bank_iban, bank_swift, bank_payment_ref,
          people!landlord_id (
            id, first_name, last_name, full_name, email, phone,
            address_line1, address_line2, city, postcode
          )
        )
      ),
      people!person_id (
        id, salutation, first_name, last_name, email, phone,
        date_of_birth, nationality, occupation
      )
    `)
    .eq('id', tenancyId)
    .maybeSingle()

  if (error || !tenancy) {
    return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  }

  const room     = (tenancy.rooms as any)
  const property = room?.properties as any
  const landlord = property?.people as any
  const tenant   = (tenancy as any).people as any

  if (!property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  // ── Build landlord address ───────────────────────────────────────────────
  const landlordName = landlord
    ? (landlord.full_name || [landlord.first_name, landlord.last_name].filter(Boolean).join(' ') || 'Landlord')
    : 'Landlord'

  const landlordAddrParts = [
    landlord?.address_line1,
    landlord?.address_line2,
    landlord?.city,
    landlord?.postcode,
  ].filter(Boolean)
  const landlordAddress = landlordAddrParts.join('\n') || ''

  // ── Tenant notes: DOB + occupation ──────────────────────────────────────
  const tenantNoteParts: string[] = []
  if (tenant?.date_of_birth) {
    tenantNoteParts.push(new Date(tenant.date_of_birth).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))
  }
  if (tenant?.nationality) tenantNoteParts.push(tenant.nationality)
  if (tenant?.occupation)  tenantNoteParts.push(tenant.occupation)

  // ── Determine fee ────────────────────────────────────────────────────────
  const feeCharged = (tenancy as any).letting_fee_charged
  const feePct     = feeCharged != null ? null : property.letting_fee_pct
  const feeFlat    = feeCharged != null ? feeCharged : property.letting_fee_flat

  // ── Auto payment reference if not set ────────────────────────────────────
  const paymentRef = (tenancy as any).payment_reference
    || buildPaymentRef(property.bank_payment_ref || property.property_code, room.name, tenancy.start_date)

  // ── Generate PDF ─────────────────────────────────────────────────────────
  const bizSettings = await fetchPDFBizSettings()

  const buffer = await generateLettingsStatementPDF({
    landlordName,
    landlordAddress,
    roomName: room.name,
    propertyAddress: inlineAddress(property.address),
    startDate: tenancy.start_date,
    rentAmount: tenancy.rent_amount,
    depositAmount: tenancy.deposit_amount,
    rentInAdvance: tenancy.rent_in_advance ?? 1,
    tenantSalutation: tenant?.salutation,
    tenantFirstName:  tenant?.first_name ?? '',
    tenantLastName:   tenant?.last_name  ?? '',
    tenantPhone:  tenant?.phone,
    tenantEmail:  tenant?.email,
    tenantNotes:  tenantNoteParts.length ? tenantNoteParts.join(' · ') : undefined,
    lettingFeePct:  feePct  ?? undefined,
    lettingFeeFlat: feeFlat ?? undefined,
    holdingDepositReceived: (tenancy as any).holding_deposit_received ?? undefined,
    bankName: undefined, // not stored — landlord's bank name not in schema yet
    bankAccountName:  property.bank_account_name ?? landlordName,
    bankSortCode:     property.bank_sort_code,
    bankAccountNumber: property.bank_account_number,
    paymentReference: paymentRef,
    statementDate: new Date().toISOString(),
    bizSettings,
  })

  const filename = `CR-Lettings-Statement_${sanitise(room.name)}_${sanitise(property.name)}_${new Date().toISOString().slice(0, 10)}.pdf`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitise(s: string) {
  return s.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 30)
}

function buildPaymentRef(base: string | undefined, roomName: string | undefined, startDate: string | undefined): string {
  const d = startDate ? new Date(startDate) : new Date()
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const roomSuffix = roomName?.replace(/[^0-9]/g, '').padStart(2, '0') ?? '01'
  return `B${dateStr}${(base ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase()}${roomSuffix}`
}
