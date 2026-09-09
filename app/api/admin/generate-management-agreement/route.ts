// POST /api/admin/generate-management-agreement
// Accepts ManagementAgreementData JSON, returns a PDF download.
// No auth check — follows same pattern as other admin API routes in this codebase.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateManagementAgreementPDF, type ManagementAgreementData } from '@/lib/managementAgreement/generatePDF'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const body: ManagementAgreementData & { onboardingId?: string } = await req.json()

    if (!body.properties?.length || !body.clientAddress?.length) {
      return NextResponse.json(
        { error: 'properties and clientAddress are required' },
        { status: 400 }
      )
    }

    const bizSettings = await fetchPDFBizSettings()

    const buffer = await generateManagementAgreementPDF({ ...body, bizSettings })

    const typeLabel = body.agreementType === 'hmo' ? 'Multi-Let' : 'Single-Let'
    const propSlug  = (body.properties[0] ?? 'Agreement').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)
    const dateSlug  = (body.agreementDate ?? new Date().toISOString()).slice(0, 10)
    const filename  = `Capital-Rooms-Management-Agreement_${typeLabel}_${propSlug}_${dateSlug}.pdf`

    // Best-effort: log the generation to Supabase (does not block the response)
    try {
      const sb = serviceClient()
      const logId       = crypto.randomUUID()
      const storagePath = `management-agreements/${logId}.pdf`

      await sb.storage
        .from('valuations')   // reuse existing valuations bucket
        .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false })

      // If an onboarding record ID was supplied, record the generated agreement link on it
      if (body.onboardingId) {
        await sb.from('landlord_onboarding')
          .update({
            agreement_pdf_path: storagePath,
            agreement_generated_at: new Date().toISOString(),
          })
          .eq('id', body.onboardingId)
      }
    } catch (logErr) {
      console.error('[generate-management-agreement] log error:', logErr)
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length':      String(buffer.length),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[generate-management-agreement]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
