import { requireAdmin } from '@/lib/adminAuth'
// GET /api/aml-report?landlordId=xxx&generatedBy=Harry+Jones
// Fetches landlord details + AML history and streams a PDF response.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateAMLReport } from '@/lib/aml/generateAMLReport'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { contentDisposition } from '@/lib/contentDisposition'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const landlordId  = req.nextUrl.searchParams.get('landlordId')
  const generatedBy = req.nextUrl.searchParams.get('generatedBy') ?? undefined

  if (!landlordId) {
    return NextResponse.json({ error: 'landlordId is required' }, { status: 400 })
  }

  const db = svc()

  // Landlord from people
  const { data: landlord, error: lErr } = await db
    .from('people')
    .select('id, first_name, last_name, full_name, email, phone')
    .eq('id', landlordId)
    .single()

  if (lErr || !landlord) {
    return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
  }
  const landlordName: string | null = [landlord.first_name, landlord.last_name].filter(Boolean).join(' ') || landlord.full_name || null

  // Properties linked to this landlord
  // (sole or joint landlord — properties.landlord_id / landlord_id_2)
  const { data: propRows } = await db
    .from('properties')
    .select('name, address')
    .or(`landlord_id.eq.${landlordId},landlord_id_2.eq.${landlordId}`)

  const properties = (propRows ?? [])
    .map((p: any) => p.name ?? p.address)
    .filter(Boolean) as string[]

  // AML onboarding records
  const { data: records } = await db
    .from('landlord_onboarding')
    .select('id, is_refresh, stage, created_at, docs_received_at, entity_type')
    .eq('landlord_people_id', landlordId)
    .order('created_at', { ascending: false })

  const amlRecords = (records ?? []).map((r: any) => ({
    type:        r.is_refresh ? 'refresh' as const : 'initial' as const,
    requestedAt: r.created_at,
    completedAt: r.docs_received_at ?? undefined,
    entityType:  r.entity_type ?? undefined,
    stage:       r.stage,
  }))

  const bizSettings = await fetchPDFBizSettings()

  const buffer = await generateAMLReport({
    landlord: {
      name:       landlordName ?? landlord.email,
      email:      landlord.email,
      phone:      landlord.phone ?? undefined,
      properties,
    },
    records: amlRecords,
    generatedBy,
    generatedAt: new Date().toISOString(),
    bizSettings,
  })

  const safeName = (landlordName ?? 'Landlord').replace(/[^a-zA-Z0-9 ]+/g, '').trim().replace(/ +/g, '-')
  const filename = `Capital-Rooms-AML-Record_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': contentDisposition(`${filename}`, 'attachment'),
      'Content-Length':      String(buffer.length),
    },
  })
}
