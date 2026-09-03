// GET /api/valuations/history
// Returns the most recent valuations_log entries (newest first).
// Also handles GET /api/valuations/history?id=<logId>&download=1 to fetch the stored PDF.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const logId   = searchParams.get('id')
    const download = searchParams.get('download') === '1'

    const supabase = serviceClient()

    // ── Download a specific PDF ──
    if (logId && download) {
      const { data: row } = await supabase
        .from('valuations_log')
        .select('pdf_storage_path, property_address, generated_at')
        .eq('id', logId)
        .maybeSingle()

      if (!row?.pdf_storage_path) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      const { data: fileData, error } = await supabase.storage
        .from('valuations')
        .download(row.pdf_storage_path)

      if (error || !fileData) {
        return NextResponse.json({ error: 'File not found in storage' }, { status: 404 })
      }

      const buf = Buffer.from(await fileData.arrayBuffer())
      const safe = row.property_address.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)
      const date = row.generated_at.slice(0, 10)
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Capital-Rooms-Valuation_${safe}_${date}.pdf"`,
        },
      })
    }

    // ── List recent history ──
    const { data, error } = await supabase
      .from('valuations_log')
      .select('id, type, property_address, recipient_name, letter_date, generated_at, room_count, pdf_storage_path')
      .order('generated_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return NextResponse.json({ rows: data ?? [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[valuations/history]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
