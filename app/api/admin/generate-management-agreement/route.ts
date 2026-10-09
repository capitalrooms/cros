// POST /api/admin/generate-management-agreement
// Accepts ManagementAgreementData JSON, returns a PDF download.
// No auth check — follows same pattern as other admin API routes in this codebase.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'
import { generateManagementAgreementPDF, type ManagementAgreementData } from '@/lib/managementAgreement/generatePDF'
import { generateManagementAgreementDocx } from '@/lib/managementAgreement/docx'
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
  const caller = await requireStaff(req as any)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body: ManagementAgreementData & { onboardingId?: string; preview?: boolean; savedId?: string; form?: Record<string, unknown>; format?: 'pdf' | 'docx' } = await req.json()

    if (!body.properties?.length || !body.clientAddress?.length) {
      return NextResponse.json(
        { error: 'properties and clientAddress are required' },
        { status: 400 }
      )
    }

    const bizSettings = await fetchPDFBizSettings()

    // An editable Word copy (for a landlord who wants to suggest changes) — same words as the PDF; nothing is saved
    if (body.format === 'docx') {
      const docx = await generateManagementAgreementDocx({ ...body, bizSettings })
      const kind = body.agreementType === 'hmo' ? 'Multi-Let' : body.agreementType === 'rent_collection' ? 'Rent-Collection' : 'Single-Let'
      const name = `Capital-Rooms-Management-Agreement_${kind}_${(body.properties[0] ?? 'Agreement').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)}_${(body.agreementDate ?? new Date().toISOString()).slice(0, 10)}.docx`
      return new NextResponse(new Uint8Array(docx), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="${name}"` } })
    }

    const buffer = await generateManagementAgreementPDF({ ...body, bizSettings })

    const typeLabel = body.agreementType === 'hmo' ? 'Multi-Let' : body.agreementType === 'rent_collection' ? 'Rent-Collection' : 'Single-Let'
    const propSlug  = (body.properties[0] ?? 'Agreement').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)
    const dateSlug  = (body.agreementDate ?? new Date().toISOString()).slice(0, 10)
    const filename  = `Capital-Rooms-Management-Agreement_${typeLabel}_${propSlug}_${dateSlug}.pdf`

    // Best-effort: log the generation to Supabase (does not block the response). Check copies (preview) aren't kept.
    let savedId: string | null = null
    if (!body.preview) try {
      const sb = serviceClient()
      const logId       = crypto.randomUUID()
      const storagePath = `management-agreements/${logId}.pdf`

      await sb.storage
        .from('valuations')   // reuse existing valuations bucket
        .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false })

      // If an onboarding record ID was supplied, record the generated agreement link on it
      // Kept as the record's "agreement as sent" so the AML review can compare against it.
      // The saved entry (migration 201): reopened later to edit, rather than writing it all out again
      if (body.form) {
        const clientName = body.entityType === 'company' ? (body.companyName ?? '')
          : [[body.clientTitle, body.clientFirstName, body.clientLastName].filter(Boolean).join(' '), [body.client2Title, body.client2FirstName, body.client2LastName].filter(Boolean).join(' ')].filter(Boolean).join(' & ')
        const row = { agreement_type: body.agreementType, client_name: clientName, properties: body.properties, form: body.form, pdf_path: storagePath, onboarding_id: body.onboardingId || null, updated_by: caller.email, updated_at: new Date().toISOString() }
        const { data: prev } = body.savedId ? await sb.from('management_agreements').select('id, version').eq('id', body.savedId).is('deleted_at', null).maybeSingle() : { data: null }
        const saved = prev
          ? await sb.from('management_agreements').update({ ...row, version: (prev.version ?? 1) + 1 }).eq('id', prev.id).select('id').single()
          : await sb.from('management_agreements').insert({ ...row, created_by: caller.email }).select('id').single()
        if (saved.error) console.error('[generate-management-agreement] not saved to the list:', saved.error.message)
        else savedId = saved.data.id
      }

      if (body.onboardingId) {
        const { onboardingId, bizSettings: _biz, savedId: _sid, form: _form, ...agreementFields } = body
        void _sid; void _form
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
        ...(savedId ? { 'X-Agreement-Id': savedId } : {}),
        'Content-Length':      String(buffer.length),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[generate-management-agreement]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
