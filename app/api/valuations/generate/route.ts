// POST /api/valuations/generate
// Uses pdfkit (pure Node.js, no React) to generate valuation letters.
// After generating, saves a log record + uploads PDF to Supabase Storage.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'
import { generateValuationPDF } from '@/lib/valuations/generatePDF'
import { ValuationData } from '@/lib/valuations/ValuationDocument'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { contentDisposition } from '@/lib/contentDisposition'

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
    const data: ValuationData = await req.json()
    if (!data.recipientName || !data.propertyAddress) {
      return NextResponse.json({ error: 'recipientName and propertyAddress are required' }, { status: 400 })
    }

    // ── Resolve sender + biz settings (single pass — reuse for log) ──────────
    const supabase = serviceClient()
    let senderJobTitle:    string | null = null
    let senderDirectPhone: string | null = null
    let generatedById:     string | null = null

    const authHeader = req.headers.get('authorization') ?? ''
    if (authHeader.startsWith('Bearer ')) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
      if (user?.email) {
        const { data: person } = await supabase
          .from('people')
          .select('id, job_title, direct_phone')
          .eq('email', user.email)
          .maybeSingle()
        senderJobTitle    = (person as any)?.job_title    ?? null
        senderDirectPhone = (person as any)?.direct_phone ?? null
        generatedById     = (person as any)?.id           ?? null
      }
    }

    const bizSettings = await fetchPDFBizSettings()

    const buffer = await generateValuationPDF({
      ...data,
      senderJobTitle,
      senderDirectPhone,
      bizSettings,
    })

    const filename = `Capital-Rooms-Valuation_${data.propertyAddress.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)}_${new Date().toISOString().slice(0, 10)}.pdf`

    // ── Save log record + upload PDF to storage (best-effort, never blocks response) ──
    try {
      const logId       = crypto.randomUUID()
      const storagePath = `valuations/${logId}.pdf`

      await supabase.storage
        .from('valuations')
        .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false })

      await supabase.from('valuations_log').insert({
        id:               logId,
        type:             data.type,
        property_address: data.propertyAddress,
        recipient_name:   data.recipientName,
        letter_date:      data.letterDate ?? new Date().toISOString().slice(0, 10),
        generated_by:     generatedById,
        pdf_storage_path: storagePath,
        room_count:       data.rooms?.length ?? 0,
      })
    } catch (logErr) {
      // Log errors should never block the PDF response
      console.error('[valuations/generate] log error:', logErr)
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
    console.error('[valuations/generate]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
