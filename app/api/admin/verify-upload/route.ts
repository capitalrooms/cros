import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/verify-upload
 * Body: { propertyId?, propertyName?, docType?, tenancyId? }
 *
 * Returns the most recent property_documents rows matching the query,
 * plus the cert dates currently stored on the property record.
 * Used to verify uploads landed correctly after any cert or document upload.
 */
export async function POST(request: NextRequest) {
  if (!(await requireStaff(request as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { propertyId, propertyName, docType, tenancyId, limit = 5 } = await request.json()

  // Find property if only name given
  let pid = propertyId
  if (!pid && propertyName) {
    const { data } = await supabase
      .from('properties')
      .select('id, name')
      .ilike('name', `%${propertyName}%`)
      .limit(1)
      .single()
    pid = data?.id
  }

  if (!pid && !tenancyId) {
    return NextResponse.json({ error: 'propertyId, propertyName, or tenancyId required' }, { status: 400 })
  }

  // Get recent property_documents
  let docsQuery = supabase
    .from('property_documents')
    .select('id, document_type, file_name, storage_url, uploaded_at, tenancy_id, property_id')
    .order('uploaded_at', { ascending: false })
    .limit(limit)

  if (pid) docsQuery = docsQuery.eq('property_id', pid)
  if (tenancyId) docsQuery = docsQuery.eq('tenancy_id', tenancyId)
  if (docType) docsQuery = docsQuery.eq('document_type', docType)

  const { data: docs, error: docsErr } = await docsQuery

  // Get current cert dates from properties table
  let certDates = null
  if (pid) {
    const { data: prop } = await supabase
      .from('properties')
      .select(`
        name,
        gas_safe_cert_date, gas_safe_cert_expiry,
        electrical_cert_date, electrical_cert_expiry,
        epc_expiry, epc_rating,
        fire_risk_assessment_date, fire_risk_assessment_expiry,
        fire_detection_test_date, fire_detection_expiry,
        emergency_lighting_test_date, emergency_lighting_expiry,
        pat_test_date, pat_test_expiry,
        license_date, license_expiry
      `)
      .eq('id', pid)
      .single()
    certDates = prop
  }

  return NextResponse.json({
    propertyId: pid,
    recentDocs: docs ?? [],
    certDates,
    error: docsErr?.message ?? null,
  })
}
