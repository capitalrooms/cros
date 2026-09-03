import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

// POST /api/reference-import/apply
// Body: { personId, tenancyId?, referenceData, appliedFields }
// appliedFields: string[] of field names to also write to people table

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || !['administrator', 'admin', 'lettings'].includes(user.assignment?.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { personId, tenancyId, referenceData, appliedFields } = await req.json()
  if (!personId || !referenceData) {
    return NextResponse.json({ error: 'personId and referenceData required' }, { status: 400 })
  }

  const supabase = createClient()

  // 1. Insert into tenant_references
  const refRow = {
    person_id:                  personId,
    tenancy_id:                 tenancyId ?? null,
    reference_source:           referenceData.reference_source ?? null,
    report_date:                referenceData.report_date ?? null,
    imported_by:                user.id ?? null,
    overall_decision:           referenceData.overall_decision ?? null,
    legal_name:                 referenceData.legal_name ?? null,
    date_of_birth:              referenceData.date_of_birth ?? null,
    nationality:                referenceData.nationality ?? null,
    current_address:            referenceData.current_address ?? null,
    id_type_1:                  referenceData.id_type_1 ?? null,
    id_ref_1:                   referenceData.id_ref_1 ?? null,
    id_verified_1:              referenceData.id_verified_1 ?? false,
    id_type_2:                  referenceData.id_type_2 ?? null,
    id_ref_2:                   referenceData.id_ref_2 ?? null,
    id_verified_2:              referenceData.id_verified_2 ?? false,
    right_to_rent_status:       referenceData.right_to_rent_status ?? null,
    right_to_rent_from:         referenceData.right_to_rent_from ?? null,
    right_to_rent_until:        referenceData.right_to_rent_until ?? null,
    right_to_rent_check_date:   referenceData.right_to_rent_check_date ?? null,
    right_to_rent_ref:          referenceData.right_to_rent_ref ?? null,
    right_to_rent_checker:      referenceData.right_to_rent_checker ?? null,
    verified_income_annual:     referenceData.verified_income_annual ?? null,
    verified_income_monthly:    referenceData.verified_income_monthly ?? null,
    max_affordable_rent_monthly:referenceData.max_affordable_rent_monthly ?? null,
    affordability_ratio:        referenceData.affordability_ratio ?? null,
    credit_result:              referenceData.credit_result ?? null,
    credit_notes:               referenceData.credit_notes ?? null,
    active_judgments:           referenceData.active_judgments ?? 0,
    satisfied_judgments:        referenceData.satisfied_judgments ?? 0,
    active_bais:                referenceData.active_bais ?? false,
    prev_landlord_ref_result:   referenceData.prev_landlord_ref_result ?? null,
    prev_landlord_ref_name:     referenceData.prev_landlord_ref_name ?? null,
    prev_landlord_ref_notes:    referenceData.prev_landlord_ref_notes ?? null,
    aml_result:                 referenceData.aml_result ?? null,
    aml_notes:                  referenceData.aml_notes ?? null,
    previous_addresses:         referenceData.previous_addresses ?? [],
    raw_extracted:              referenceData,
  }

  const { error: refErr } = await supabase.from('tenant_references').insert(refRow)
  if (refErr) return NextResponse.json({ error: refErr.message }, { status: 500 })

  // 2. Apply selected fields to people table
  if (appliedFields?.length) {
    const fieldMap: Record<string, string> = {
      legal_name:             'name',
      date_of_birth:          'date_of_birth',
      nationality:            'nationality',
      right_to_rent_until:    'right_to_rent_until',
      right_to_rent_ref:      'right_to_rent_ref',
      verified_income_annual: 'verified_income_annual',
      credit_result:          'credit_check_result',
      overall_decision:       'reference_status',
    }

    const peopleUpdate: Record<string, any> = {}
    for (const field of appliedFields) {
      const col = fieldMap[field]
      if (col && referenceData[field] != null) {
        peopleUpdate[col] = referenceData[field]
      }
    }

    if (Object.keys(peopleUpdate).length) {
      const { error: pErr } = await supabase.from('people').update(peopleUpdate).eq('id', personId)
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
