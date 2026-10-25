// The let-only lettings statement for one tenancy (format of 003KFT02 - Statement.pdf): rent and deposit received,
// our letting fee, and the balance paid to the landlord's account. Pulled from the tenancy, the room, the property's
// bank details and fee, the tenant and the landlord. Used by /api/lettings-statement/[tenancyId] and by the landlord's
// "Signed & paid" update, which attaches it (17 Oct 2026).
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateLettingsStatementPDF } from '@/lib/lettingsStatement/generatePDF'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { inlineAddress } from '@/lib/formatAddress'

export async function lettingsStatementFor(s: SupabaseClient, tenancyId: string): Promise<{ buffer: Buffer; filename: string } | { error: string }> {
  const supabase = s

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
            id, salutation, first_name, last_name, full_name, email, phone, home_address
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

  if (error || !tenancy) return { error: 'Tenancy not found' }

  const room     = (tenancy.rooms as any)
  const property = room?.properties as any
  const landlord = property?.people as any
  const tenant   = (tenancy as any).people as any

  if (!property) return { error: 'Property not found' }
  // a statement with a blank rent or deposit would show the landlord £0 — say what's missing instead (it used to crash)
  // once initial monies are recorded (migration 231), the statement shows exactly what came in and the fee taken
  const { data: im } = await supabase.from('initial_monies').select('first_rent, deposit, fee, holding_amount, paid_on, paid_reference').eq('tenancy_id', tenancyId).is('voided_at', null).maybeSingle()
  if (im) {
    ;(tenancy as any).rent_amount = Number((im as any).first_rent)
    ;(tenancy as any).deposit_amount = Number((im as any).deposit)
    ;(tenancy as any).rent_in_advance = 1
    ;(tenancy as any).letting_fee_charged = Number((im as any).fee)
    ;(tenancy as any).holding_deposit_received = Number((im as any).holding_amount)
  }
  if (tenancy.rent_amount == null) return { error: 'Add the rent on the letting file (Terms) first' }
  if (tenancy.deposit_amount == null) return { error: 'Add the deposit amount on the letting file (Terms) first' }

  // ── Build landlord address ───────────────────────────────────────────────
  const landlordName = landlord
    ? ([landlord.salutation, landlord.first_name, landlord.last_name].filter(Boolean).join(' ') || landlord.full_name || 'Landlord')
    : 'Landlord'

  const landlordAddrParts = String(landlord?.home_address || '').split(/\n|,\s*/).map((l: string) => l.trim()).filter(Boolean)
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
    paidOn: (im as any)?.paid_on ?? undefined,   // once the landlord's payment is recorded the statement says it went
    statementDate: new Date().toISOString(),
    bizSettings,
  })

  const filename = `CR-Lettings-Statement_${sanitise(room.name)}_${sanitise(property.name)}_${new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })}.pdf`
  return { buffer, filename }
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
