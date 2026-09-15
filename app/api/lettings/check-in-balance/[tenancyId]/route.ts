/**
 * GET /api/lettings/check-in-balance/[tenancyId]
 *
 * Generates a Check-In Balance Demand PDF for the given tenancy.
 *
 * Query params:
 *   ?mode=full        (default) — first payment is a full calendar month from start date
 *   ?mode=prorata     — first payment is pro-rated for remaining days in the start month
 *   ?prorata_amount=X — override the pro-rata amount (optional; calculated if omitted)
 *   ?extra_names=Name+Two,Name+Three — comma-separated additional tenant names (for joint tenancies)
 *
 * Auth: Bearer token (cookie auth is broken in this Next.js version).
 * Role: any authenticated admin/lettings user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateCheckInBalancePDF } from '@/lib/checkInBalance/generatePDF'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: { tenancyId: string } }
) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = serviceClient()
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Query params ──────────────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url)
  const mode           = (searchParams.get('mode') ?? 'full') as 'full' | 'prorata'
  const proRataAmount  = searchParams.get('prorata_amount')
    ? parseFloat(searchParams.get('prorata_amount')!)
    : undefined
  const extraNamesRaw  = searchParams.get('extra_names')
  const extraNames     = extraNamesRaw ? extraNamesRaw.split(',').map(s => s.trim()).filter(Boolean) : []

  // ── Fetch tenancy + joins ─────────────────────────────────────────────────────
  const { data: tenancy, error: tErr } = await sb
    .from('tenancies')
    .select(`
      id,
      start_date,
      rent_monthly,
      deposit_amount,
      holding_deposit_received,
      payment_reference,
      tenant_id,
      room_id,
      people!tenancies_tenant_id_fkey (
        first_name,
        last_name
      ),
      rooms (
        name,
        property_id,
        properties (
          name,
          address,
          bank_account_name,
          bank_sort_code,
          bank_account_number,
          bank_iban,
          bank_payment_ref,
          letting_type
        )
      )
    `)
    .eq('id', params.tenancyId)
    .maybeSingle()

  if (tErr || !tenancy) {
    return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  }

  // ── Build data ────────────────────────────────────────────────────────────────
  const person    = (tenancy as any).people
  const room      = (tenancy as any).rooms
  const property  = room?.properties

  if (!person || !room || !property) {
    return NextResponse.json({ error: 'Incomplete tenancy data' }, { status: 422 })
  }

  // Primary tenant name
  const primaryName = [person.first_name, person.last_name].filter(Boolean).join(' ')
  const tenantNames = [primaryName, ...extraNames].filter(Boolean)

  // Property address: for HMO rooms include room name; for single-let just property address
  const isHmo = property.letting_type !== 'let_only' && room.name
  const propertyAddress = isHmo
    ? `${room.name}, ${property.address}`
    : property.address

  // Bank details — fall back to Capital Rooms own account if no property bank set
  const bankName  = property.bank_account_name  || 'Capital Rooms Ltd'
  const sortCode  = property.bank_sort_code      || '20-18-93'
  const accountNo = property.bank_account_number || '4016 2574'
  const iban      = property.bank_iban           || 'GB19 BUKB 2018 9340 1625 74'
  const swift     = 'BUKBGB22'

  // Payment reference: use tenancy-level ref if set, else property base ref
  const paymentRef = tenancy.payment_reference || property.bank_payment_ref || ''

  const holdingDeposit = Number(tenancy.holding_deposit_received ?? 0)
  const depositAmount  = Number(tenancy.deposit_amount ?? 0)
  const rentMonthly    = Number(tenancy.rent_monthly ?? 0)

  const bizSettings = await fetchPDFBizSettings()

  // ── Generate PDF ──────────────────────────────────────────────────────────────
  const buffer = await generateCheckInBalancePDF({
    tenantNames,
    propertyAddress,
    rentMonthly,
    depositAmount,
    holdingDeposit,
    startDate:    tenancy.start_date,
    rentMode:     mode,
    proRataAmount,
    paymentRef,
    bankName,
    sortCode,
    accountNo,
    iban,
    swift,
    bizSettings,
  })

  // ── Filename ──────────────────────────────────────────────────────────────────
  const safeName  = primaryName.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 30)
  const startSlug = tenancy.start_date?.slice(0, 10) ?? 'unknown'
  const filename  = `Check-In-Balance_${safeName}_${startSlug}.pdf`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
