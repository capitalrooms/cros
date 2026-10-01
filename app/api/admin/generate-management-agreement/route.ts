// POST /api/admin/generate-management-agreement
// Accepts ManagementAgreementData JSON, returns a PDF download.
// No auth check — follows same pattern as other admin API routes in this codebase.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'
import { generateManagementAgreementPDF, type ManagementAgreementData } from '@/lib/managementAgreement/generatePDF'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { contentDisposition } from '@/lib/contentDisposition'

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
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body: ManagementAgreementData & { onboardingId?: string; preview?: boolean } = await req.json()

    if (!body.properties?.length || !body.clientAddress?.length) {
      return NextResponse.json(
        { error: 'properties and clientAddress are required' },
        { status: 400 }
      )
    }

    const bizSettings = await fetchPDFBizSettings()

    const buffer = await generateManagementAgreementPDF({ ...body, bizSettings })

    const typeLabel = body.agreementType === 'hmo' ? 'Multi-Let' : body.agreementType === 'rent_collection' ? 'Rent-Collection' : 'Single-Let'
    const propSlug  = (body.properties[0] ?? 'Agreement').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)
    const dateSlug  = (body.agreementDate ?? new Date().toISOString()).slice(0, 10)
    const filename  = `Capital-Rooms-Management-Agreement_${typeLabel}_${propSlug}_${dateSlug}.pdf`

    // Best-effort: log the generation to Supabase (does not block the response). Check copies (preview) aren't kept.
    if (!body.preview) try {
      const sb = serviceClient()
      const logId       = crypto.randomUUID()
      const storagePath = `management-agreements/${logId}.pdf`

      await sb.storage
        .from('valuations')   // reuse existing valuations bucket
        .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false })

      // If an onboarding record ID was supplied, record the generated agreement link on it
      // Kept as the record's "agreement as sent" so the AML review can compare against it.
      if (body.onboardingId) {
        const { onboardingId, bizSettings: _biz, ...agreementFields } = body
        void _biz
        const { data: ob } = await sb.from('landlord_onboarding').select('form_data').eq('id', onboardingId).maybeSingle()
        if (ob) {
          const fd = (ob.form_data ?? {}) as Record<string, unknown>
          const prev = fd.__agreement as { version?: number } | undefined
          await sb.from('landlord_onboarding').update({
            form_data: {
              ...fd,
              __agreement: { ...agreementFields, sent_at: new Date().toISOString(), version: (prev?.version ?? 0) + 1, pdf_path: storagePath },
              ...(prev ? { __agreement_history: [...((fd.__agreement_history as unknown[]) ?? []), prev] } : {}),
            },
          }).eq('id', onboardingId)
        }
      }
    } catch (logErr) {
      console.error('[generate-management-agreement] log error:', logErr)
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': contentDisposition(`${filename}`, 'attachment'),
        'Content-Length':      String(buffer.length),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[generate-management-agreement]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
